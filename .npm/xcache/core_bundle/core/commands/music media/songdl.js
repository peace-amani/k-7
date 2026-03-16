import axios from 'axios';
import { getMusicSession, clearMusicSession } from '../../lib/musicSession.js';
import { getBotName } from '../../lib/botname.js';
import { queryXWolfAudio } from '../../lib/xwolfApi.js';

const GIFTED_BASE = 'https://api.giftedtech.co.ke/api/download';
const AUDIO_ENDPOINTS = ['ytmp3', 'yta', 'dlmp3'];

async function queryAPI(url, endpoints) {
  for (const endpoint of endpoints) {
    try {
      const params = { apikey: 'gifted', url };
      if (endpoint === 'ytmp3') params.quality = '128kbps';
      const res = await axios.get(`${GIFTED_BASE}/${endpoint}`, { params, timeout: 25000 });
      if (res.data?.success && res.data?.result?.download_url) {
        return { success: true, data: res.data.result, endpoint };
      }
    } catch {}
  }
  return { success: false };
}

async function downloadAndValidate(url) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout: 90000,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    validateStatus: (s) => s >= 200 && s < 400
  });
  const buffer = Buffer.from(response.data);
  if (buffer.length < 1000) throw new Error('File too small');
  const header = buffer.slice(0, 50).toString('utf8').toLowerCase();
  if (header.includes('<!doctype') || header.includes('<html')) throw new Error('Received HTML instead of audio');
  return buffer;
}

export default {
  name: 'songdl',
  aliases: ['dlsong', 'downloadsong'],
  category: 'Downloader',
  desc: 'Download audio from current music search session',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const session = getMusicSession(jid);

    if (!session || session.type !== 'audio') {
      return sock.sendMessage(jid, {
        text: `⚠️ No active music session. Search first with *${prefix || '.'}song* or *${prefix || '.'}play*`
      }, { quoted: m });
    }

    const v = session.videos[session.index];
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      let result = await queryAPI(v.url, AUDIO_ENDPOINTS);
      if (!result.success) result = await queryXWolfAudio(v.url);
      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: '❌ Download failed. All services unavailable. Try again later.' }, { quoted: m });
      }

      const { data, endpoint } = result;
      const trackTitle = data.title || v.title || 'Audio';
      const quality = data.quality || '128kbps';
      const thumbUrl = data.thumbnail || v.thumbnail || (v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : null);

      console.log(`🎵 [SONGDL] Found via ${endpoint}: ${trackTitle}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const audioBuffer = await downloadAndValidate(data.download_url);
      const fileSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);

      if (parseFloat(fileSizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ File too large (${fileSizeMB}MB). Maximum is 50MB.` }, { quoted: m });
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
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${cleanTitle}.mp3`,
        contextInfo: {
          externalAdReply: {
            title: trackTitle.substring(0, 60),
            body: `🎵 ${v.author ? v.author + ' | ' : ''}${v.duration ? '⏱️ ' + v.duration + ' | ' : ''}${quality} | ${getBotName()}`,
            mediaType: 2,
            thumbnail: thumbnailBuffer,
            sourceUrl: v.url,
            mediaUrl: v.url,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      clearMusicSession(jid);
      console.log(`✅ [SONGDL] Success: "${trackTitle}" (${fileSizeMB}MB) via ${endpoint}`);

    } catch (error) {
      console.error('❌ [SONGDL] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
    }
  }
};
