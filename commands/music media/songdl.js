import axios from 'axios';
import { getMusicSession, clearMusicSession } from '../../lib/musicSession.js';
import { getBotName } from '../../lib/botname.js';
import { keithAudio } from '../../lib/keithApi.js';

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
        text: `⚠️ No active music session. Search first with *${prefix || '/'}song* or *${prefix || '/'}play*`
      }, { quoted: m });
    }

    const v = session.videos[session.index];
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      console.log(`🎵 [SONGDL] Downloading: ${v.title || v.url}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const audioBuffer = await keithAudio(v.url);

      if (!audioBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: '❌ Download failed. Try again later.' }, { quoted: m });
      }

      const fileSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);
      if (parseFloat(fileSizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ File too large (${fileSizeMB}MB). Maximum is 50MB.` }, { quoted: m });
      }

      const trackTitle = v.title || 'Audio';
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
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${cleanTitle}.mp3`,
        contextInfo: {
          externalAdReply: {
            title: trackTitle.substring(0, 60),
            body: `🎵 ${v.author ? v.author + ' | ' : ''}${v.duration ? '⏱️ ' + v.duration + ' | ' : ''}${fileSizeMB}MB | ${getBotName()}`,
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
      console.log(`✅ [SONGDL] Success: "${trackTitle}" (${fileSizeMB}MB)`);

    } catch (error) {
      console.error('❌ [SONGDL] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
    }
  }
};
