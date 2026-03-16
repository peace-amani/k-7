import axios from 'axios';
import { getMusicSession, clearMusicSession } from '../../lib/musicSession.js';
import { getBotName } from '../../lib/botname.js';
import { queryXWolfVideo } from '../../lib/xwolfApi.js';

const GIFTED_BASE = 'https://api.giftedtech.co.ke/api/download';
const VIDEO_ENDPOINTS = ['ytv', 'dlmp4', 'ytmp4'];

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
  name: 'viddl',
  aliases: ['dlvid', 'downloadvid'],
  category: 'Downloader',
  desc: 'Download video from current search session',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const session = getMusicSession(jid);

    if (!session || session.type !== 'video') {
      return sock.sendMessage(jid, {
        text: `⚠️ No active video session. Search first with *${prefix || '.'}ytmp4* or *${prefix || '.'}video*`
      }, { quoted: m });
    }

    const v = session.videos[session.index];
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      let result = await queryAPI(v.url, VIDEO_ENDPOINTS);
      if (!result.success) result = await queryXWolfVideo(v.url);
      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: '❌ Video download failed. All services unavailable. Try again later.' }, { quoted: m });
      }

      const { data, endpoint } = result;
      const trackTitle = data.title || v.title || 'Video';
      const quality = data.quality || 'HD';
      const thumbUrl = data.thumbnail || v.thumbnail || null;

      console.log(`🎬 [VIDDL] Found via ${endpoint}: ${trackTitle}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const videoBuffer = await downloadAndValidate(data.download_url);
      const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);

      if (parseFloat(fileSizeMB) > 99) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Video too large (${fileSizeMB}MB). Maximum is 99MB.` }, { quoted: m });
      }

      let thumbnailBuffer = null;
      if (thumbUrl) {
        try {
          const tr = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 10000 });
          if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
        } catch {}
      }

      const cleanTitle = trackTitle.replace(/[^\w\s.-]/gi, '').substring(0, 50);

      await sock.sendMessage(jid, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption: `🎬 *${trackTitle}*\n📹 *Quality:* ${quality}\n📦 *Size:* ${fileSizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*`,
        fileName: `${cleanTitle}.mp4`,
        thumbnail: thumbnailBuffer,
        gifPlayback: false
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      clearMusicSession(jid);
      console.log(`✅ [VIDDL] Success: "${trackTitle}" (${fileSizeMB}MB) via ${endpoint}`);

    } catch (error) {
      console.error('❌ [VIDDL] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
    }
  }
};
