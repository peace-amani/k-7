import axios from 'axios';
import { getMusicSession, clearMusicSession } from '../../lib/musicSession.js';
import { getBotName } from '../../lib/botname.js';
import { keithVideo } from '../../lib/keithApi.js';

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
        text: `⚠️ No active video session. Search first with *${prefix || '/'}ytmp4* or *${prefix || '/'}video*`
      }, { quoted: m });
    }

    const v = session.videos[session.index];
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      console.log(`🎬 [VIDDL] Downloading: ${v.title || v.url}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const videoBuffer = await keithVideo(v.url);

      if (!videoBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: '❌ Video download failed. Try again later.' }, { quoted: m });
      }

      const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
      if (parseFloat(fileSizeMB) > 99) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Video too large (${fileSizeMB}MB). Maximum is 99MB.` }, { quoted: m });
      }

      const trackTitle = v.title || 'Video';
      const thumbUrl = v.thumbnail || (v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : null);

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
        caption: `🎬 *${trackTitle}*\n📦 *Size:* ${fileSizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*`,
        fileName: `${cleanTitle}.mp4`,
        thumbnail: thumbnailBuffer,
        gifPlayback: false
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      clearMusicSession(jid);
      console.log(`✅ [VIDDL] Success: "${trackTitle}" (${fileSizeMB}MB)`);

    } catch (error) {
      console.error('❌ [VIDDL] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
    }
  }
};
