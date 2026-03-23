import axios from 'axios';
import yts from 'yt-search';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { keithVideo } from '../../lib/keithApi.js';

export default {
  name: 'dlmp4',
  aliases: ['wolfmp4', 'wdlv'],
  description: 'Download MP4 video',
  category: 'Downloader',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p = prefix || '.';
    const quotedText = m.quoted?.text?.trim()
      || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim()
      || '';

    let searchQuery = args.length > 0 ? args.join(' ') : quotedText;

    if (!searchQuery) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎬 *DLMP4 DOWNLOADER* ⌋\n│\n├─⊷ *${p}dlmp4 <video name or URL>*\n│  └⊷ Download MP4 video\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ _Powered by ${getOwnerName().toUpperCase()} TECH_`
      }, { quoted: m });
    }

    console.log(`🎬 [DLMP4] Request: ${searchQuery}`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      const isUrl = /^https?:\/\//i.test(searchQuery);
      let ytUrl = searchQuery;
      let trackTitle = searchQuery;
      let thumbnail = '';

      if (!isUrl) {
        const { videos } = await yts(searchQuery);
        if (videos?.length) {
          const top = videos[0];
          ytUrl      = top.url;
          trackTitle = top.title || searchQuery;
          thumbnail  = top.thumbnail || `https://img.youtube.com/vi/${top.videoId}/hqdefault.jpg`;
        }
      } else {
        const vid = searchQuery.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
        if (vid) thumbnail = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const videoBuffer = await keithVideo(ytUrl);

      if (!videoBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Download failed. Please try again later.` }, { quoted: m });
      }

      const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(1);
      if (parseFloat(sizeMB) > 99) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Video too large: ${sizeMB}MB. Max 99MB.` }, { quoted: m });
      }

      let thumbnailBuffer = null;
      if (thumbnail) {
        try {
          const tr = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
          if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
        } catch {}
      }

      const cleanTitle = trackTitle.replace(/[^\w\s.-]/gi, '').substring(0, 50);

      await sock.sendMessage(jid, {
        video:       videoBuffer,
        mimetype:    'video/mp4',
        caption:     `🎬 *${trackTitle}*\n📦 *Size:* ${sizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*`,
        fileName:    `${cleanTitle}.mp4`,
        thumbnail:   thumbnailBuffer,
        gifPlayback: false
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [DLMP4] Success: ${trackTitle} (${sizeMB}MB)`);

    } catch (error) {
      console.error('❌ [DLMP4] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ DLMP4 Error: ${error.message}` }, { quoted: m });
    }
  }
};
