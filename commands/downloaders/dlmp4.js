import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { xwolfSearch, streamXWolf } from '../../lib/xwolfApi.js';

export default {
  name: 'dlmp4',
  aliases: ['wolfmp4', 'wdlv'],
  description: 'Download MP4 video',
  category: 'Downloader',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p = prefix || '.';
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

    let searchQuery = args.length > 0 ? args.join(' ') : quotedText;

    if (!searchQuery) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎬 *DLMP4 DOWNLOADER* ⌋\n│\n├─⊷ *${p}dlmp4 <video name or URL>*\n│  └⊷ Download MP4 video\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎬 [DLMP4] Request: ${searchQuery}`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      const isUrl = /^https?:\/\//i.test(searchQuery);
      let videoInfo = { title: searchQuery, channelTitle: '', duration: '', thumbnail: '' };

      if (!isUrl) {
        const items = await xwolfSearch(searchQuery, 1);
        if (items.length) {
          const top = items[0];
          videoInfo = {
            title:        top.title       || searchQuery,
            channelTitle: top.channelTitle || '',
            duration:     top.duration    || '',
            thumbnail:    `https://img.youtube.com/vi/${top.id}/hqdefault.jpg`
          };
          searchQuery = `https://youtube.com/watch?v=${top.id}`;
        }
      } else {
        const videoId = searchQuery.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
        if (videoId) videoInfo.thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const videoBuffer = await streamXWolf(searchQuery, 'mp4', 150000);
      if (!videoBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Download failed. Please try again later.` }, { quoted: m });
      }
      const trackTitle = videoInfo.title || 'Video';
      const quality    = '360p';
      const thumbUrl   = videoInfo.thumbnail;

      const sizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
      if (parseFloat(sizeMB) > 99) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Video too large: ${sizeMB}MB. Max 99MB.` }, { quoted: m });
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
        video:     videoBuffer,
        mimetype:  'video/mp4',
        caption:   `🎬 *${trackTitle}*\n📹 *Quality:* ${quality}\n📦 *Size:* ${sizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*`,
        fileName:  `${cleanTitle}.mp4`,
        thumbnail: thumbnailBuffer,
        gifPlayback: false
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [DLMP4] Success: ${trackTitle} (${sizeMB}MB) via /stream`);

    } catch (error) {
      console.error('❌ [DLMP4] Fatal error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ DLMP4 Error: ${error.message}` }, { quoted: m });
    }
  }
};
