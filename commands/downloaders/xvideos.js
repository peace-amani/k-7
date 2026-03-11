import axios from 'axios';
import { getBotName } from '../../lib/botname.js';

const GIFTED_BASE = 'https://api.giftedtech.co.ke/api/download/xvideosdl';
const XVIDEOS_REGEX = /xvideos\.com\/video/i;

export default {
    name: 'xvideos',
    aliases: ['xvdl', 'xvid'],
    desc: 'Download videos from XVideos',
    category: 'Downloaders',
    usage: '.xvideos <xvideos url>',

    async execute(sock, m, args, PREFIX) {
        const jid = m.key.remoteJid;
        const BOT_NAME = getBotName();
        const url = args[0];

        if (!url) {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 🔞 *XVIDEOS DOWNLOADER* ⌋\n│\n├─⊷ *Usage:* ${PREFIX}xvideos <url>\n├─⊷ *Example:*\n│  └⊷ ${PREFIX}xvideos https://www.xvideos.com/video.abc123/title\n│\n╰─⊷ *Powered by ${BOT_NAME}*`
            }, { quoted: m });
        }

        if (!XVIDEOS_REGEX.test(url)) {
            return sock.sendMessage(jid, {
                text: `❌ Please provide a valid XVideos URL.\n\n*Example:* https://www.xvideos.com/video.abc123/title`
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            const res = await axios.get(GIFTED_BASE, {
                params: { apikey: 'gifted', url },
                timeout: 30000
            });

            if (!res.data?.success || !res.data?.result?.download_url) {
                await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                return sock.sendMessage(jid, {
                    text: `❌ *Failed to fetch video.*\n\nThe link may be broken or the video is unavailable.`
                }, { quoted: m });
            }

            const { title, views, likes, size, thumbnail, download_url } = res.data.result;

            const caption =
                `╭─⌈ 🔞 *XVIDEOS* ⌋\n` +
                `├─⊷ 📌 *Title:* ${title || 'Unknown'}\n` +
                `├─⊷ 👁️ *Views:* ${views || 'N/A'}\n` +
                `├─⊷ 👍 *Likes:* ${likes || 'N/A'}\n` +
                `├─⊷ 📦 *Size:* ${size || 'N/A'}\n` +
                `╰─⊷ *Powered by ${BOT_NAME}*`;

            if (thumbnail) {
                try {
                    const thumbRes = await axios.get(thumbnail, {
                        responseType: 'arraybuffer',
                        timeout: 15000
                    });
                    await sock.sendMessage(jid, {
                        image: Buffer.from(thumbRes.data),
                        caption
                    }, { quoted: m });
                } catch {
                    await sock.sendMessage(jid, { text: caption }, { quoted: m });
                }
            } else {
                await sock.sendMessage(jid, { text: caption }, { quoted: m });
            }

            await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

            const videoRes = await axios.get(download_url, {
                responseType: 'arraybuffer',
                timeout: 120000,
                maxRedirects: 5,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            const videoBuffer = Buffer.from(videoRes.data);

            if (videoBuffer.length < 5000) {
                throw new Error('Received invalid video data');
            }

            const safeTitle = (title || 'xvideos').replace(/[^a-zA-Z0-9 ]/g, '').trim().substring(0, 50);

            await sock.sendMessage(jid, {
                video: videoBuffer,
                caption: `> ${BOT_NAME}`,
                mimetype: 'video/mp4',
                fileName: `${safeTitle}.mp4`
            }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

        } catch (err) {
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, {
                text: `❌ *Download failed.*\n\n_${err.message || 'Unknown error'}_`
            }, { quoted: m });
        }
    }
};
