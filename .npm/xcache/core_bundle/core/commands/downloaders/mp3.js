import axios from 'axios';
import { getOwnerName } from '../../lib/menuHelper.js';

const WOLF_API = 'https://apis.xwolf.space/download/yta';
const WOLF_STREAM = 'https://apis.xwolf.space/download/stream/mp3';
const WOLF_API_2 = 'https://apis.xwolf.space/download/mp3';
const WOLF_API_3 = 'https://apis.xwolf.space/download/dlmp3';

async function downloadAndValidate(downloadUrl) {
  const response = await axios({
    url: downloadUrl,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout: 60000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    validateStatus: (status) => status >= 200 && status < 400
  });

  const buffer = Buffer.from(response.data);

  if (buffer.length < 1000) {
    throw new Error('File too small, likely not audio');
  }

  const headerStr = buffer.slice(0, 50).toString('utf8').toLowerCase();
  if (headerStr.includes('<!doctype') || headerStr.includes('<html') || headerStr.includes('bad gateway')) {
    throw new Error('Received HTML instead of audio');
  }

  return buffer;
}

export default {
  name: 'mp3',
  description: 'Download MP3 audio via WOLF API',
  category: 'Downloader',
  aliases: ['wolfaudio', 'waudio'],
  usage: 'mp3 <url or song name>',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const quoted = m.quoted;
    const quotedText = quoted?.text?.trim() || (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation)?.trim() || '';

    try {
      const searchQuery = args.length > 0 ? args.join(' ') : quotedText;
      
      if (!searchQuery) {
        return sock.sendMessage(jid, {
          text: `╭─⌈ 🎵 *MP3 DOWNLOADER* ⌋\n│\n├─⊷ *${prefix}mp3 <song name>*\n│  └⊷ Download audio\n├─⊷ *${prefix}mp3 <YouTube URL>*\n│  └⊷ Download from link\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
        }, { quoted: m });
      }
      console.log(`🎵 [MP3] Request: ${searchQuery}`);

      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const apiUrl = `${WOLF_API}?url=${encodeURIComponent(searchQuery)}`;
      let data = null;

      try {
        const response = await axios.get(apiUrl, { timeout: 20000 });
        if (response.data) data = response.data;
      } catch (err) {
        console.log(`🎵 [MP3] Wolf API request failed: ${err.message}`);
      }

      const title = data?.title || data?.searchResult?.title || 'Unknown Track';
      const duration = data?.searchResult?.duration || '';
      const videoId = data?.videoId || '';
      const youtubeUrl = data?.youtubeUrl || searchQuery;
      const fileSize = data?.fileSize || '';
      const streamUrl = data?.streamUrl ? data.streamUrl.replace('http://', 'https://') : null;
      const downloadUrl = data?.downloadUrl;

      console.log(`🎵 [MP3] Found: ${title}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const downloadSources = [];

      if (downloadUrl && downloadUrl !== 'In Processing...' && downloadUrl.startsWith('http')) {
        downloadSources.push({ url: downloadUrl, label: 'WOLF Direct' });
      }

      if (streamUrl) {
        downloadSources.push({ url: streamUrl, label: 'WOLF Stream' });
      }

      downloadSources.push({ url: `${WOLF_STREAM}?url=${encodeURIComponent(youtubeUrl)}`, label: 'WOLF Stream URL' });

      let audioBuffer = null;
      let sourceUsed = '';

      for (const source of downloadSources) {
        try {
          console.log(`🎵 [MP3] Trying: ${source.label}`);
          audioBuffer = await downloadAndValidate(source.url);
          sourceUsed = source.label;
          break;
        } catch (err) {
          console.log(`🎵 [MP3] ${source.label} failed: ${err.message}`);
          continue;
        }
      }

      if (!audioBuffer) {
        for (const altApi of [WOLF_API_2, WOLF_API_3]) {
          try {
            console.log(`🎵 [MP3] Trying alt Wolf API: ${altApi}`);
            const altRes = await axios.get(`${altApi}?url=${encodeURIComponent(searchQuery)}`, { timeout: 20000 });
            if (altRes.data?.success && altRes.data?.downloadUrl) {
              audioBuffer = await downloadAndValidate(altRes.data.downloadUrl);
              sourceUsed = 'Wolf Alt';
              break;
            }
          } catch (err) {
            console.log(`🎵 [MP3] Alt failed: ${err.message}`);
          }
        }
      }

      if (!audioBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ *Download failed*\n\n🎵 ${title}\n\nAll download sources failed. Try \`${prefix}ytmp3 ${searchQuery}\``
        }, { quoted: m });
      }

      const fileSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);

      if (parseFloat(fileSizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ File too large: ${fileSizeMB}MB (max 50MB)`
        }, { quoted: m });
      }

      let thumbnailBuffer = null;
      if (videoId) {
        try {
          const thumbRes = await axios.get(
            `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            { responseType: 'arraybuffer', timeout: 10000 }
          );
          if (thumbRes.status === 200 && thumbRes.data.length > 1000) {
            thumbnailBuffer = Buffer.from(thumbRes.data);
          }
        } catch {}
      }

      const cleanTitle = title.replace(/[^\w\s.-]/gi, '').substring(0, 50);

      await sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${cleanTitle}.mp3`,
        contextInfo: {
          externalAdReply: {
            title: title.substring(0, 60),
            body: `🎵 ${duration ? duration + ' • ' : ''}${fileSize || fileSizeMB + 'MB'} | Downloaded using WOLF API`,
            mediaType: 2,
            thumbnail: thumbnailBuffer,
            sourceUrl: youtubeUrl,
            mediaUrl: youtubeUrl,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [MP3] Success: ${title} (${fileSizeMB}MB) [${sourceUsed}]`);

    } catch (error) {
      console.error('❌ [MP3] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *MP3 Error:* ${error.message}\n\nTry: \`${prefix}ytmp3 ${args.join(' ')}\``
      }, { quoted: m });
    }
  }
};
