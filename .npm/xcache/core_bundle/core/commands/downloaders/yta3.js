import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const GIFTED_BASE = 'https://api.giftedtech.co.ke/api/download';
const AUDIO_ENDPOINTS = ['song', 'yta', 'dlmp3', 'ytmp3'];
const ENDPOINT_TIMEOUT = { song: 3000, default: 15000 };

async function queryAPI(url, endpoints) {
  for (const endpoint of endpoints) {
    try {
      const params = { apikey: 'gifted', url };
      if (endpoint === 'ytmp3') params.quality = '128kbps';
      const timeout = ENDPOINT_TIMEOUT[endpoint] ?? ENDPOINT_TIMEOUT.default;
      const res = await axios.get(`${GIFTED_BASE}/${endpoint}`, { params, timeout });
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
    timeout: 60000,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    validateStatus: (s) => s >= 200 && s < 400
  });
  const buffer = Buffer.from(response.data);
  if (buffer.length < 1000) throw new Error('File too small, likely not audio');
  const header = buffer.slice(0, 50).toString('utf8').toLowerCase();
  if (header.includes('<!doctype') || header.includes('<html') || header.includes('bad gateway')) {
    throw new Error('Received HTML instead of audio');
  }
  return buffer;
}

export default {
  name: 'yta3',
  aliases: ['wolfyta3', 'yta2'],
  description: 'Download audio with fallback APIs',
  category: 'Downloader',
  usage: 'yta3 <url or song name>',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

    const searchQuery = args.length > 0 ? args.join(' ') : quotedText;

    if (!searchQuery) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎵 *YTA DOWNLOADER* ⌋\n│\n├─⊷ *${prefix}yta3 <song name or URL>*\n│  └⊷ Download audio\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎵 [YTA3] Request: ${searchQuery}`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      const result = await queryAPI(searchQuery, AUDIO_ENDPOINTS);

      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ *Download Failed*\n\nAll audio services are currently unavailable. Try again later.`
        }, { quoted: m });
      }

      const { data, endpoint } = result;
      const { title, duration, quality, thumbnail, download_url } = data;

      console.log(`🎵 [YTA3] Found via ${endpoint}: ${title}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const audioBuffer = await downloadAndValidate(download_url);
      const fileSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);

      if (parseFloat(fileSizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ File too large: ${fileSizeMB}MB (max 50MB)` }, { quoted: m });
      }

      let thumbnailBuffer = null;
      if (thumbnail) {
        try {
          const tr = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
          if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
        } catch {}
      }

      const cleanTitle = (title || 'audio').replace(/[^\w\s.-]/gi, '').substring(0, 50);

      await sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${cleanTitle}.mp3`,
        contextInfo: {
          externalAdReply: {
            title: (title || 'Audio').substring(0, 60),
            body: `🎵 ${duration ? duration + ' • ' : ''}${quality || '320kbps'} | Downloaded by ${getBotName()}`,
            mediaType: 2,
            thumbnail: thumbnailBuffer,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [YTA3] Success: ${title} (${fileSizeMB}MB) via ${endpoint}`);

    } catch (error) {
      console.error('❌ [YTA3] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *YTA Error:* ${error.message}`
      }, { quoted: m });
    }
  }
};
