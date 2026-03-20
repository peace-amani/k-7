import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { xwolfSearch, streamXWolf } from '../../lib/xwolfApi.js';

export default {
  name: 'yta3',
  aliases: ['wolfyta3', 'yta2'],
  description: 'Download audio with fallback APIs',
  category: 'Downloader',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p = prefix || '.';
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

    let searchQuery = args.length > 0 ? args.join(' ') : quotedText;

    if (!searchQuery) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎵 *YTA DOWNLOADER* ⌋\n│\n├─⊷ *${p}yta3 <song name or URL>*\n│  └⊷ Download audio\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎵 [YTA3] Request: ${searchQuery}`);
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

      const audioBuffer = await streamXWolf(searchQuery, 'mp3');
      if (!audioBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Download failed. Please try again later.` }, { quoted: m });
      }
      const trackTitle = videoInfo.title || 'Audio';
      const quality    = '192kbps';
      const thumbUrl   = videoInfo.thumbnail;

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
            body:                `🎵 ${videoInfo.duration ? videoInfo.duration + ' | ' : ''}${quality} | ${sizeMB}MB | Downloaded by ${getBotName()}`,
            mediaType:           2,
            thumbnail:           thumbnailBuffer,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [YTA3] Success: ${trackTitle} (${sizeMB}MB) via /stream`);

    } catch (error) {
      console.error('❌ [YTA3] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ YTA Error: ${error.message}` }, { quoted: m });
    }
  }
};
