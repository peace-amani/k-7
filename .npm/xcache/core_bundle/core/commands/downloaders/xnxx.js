import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const GIFTED_BASE = 'https://api.giftedtech.co.ke/api/download/xnxxdl';
const XNXX_REGEX = /xnxx\.(com|health|net|one)/i;

function formatDuration(seconds) {
    const s = parseInt(seconds, 10);
    if (isNaN(s)) return seconds || 'N/A';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
}

export default {
    name: 'xnxx',
    aliases: ['xnxxdl', 'xnx'],
    desc: 'Download videos from XNXX',
    category: 'Downloaders',
    usage: '.xnxx <xnxx url>',

    async execute(sock, m, args, PREFIX) {
        const jid = m.key.remoteJid;
        const BOT_NAME = getBotName();
        const url = args[0];

        if (!url) {
            return sock.sendMessage(jid, {
                text:
                    `╭─⌈ 🔞 *XNXX DOWNLOADER* ⌋\n` +
                    `│\n` +
                    `├⊷ *Usage:* ${PREFIX}xnxx <url>\n` +
                    `├⊷ *Example:*\n` +
                    `│  └⊷ ${PREFIX}xnxx https://www.xnxx.com/video-abc123/title\n` +
                    `├⊷ *Aliases:* xnxxdl, xnx\n` +
                    `│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });
        }

        if (!XNXX_REGEX.test(url)) {
            return sock.sendMessage(jid, {
                text: `❌ Please provide a valid XNXX URL.\n\n*Example:* https://www.xnxx.com/video-abc123/title`
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            const res = await axios.get(GIFTED_BASE, {
                params: { apikey: 'gifted', url },
                timeout: 30000
            });

            if (!res.data?.success || !res.data?.result) {
                await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                return sock.sendMessage(jid, {
                    text: `❌ *Failed to fetch video.*\n\nThe link may be broken or the video is unavailable.`
                }, { quoted: m });
            }

            const { title, duration, image, info, files } = res.data.result;

            const downloadUrl = files?.high || files?.low;

            if (!downloadUrl) {
                await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                return sock.sendMessage(jid, {
                    text: `❌ *No downloadable video found for this URL.*`
                }, { quoted: m });
            }

            const caption =
                `╭─⌈ 🔞 *XNXX* ⌋\n` +
                `├⊷ 📌 *Title:* ${title || 'Unknown'}\n` +
                `├⊷ ⏱️ *Duration:* ${formatDuration(duration)}\n` +
                `├⊷ ℹ️ *Info:* ${(info || 'N/A').replace(/\n/g, ' | ')}\n` +
                `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;

            const thumbUrl = image || files?.thumb;
            if (thumbUrl) {
                try {
                    const thumbRes = await axios.get(thumbUrl, {
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

            const videoRes = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 120000,
                maxRedirects: 5,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            const videoBuffer = Buffer.from(videoRes.data);

            if (videoBuffer.length < 5000) {
                throw new Error('Received invalid video data');
            }

            const safeTitle = (title || 'xnxx').replace(/[^a-zA-Z0-9 ]/g, '').trim().substring(0, 50);

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
