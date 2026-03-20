import axios from 'axios';
import yts from 'yt-search';
import { createRequire } from 'module';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setMusicSession } from '../../lib/musicSession.js';
import { proxyFetch } from '../../lib/proxyFetch.js';
import { xcasperVideo } from '../../lib/xcasperApi.js';

const require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = require('gifted-btns'); } catch {}

const XCASPER_BASE = 'https://apis.xcasper.space/api/downloader';
const GIFTED_BASE  = 'https://api.giftedtech.co.ke/api/download';
const GIFTED_ENDS  = ['ytv', 'dlmp4', 'ytmp4'];

// ── xcasper yt-video: picks best mp4 from proxy quality list ──────────────────
async function xcasperYtVideo(ytUrl) {
    try {
        const res = await axios.get(`${XCASPER_BASE}/yt-video`, {
            params: { url: ytUrl },
            timeout: 30000
        });
        const d = res.data;
        if (!d?.success || !Array.isArray(d?.videos) || !d.videos.length) return null;

        const mp4s = d.videos.filter(v => v.ext === 'mp4' && v.type === 'video');
        if (!mp4s.length) return null;

        // prefer 360p → 480p → 720p → smallest available
        const pick = mp4s.find(v => v.quality?.includes('360p'))
            || mp4s.find(v => v.quality?.includes('480p'))
            || mp4s.find(v => v.quality?.includes('720p'))
            || mp4s[mp4s.length - 1];

        if (!pick?.url) return null;

        console.log(`[video/yt-video] downloading ${pick.quality}: "${d.title}"`);
        const buf = await proxyFetch(pick.url, 150_000);
        if (!buf || buf.length < 10_000) {
            console.log(`[video/yt-video] buffer too small: ${buf?.length || 0}`);
            return null;
        }
        const sig = buf.slice(4, 8).toString('ascii');
        if (!['ftyp', 'free', 'moov', 'mdat'].includes(sig)) {
            console.log(`[video/yt-video] not MP4 bytes (sig="${sig}")`);
            return null;
        }
        console.log(`[video/yt-video] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB`);
        return { buf, title: d.title || '', thumbnail: d.thumbnail || '', quality: pick.quality || '360p' };
    } catch (e) {
        console.log(`[video/yt-video] error: ${e.message}`);
        return null;
    }
}

// ── Gifted API fallback chain ─────────────────────────────────────────────────
async function giftedYoutube(ytUrl) {
    for (const ep of GIFTED_ENDS) {
        try {
            const res = await axios.get(`${GIFTED_BASE}/${ep}`, {
                params: { apikey: 'gifted', url: ytUrl },
                timeout: 30000
            });
            if (res.data?.success && res.data?.result?.download_url) {
                return { data: res.data.result, endpoint: ep };
            }
        } catch {}
    }
    return null;
}

