import axios from 'axios';
import yts from 'yt-search';
import { createRequire } from 'module';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setMusicSession } from '../../lib/musicSession.js';
import { keithVideo, keithFacebook } from '../../lib/keithApi.js';

let _getUserCaption;
try {
  const _tk = await import('../downloaders/tiktok.js');
  _getUserCaption = _tk.getUserCaption || ((uid) => `${getBotName()} is the Alpha`);
} catch { _getUserCaption = (uid) => `${getBotName()} is the Alpha`; }
function getCaption(uid) { return typeof _getUserCaption === 'function' ? _getUserCaption(uid) : `${getBotName()} is the Alpha`; }

const require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = require('gifted-btns'); } catch {}

function isFacebookUrl(url) {
    return /facebook\.com|fb\.watch|fb\.com/i.test(url);
}

export default {
    name: 'video',
    aliases: ['vid'],
    description: 'Download YouTube or Facebook videos',
    category: 'Downloader',

    async execute(sock, m, args, prefix) {
        const jid = m.key.remoteJid;
        const userId = m.key.participant || m.key.remoteJid;
        const p = prefix || '.';
        const quotedText = m.quoted?.text?.trim()
            || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim()
            || '';
        const searchQuery = args.length > 0 ? args.join(' ') : quotedText;

        if (!searchQuery) {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 🎬 *VIDEO DOWNLOADER* ⌋\n│\n├─⊷ *${p}video <name or YouTube URL>*\n│  └⊷ Download YouTube video\n├─⊷ *${p}video <Facebook URL>*\n│  └⊷ Download Facebook reel/video\n├─⊷ Reply to a message to search\n│\n╰⊷ _Powered by ${getOwnerName().toUpperCase()} TECH_`
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            // ── Facebook path ────────────────────────────────────────────
            if (isFacebookUrl(searchQuery)) {
                console.log(`🎬 [VIDEO] Facebook URL detected`);
                await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

                const videoBuffer = await keithFacebook(searchQuery);
                if (!videoBuffer) {
                    await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                    return sock.sendMessage(jid, {
                        text: `❌ Failed to download Facebook video. Make sure the URL is public and valid.`
                    }, { quoted: m });
                }

                const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
                if (parseFloat(fileSizeMB) > 99) {
                    await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                    return sock.sendMessage(jid, { text: `❌ Video too large: ${fileSizeMB}MB\nMax size: 99MB` }, { quoted: m });
                }

                await sock.sendMessage(jid, {
                    video: videoBuffer, mimetype: 'video/mp4',
                    caption: `🎬 *Facebook Video*\n📦 *${fileSizeMB}MB*\n\n🐺 *Downloaded by ${getBotName()}*\n\n${getCaption(userId)}`,
                    fileName: 'facebook_video.mp4',
                    gifPlayback: false
                }, { quoted: m });

                await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                console.log(`✅ [VIDEO] Facebook success (${fileSizeMB}MB)`);
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

            // ── Download via Keith API ────────────────────────────────────
            console.log(`🎬 [VIDEO] Downloading via Keith API: ${videoUrl}`);
            const videoBuffer = await keithVideo(videoUrl);

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
            if (metaThumb) {
                try {
                    const tr = await axios.get(metaThumb, { responseType: 'arraybuffer', timeout: 10000 });
                    if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
                } catch {}
            }

            const cleanTitle = (metaTitle || 'video').replace(/[^\w\s.-]/gi, '').substring(0, 50);

            await sock.sendMessage(jid, {
                video: videoBuffer, mimetype: 'video/mp4',
                caption: `🎬 *${metaTitle || 'Video'}*\n${metaAuthor ? `👤 *${metaAuthor}*\n` : ''}${metaDuration ? `⏱️ *${metaDuration}*\n` : ''}📦 *Size:* ${fileSizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*\n\n${getCaption(userId)}`,
                fileName: `${cleanTitle}.mp4`, thumbnail: thumbnailBuffer, gifPlayback: false
            }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
            console.log(`✅ [VIDEO] YouTube: ${metaTitle} (${fileSizeMB}MB)`);

        } catch (error) {
            console.error(`❌ [VIDEO] Error: ${error.message}`);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
        }
    }
};
