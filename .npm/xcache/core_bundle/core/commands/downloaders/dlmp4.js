import axios from 'axios';
import yts from 'yt-search';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const GIFTED_BASE = 'https://api.giftedtech.co.ke/api/download';
const VIDEO_ENDPOINTS = ['ytmp4', 'dlmp4', 'ytv'];

async function queryAPI(url, endpoints) {
  for (const endpoint of endpoints) {
    try {
      const res = await axios.get(`${GIFTED_BASE}/${endpoint}`, {
        params: { apikey: 'gifted', url },
        timeout: 30000
      });
      if (res.data?.success && res.data?.result?.download_url) {
        return { success: true, data: res.data.result, endpoint };
      }
    } catch {}
  }
  return { success: false };
}

async function downloadAndValidate(url, timeout = 120000) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    validateStatus: (s) => s >= 200 && s < 400
  });
  const buffer = Buffer.from(response.data);
  if (buffer.length < 5000) throw new Error('File too small, likely not video');
  const header = buffer.slice(0, 50).toString('utf8').toLowerCase();
  if (header.includes('<!doctype') || header.includes('<html') || header.includes('bad gateway')) {
    throw new Error('Received HTML instead of video');
  }
  return buffer;
}

export default {
  name: 'dlmp4',
  aliases: ['dlvideo', 'dlvid'],
  description: 'Download MP4 video with fallback APIs',
  category: 'Downloader',
  usage: 'dlmp4 <url or video name>',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

    const searchQuery = args.length > 0 ? args.join(' ') : quotedText;

    if (!searchQuery) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎬 *DLMP4 DOWNLOADER* ⌋\n│\n├─⊷ *${prefix}dlmp4 <video name or URL>*\n│  └⊷ Download video\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎬 [DLMP4] Request: ${searchQuery}`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      let videoUrl = searchQuery;
      let thumbnail = '';

      if (!searchQuery.match(/(youtube\.com|youtu\.be)/i)) {
        try {
          const { videos } = await yts(searchQuery);
          if (videos?.length) {
            videoUrl = videos[0].url;
            thumbnail = videos[0].thumbnail || '';
          }
        } catch {}
      }

      const result = await queryAPI(videoUrl, VIDEO_ENDPOINTS);

      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ *Download Failed*\n\nAll video services are currently unavailable. Try again later.`
        }, { quoted: m });
      }

      const { data, endpoint } = result;
      const { title, quality, download_url } = data;
      const thumbUrl = data.thumbnail || thumbnail;

      console.log(`🎬 [DLMP4] Found via ${endpoint}: ${title}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const videoBuffer = await downloadAndValidate(download_url);
      const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);

      if (parseFloat(fileSizeMB) > 99) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Video too large: ${fileSizeMB}MB (max 99MB)` }, { quoted: m });
      }

      let thumbnailBuffer = null;
      if (thumbUrl) {
        try {
          const tr = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 10000 });
          if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
        } catch {}
      }

      const cleanTitle = (title || 'video').replace(/[^\w\s.-]/gi, '').substring(0, 50);

      await sock.sendMessage(jid, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption: `🎬 *${title || 'Video'}*\n📹 *Quality:* ${quality || 'HD'}\n📦 *Size:* ${fileSizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*`,
        fileName: `${cleanTitle}.mp4`,
        thumbnail: thumbnailBuffer,
        gifPlayback: false
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [DLMP4] Success: ${title} (${fileSizeMB}MB) via ${endpoint}`);

    } catch (error) {
      console.error('❌ [DLMP4] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *DLMP4 Error:* ${error.message}`
      }, { quoted: m });
    }
  }
};
