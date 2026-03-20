import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { queryXWolfAudio, xwolfSearch, downloadMediaBuffer } from '../../lib/xwolfApi.js';
import { queryKeithAudio } from '../../lib/keithApi.js';

export default {
  name: 'dlmp3',
  aliases: ['wolfmp3', 'wdl'],
  description: 'Download MP3 audio',
  category: 'Downloader',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p = prefix || '.';
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

    let searchQuery = args.length > 0 ? args.join(' ') : quotedText;

    if (!searchQuery) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎵 *DLMP3 DOWNLOADER* ⌋\n│\n├─⊷ *${p}dlmp3 <song name or URL>*\n│  └⊷ Download audio\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎵 [DLMP3] Request: ${searchQuery}`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      const isUrl = /^https?:\/\//i.test(searchQuery);
      let videoId = '';
      let videoInfo = { title: searchQuery, channelTitle: '', duration: '', thumbnail: '' };

      if (!isUrl) {
        const items = await xwolfSearch(searchQuery, 1);
        if (items.length) {
          const top = items[0];
          videoId = top.id;
          videoInfo = {
            title:        top.title       || searchQuery,
            channelTitle: top.channelTitle || '',
            duration:     top.duration    || '',
            thumbnail:    `https://img.youtube.com/vi/${top.id}/hqdefault.jpg`
          };
          searchQuery = `https://youtube.com/watch?v=${top.id}`;
        }
      } else {
        videoId = searchQuery.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
        if (videoId) videoInfo.thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      let result = await queryXWolfAudio(searchQuery);
      if (!result.success) result = await queryKeithAudio(searchQuery);

      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ All audio services are currently unavailable. Try again later.` }, { quoted: m });
      }

      const { data, endpoint } = result;
      const trackTitle = data.title || videoInfo.title || 'Audio';
      const quality    = data.quality || '192kbps';
      const thumbUrl   = data.thumbnail || videoInfo.thumbnail;

      console.log(`🎵 [DLMP3] Found via ${endpoint}: ${trackTitle}`);

      const audioBuffer = await downloadMediaBuffer(data.download_url);
      if (!audioBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Failed to download audio. Please try again.` }, { quoted: m });
      }

      const sizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);
      if (parseFloat(sizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ File too large: ${sizeMB}MB (max 50MB)` }, { quoted: m });
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
        audio:    audioBuffer,
        mimetype: 'audio/mpeg',
        ptt:      false,
        fileName: `${cleanTitle}.mp3`,
        contextInfo: {
          externalAdReply: {
            title:               trackTitle.substring(0, 60),
            body:                `🎵 ${quality} | ${sizeMB}MB | Downloaded by ${getBotName()}`,
            mediaType:           2,
            thumbnail:           thumbnailBuffer,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [DLMP3] Success: ${trackTitle} (${sizeMB}MB) via ${endpoint}`);

    } catch (error) {
      console.error('❌ [DLMP3] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ DLMP3 Error: ${error.message}` }, { quoted: m });
    }
  }
};
