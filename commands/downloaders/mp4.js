import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { proxyFetch } from '../../lib/proxyFetch.js';
import { xwolfSearch } from '../../lib/xwolfApi.js';
import { xcasperVideo } from '../../lib/xcasperApi.js';
import { keithVideo } from '../../lib/keithApi.js';

const XCASPER_BASE = 'https://apis.xcasper.space/api/downloader';

// ── xcasper ytmp6 (PRIMARY) ────────────────────────────────────
async function xcasperYtmp6(ytUrl) {
    try {
        const res = await axios.get(`${XCASPER_BASE}/ytmp6`, {
            params: { url: ytUrl },
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
        const sig = buf.slice(4, 8).toString('ascii');
        if (!['ftyp', 'free', 'moov', 'mdat'].includes(sig)) {
            console.log(`[mp4/ytmp6] not MP4 bytes (sig="${sig}"), skipping`);
            return null;
        }
        console.log(`[mp4/ytmp6] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB`);
        return { buf, title: d.title || '', quality: d.quality || '360p', thumbnail: d.thumbnail || '' };
    } catch (e) {
        console.log(`[mp4/ytmp6] error: ${e.message}`);
        return null;
    }
}

async function downloadBuffer(url, timeout = 120000) {
    const res = await axios({
        url, method: 'GET', responseType: 'arraybuffer', timeout,
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
        const p = prefix || '.';
        const quotedText = m.quoted?.text?.trim()
            || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim()
            || '';
        const searchQuery = args.length > 0 ? args.join(' ') : quotedText;

        if (!searchQuery) {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 🎬 *MP4 DOWNLOADER* ⌋\n│\n├─⊷ *${p}mp4 <video name or URL>*\n│  └⊷ Download video\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });
        }

        console.log(`🎬 [MP4] Request: ${searchQuery}`);
        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            const isUrl = /^https?:\/\//i.test(searchQuery);
            let ytUrl = searchQuery;
            let trackTitle = searchQuery;
            let thumbnail = '';

            // ── Step 1: resolve name → YouTube URL ──
            if (!isUrl) {
                const items = await xwolfSearch(searchQuery, 3);
                if (items.length) {
                    const top = items[0];
                    trackTitle = top.title || searchQuery;
                    thumbnail  = `https://img.youtube.com/vi/${top.id}/hqdefault.jpg`;
                    ytUrl      = `https://youtube.com/watch?v=${top.id}`;
                    console.log(`[MP4] Resolved: "${trackTitle}" → ${ytUrl}`);
                } else {
                    console.log(`[MP4] xwolfSearch returned no results for "${searchQuery}"`);
                }
            } else {
                const vid = searchQuery.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
                if (vid) thumbnail = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
            }

            await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

            // ── Step 2: PRIMARY — xcasper ytmp6 ──
            let videoBuffer = null;
            let quality = '360p';

            const r6 = await xcasperYtmp6(ytUrl);
            if (r6?.buf) {
                videoBuffer = r6.buf;
                quality     = r6.quality;
                if (r6.title)     trackTitle = r6.title;
                if (r6.thumbnail) thumbnail  = r6.thumbnail;
            }

            // ── Step 3: FALLBACK — xcasperVideo (yt-video → ytmp5 → ytmp6) ──
            if (!videoBuffer) {
                console.log(`[MP4] ytmp6 failed, trying xcasperVideo fallback...`);
                videoBuffer = await xcasperVideo(ytUrl);
            }

            // ── Step 4: LAST RESORT — Keith API (apiskeith.top) ──
            if (!videoBuffer) {
                console.log(`[MP4] xcasper all failed, trying Keith API fallback...`);
                videoBuffer = await keithVideo(ytUrl);
            }

            if (!videoBuffer) {
                await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                return sock.sendMessage(jid, {
                    text: `❌ *Download Failed*\n\nCould not download the video. Try again later.`
                }, { quoted: m });
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

            const cleanTitle = (trackTitle || 'video').replace(/[^\w\s.-]/gi, '').substring(0, 50);

            await sock.sendMessage(jid, {
                video:       videoBuffer,
                mimetype:    'video/mp4',
                caption:     `🎬 *${trackTitle || 'Video'}*\n📹 *Quality:* ${quality}\n📦 *Size:* ${fileSizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*`,
                fileName:    `${cleanTitle}.mp4`,
                thumbnail:   thumbnailBuffer,
                gifPlayback: false
            }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
            console.log(`✅ [MP4] Success: ${trackTitle} (${fileSizeMB}MB)`);

        } catch (error) {
            console.error('❌ [MP4] Error:', error.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, {
                text: `❌ *MP4 Error:* ${error.message}`
            }, { quoted: m });
        }
    }
};
