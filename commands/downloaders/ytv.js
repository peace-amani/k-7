import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { queryXWolfVideo, xwolfSearch, downloadMediaBuffer } from '../../lib/xwolfApi.js';
import { queryKeithVideo } from '../../lib/keithApi.js';

export default {
  name: 'ytv',
  description: 'Download YouTube videos',
  category: 'Downloader',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p = prefix || '.';
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

    let searchQuery = args.length > 0 ? args.join(' ') : quotedText;

    if (!searchQuery) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎬 *YTV DOWNLOADER* ⌋\n│\n├─⊷ *${p}ytv <video name>*\n│  └⊷ Download video\n├─⊷ *${p}ytv <YouTube URL>*\n│  └⊷ Download from link\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎬 [YTV] Request: ${searchQuery}`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      const isUrl = /^https?:\/\//i.test(searchQuery);
      let videoId = '';
      let videoInfo = { title: searchQuery, channelTitle: '', duration: '', thumbnail: '' };

      if (!isUrl) {
        const items = await xwolfSearch(searchQuery, 5);
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

      let result = await queryXWolfVideo(searchQuery);
      if (!result.success) result = await queryKeithVideo(searchQuery);

      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Video download failed. All services unavailable. Try again later.` }, { quoted: m });
      }

      const { data, endpoint } = result;
      const trackTitle = data.title || videoInfo.title || 'Video';
      const quality    = data.quality || '360p';
      const thumbUrl   = data.thumbnail || videoInfo.thumbnail;

      console.log(`🎬 [YTV] Found via ${endpoint}: ${trackTitle}`);

      const videoBuffer = await downloadMediaBuffer(data.download_url, 120000);
      if (!videoBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Failed to download video. Please try again.` }, { quoted: m });
      }

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
      console.log(`✅ [YTV] Success: ${trackTitle} (${sizeMB}MB) via ${endpoint}`);

    } catch (error) {
      console.error('❌ [YTV] Fatal error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
    }
  }
};