async function downloadAndValidate(url, timeout = 120000) {
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

// ── Facebook ──────────────────────────────────────────────────────────────────
function isFacebookUrl(url) {
    return /facebook\.com|fb\.watch|fb\.com/i.test(url);
}

async function queryFacebook(url) {
    try {
        const res = await axios.get(`${GIFTED_BASE}/facebookv2`, {
            params: { apikey: 'gifted', url }, timeout: 30000
        });
        const r = res.data?.result;
        if (res.data?.success && r?.links?.length) {
            const best = r.links.find(l => l.ext === 'mp4') || r.links[0];
            return { success: true, downloadUrl: best.url || best.link, title: r.title, duration: r.duration, thumbnail: r.thumbnail, uploader: r.uploader, quality: best.quality, source: 'facebookv2' };
        }
    } catch {}
    try {
        const res = await axios.get(`${GIFTED_BASE}/facebook`, {
            params: { apikey: 'gifted', url }, timeout: 30000
        });
        const r = res.data?.result;
        if (res.data?.success && (r?.hd_video || r?.sd_video)) {
            return { success: true, downloadUrl: r.hd_video || r.sd_video, title: r.title, duration: r.duration, thumbnail: r.thumbnail, quality: r.hd_video ? 'HD' : 'SD', source: 'facebook' };
        }
    } catch {}
    return { success: false };
}

// ─────────────────────────────────────────────────────────────────────────────
export default {
    name: 'video',
    aliases: ['vid'],
    description: 'Download YouTube or Facebook videos',
    category: 'Downloader',

    async execute(sock, m, args, prefix) {
        const jid = m.key.remoteJid;
        const p = prefix || '.';
        const quotedText = m.quoted?.text?.trim()
            || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim()
            || '';
        const searchQuery = args.length > 0 ? args.join(' ') : quotedText;

        if (!searchQuery) {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 🎬 *VIDEO DOWNLOADER* ⌋\n│\n├─⊷ *${p}video <name or YouTube URL>*\n│  └⊷ Download YouTube video\n├─⊷ *${p}video <Facebook URL>*\n│  └⊷ Download Facebook reel/video\n├─⊷ Reply to a message to search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            // ── Facebook path (unchanged) ────────────────────────────────
            if (isFacebookUrl(searchQuery)) {
                const fbResult = await queryFacebook(searchQuery);
                if (!fbResult.success) {
                    await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                    return sock.sendMessage(jid, { text: `❌ Failed to fetch Facebook video. Make sure the URL is public and valid.` }, { quoted: m });
                }

                await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });
                const videoBuffer = await downloadAndValidate(fbResult.downloadUrl);
                const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);

                if (parseFloat(fileSizeMB) > 99) {
                    await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                    return sock.sendMessage(jid, { text: `❌ Video too large: ${fileSizeMB}MB\nMax size: 99MB` }, { quoted: m });
                }

                let thumbnailBuffer = null;
                if (fbResult.thumbnail) {
                    try {
                        const tr = await axios.get(fbResult.thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
                        if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
                    } catch {}
                }

                const title = fbResult.title || 'Facebook Video';
                const cleanTitle = title.replace(/[^\w\s.-]/gi, '').substring(0, 50);
                const uploaderLine = fbResult.uploader ? `👤 *${fbResult.uploader}*\n` : '';
                const durationLine = fbResult.duration ? `⏱️ *${fbResult.duration}*\n` : '';

                await sock.sendMessage(jid, {
                    video: videoBuffer, mimetype: 'video/mp4',
                    caption: `🎬 *${title}*\n${uploaderLine}${durationLine}📦 *${fileSizeMB}MB* • ${fbResult.quality || 'HD'}\n\n🐺 *Downloaded by ${getBotName()}*`,
                    fileName: `${cleanTitle}.mp4`, thumbnail: thumbnailBuffer, gifPlayback: false
                }, { quoted: m });

                await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                console.log(`✅ [VIDEO] Facebook: ${title} (${fileSizeMB}MB)`);
                return;
            }

            // ── YouTube: resolve name → URL ──────────────────────────────
            let videos = [];
            let videoUrl = searchQuery;
            let metaTitle = '', metaThumb = '', metaAuthor = '', metaDuration = '';

            if (!searchQuery.match(/(youtube\.com|youtu\.be)/i)) {
                const result = await yts(searchQuery);
                if (result?.videos?.length) {
                    videos = result.videos.slice(0, 5);
                    videoUrl     = videos[0].url;
                    metaTitle    = videos[0].title;
                    metaAuthor   = videos[0].author?.name || '';
                    metaDuration = videos[0].timestamp || '';
                    metaThumb    = videos[0].thumbnail || (videos[0].videoId ? `https://i.ytimg.com/vi/${videos[0].videoId}/hqdefault.jpg` : '');
                }
            } else {
                const vid = videoUrl.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
                metaThumb = vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : '';
                videos = [{ url: videoUrl, title: 'Video', author: { name: '' }, timestamp: '', videoId: vid, thumbnail: metaThumb }];
                metaTitle = 'Video';
            }

            // ── Interactive buttons (button mode) ────────────────────────
            if (isButtonModeEnabled() && giftedBtns?.sendInteractiveMessage && videos.length) {
                const v = videos[0];
                const thumbUrl = v.thumbnail || metaThumb;
                setMusicSession(jid, {
                    videos: videos.map(vd => ({
                        url: vd.url, title: vd.title,
                        author: vd.author?.name || '', duration: vd.timestamp || '',
                        videoId: vd.videoId || '',
                        thumbnail: vd.thumbnail || (vd.videoId ? `https://i.ytimg.com/vi/${vd.videoId}/hqdefault.jpg` : '')
                    })),
                    index: 0, type: 'video'
                });
                const buttons = [
                    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⬇️ Download Video', id: `${p}viddl` }) }
                ];
                if (videos.length > 1) {
                    buttons.push({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '➡️ Next Result', id: `${p}vnext` }) });
                }
                try {
                    const msgOpts = {
                        title: v.title.substring(0, 60),
                        text: `🎬 *${v.title}*\n👤 ${v.author?.name || 'Unknown'}\n⏱️ ${v.timestamp || 'N/A'}\n\n_Result 1 of ${videos.length}_`,
                        footer: `🐺 ${getBotName()}`,
                        interactiveButtons: buttons
                    };
                    if (thumbUrl) msgOpts.image = { url: thumbUrl };
                    await giftedBtns.sendInteractiveMessage(sock, jid, msgOpts);
                    await sock.sendMessage(jid, { react: { text: '🎬', key: m.key } });
                    return;
                } catch {}
            }

            await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

            // ── PRIMARY: xcasper yt-video (proxy stream) ─────────────────
            console.log(`🎬 [VIDEO] Trying xcasper yt-video for: ${videoUrl}`);
            let videoBuffer = null, trackTitle = metaTitle, quality = '360p', thumbUrl = metaThumb;

            const ytv = await xcasperYtVideo(videoUrl);
            if (ytv?.buf) {
                videoBuffer = ytv.buf;
                quality     = ytv.quality;
                if (ytv.title)     trackTitle = ytv.title;
                if (ytv.thumbnail) thumbUrl   = ytv.thumbnail;
                console.log(`✅ [VIDEO] xcasper yt-video success`);
            }

            // ── SECONDARY: xcasperVideo chain (ytmp5 → ytmp6) ────────────
            if (!videoBuffer) {
                console.log(`[VIDEO] yt-video failed, trying xcasperVideo chain...`);
                videoBuffer = await xcasperVideo(videoUrl);
                if (videoBuffer) console.log(`✅ [VIDEO] xcasperVideo chain success`);
            }

            // ── FALLBACK: Gifted API ──────────────────────────────────────
            if (!videoBuffer) {
                console.log(`[VIDEO] xcasper failed, trying Gifted fallback...`);
                const gifted = await giftedYoutube(videoUrl);
                if (gifted) {
                    if (gifted.data.title)     trackTitle = gifted.data.title;
                    if (gifted.data.quality)   quality    = gifted.data.quality;
                    if (gifted.data.thumbnail) thumbUrl   = gifted.data.thumbnail;
                    videoBuffer = await downloadAndValidate(gifted.data.download_url);
                    console.log(`✅ [VIDEO] Gifted/${gifted.endpoint} success`);
                }
            }

            if (!videoBuffer) {
                await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                return sock.sendMessage(jid, { text: `❌ Video download failed. Try a different query or URL.` }, { quoted: m });
            }

            const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
            if (parseFloat(fileSizeMB) > 99) {
                await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                return sock.sendMessage(jid, { text: `❌ Video too large: ${fileSizeMB}MB\nMax size: 99MB` }, { quoted: m });
            }

            let thumbnailBuffer = null;
            if (thumbUrl) {
                try {
                    const tr = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 10000 });
                    if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
                } catch {}
            }

            const cleanTitle = (trackTitle || 'video').replace(/[^\w\s.-]/gi, '').substring(0, 50);

            await sock.sendMessage(jid, {
                video: videoBuffer, mimetype: 'video/mp4',
                caption: `🎬 *${trackTitle || 'Video'}*\n📹 *Quality:* ${quality}\n📦 *Size:* ${fileSizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*`,
                fileName: `${cleanTitle}.mp4`, thumbnail: thumbnailBuffer, gifPlayback: false
            }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
            console.log(`✅ [VIDEO] YouTube: ${trackTitle} (${fileSizeMB}MB)`);

        } catch (error) {
            console.error(`❌ [VIDEO] Error: ${error.message}`);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
        }
    }
};
