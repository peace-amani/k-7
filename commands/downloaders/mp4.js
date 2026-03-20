import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { proxyFetch } from '../../lib/proxyFetch.js';

const XCASPER_BASE  = 'https://apis.xcasper.space/api/downloader';
const GIFTED_BASE   = 'https://api.giftedtech.co.ke/api/download';
const GIFTED_ENDS   = ['ytv', 'dlmp4', 'ytmp4'];

// ── xcasper ytmp6 (PRIMARY) ────────────────────────────────────
async function xcasperYtmp6(url) {
    try {
        const res = await axios.get(`${XCASPER_BASE}/ytmp6`, {
            params: { url },
            timeout: 30000
        });
        const d = res.data;
        if (!d?.success || !d?.url) {
            console.log(`[mp4/ytmp6] no URL: ${d?.message || 'unknown'}`);
            return null;
        }
        console.log(`[mp4/ytmp6] got URL (format=${d.format}, quality=${d.quality}), downloading...`);
        const buf = await proxyFetch(d.url, 150_000);
        if (!buf || buf.length < 10_000) {
            console.log(`[mp4/ytmp6] buffer too small: ${buf?.length || 0}`);
            return null;
        }
        // Validate MP4 magic bytes (bytes 4-7: ftyp / moov)
        const sig = buf.slice(4, 8).toString('ascii');
        if (!['ftyp', 'free', 'moov', 'mdat'].includes(sig)) {
            console.log(`[mp4/ytmp6] not MP4 bytes (sig="${sig}"), skipping`);
            return null;
        }
        const mb = (buf.byteLength / 1024 / 1024).toFixed(1);
        console.log(`[mp4/ytmp6] ✅ ${mb}MB valid MP4`);
        return { buf, title: d.title || '', quality: d.quality || '360p', thumbnail: d.thumbnail || '' };
    } catch (e) {
        console.log(`[mp4/ytmp6] error: ${e.message}`);
        return null;
    }
}

// ── Gifted fallback chain ─────────────────────────────────────
async function giftedFallback(input) {
    for (const ep of GIFTED_ENDS) {
        try {
            const res = await axios.get(`${GIFTED_BASE}/${ep}`, {
                params: { apikey: 'gifted', url: input },
                timeout: 30000
            });
            if (res.data?.success && res.data?.result?.download_url) {
                return { data: res.data.result, endpoint: ep };
            }
        } catch {}
    }
    return null;
}

async function downloadBuffer(url, timeout = 120000) {
    const res = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout,
        maxRedirects: 5,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        validateStatus: s => s >= 200 && s < 400
    });
    const buf = Buffer.from(res.data);
    if (buf.length < 5000) throw new Error('File too small, likely not video');
    const hdr = buf.slice(0, 50).toString('utf8').toLowerCase();
    if (hdr.includes('<!doctype') || hdr.includes('<html') || hdr.includes('bad gateway')) {
        throw new Error('Received HTML instead of video');
    }
    return buf;
}

export default {
    name: 'mp4',
    aliases: ['wolfmp4', 'wvideo'],
    description: 'Download MP4 video',
    category: 'Downloader',
    usage: 'mp4 <url or video name>',

    async execute(sock, m, args, prefix) {
        const jid = m.key.remoteJid;
        const quotedText = m.quoted?.text?.trim()
            || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim()
            || '';
        const searchQuery = args.length > 0 ? args.join(' ') : quotedText;

        if (!searchQuery) {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 🎬 *MP4 DOWNLOADER* ⌋\n│\n├─⊷ *${prefix}mp4 <video name or URL>*\n│  └⊷ Download video\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });
        }

        console.log(`🎬 [MP4] Request: ${searchQuery}`);
        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            const isUrl = /^https?:\/\//i.test(searchQuery);
            let videoBuffer, title, quality, thumbnail, source;

            // ── PRIMARY: xcasper ytmp6 (YouTube URLs only) ──
            if (isUrl && /youtube\.com|youtu\.be/i.test(searchQuery)) {
                const r = await xcasperYtmp6(searchQuery);
                if (r?.buf) {
                    videoBuffer = r.buf;
                    title       = r.title;
                    quality     = r.quality;
                    thumbnail   = r.thumbnail;
                    source      = 'ytmp6';
                }
            }

            // ── FALLBACK: Gifted API chain ──
            if (!videoBuffer) {
                console.log(`[MP4] xcasper ytmp6 skipped/failed, trying Gifted...`);
                const r = await giftedFallback(searchQuery);
                if (!r) {
                    await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                    return sock.sendMessage(jid, {
                        text: `❌ *Download Failed*\n\nAll video services are currently unavailable. Try again later.`
                    }, { quoted: m });
                }
                title     = r.data.title;
                quality   = r.data.quality;
                thumbnail = r.data.thumbnail;
                source    = r.endpoint;

                console.log(`🎬 [MP4] Found via Gifted/${source}: ${title}`);
                await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });
                videoBuffer = await downloadBuffer(r.data.download_url);
            } else {
                await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });
            }

            const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
            if (parseFloat(fileSizeMB) > 99) {
                await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                return sock.sendMessage(jid, { text: `❌ Video too large: ${fileSizeMB}MB (max 99MB)` }, { quoted: m });
            }

            let thumbnailBuffer = null;
            if (thumbnail) {
                try {
                    const tr = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
                    if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
                } catch {}
            }

            const cleanTitle = (title || 'video').replace(/[^\w\s.-]/gi, '').substring(0, 50);

            await sock.sendMessage(jid, {
                video:    videoBuffer,
                mimetype: 'video/mp4',
                caption:  `🎬 *${title || 'Video'}*\n📹 *Quality:* ${quality || 'HD'}\n📦 *Size:* ${fileSizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*`,
                fileName: `${cleanTitle}.mp4`,
                thumbnail: thumbnailBuffer,
                gifPlayback: false
            }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
            console.log(`✅ [MP4] Success: ${title} (${fileSizeMB}MB) via ${source}`);

        } catch (error) {
            console.error('❌ [MP4] Error:', error.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, {
                text: `❌ *MP4 Error:* ${error.message}`
            }, { quoted: m });
        }
    }
};
