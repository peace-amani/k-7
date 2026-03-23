import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { xwolfSearch, streamXWolf } from '../../lib/xwolfApi.js';
import { xcasperAudio } from '../../lib/xcasperApi.js';
import { keithAudio } from '../../lib/keithApi.js';

export default {
  name: 'mp3',
  description: 'Download MP3 audio',
  category: 'Downloader',
  aliases: ['wolfaudio', 'waudio'],
  usage: 'mp3 <url or song name>',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p = prefix || '.';
    const quotedText = m.quoted?.text?.trim()
      || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim()
      || '';

    const searchQuery = args.length > 0 ? args.join(' ') : quotedText;

    if (!searchQuery) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎵 *MP3 DOWNLOADER* ⌋\n│\n├─⊷ *${p}mp3 <song name>*\n│  └⊷ Download audio\n├─⊷ *${p}mp3 <YouTube URL>*\n│  └⊷ Download from link\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎵 [MP3] Request: ${searchQuery}`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      const isUrl = /^https?:\/\//i.test(searchQuery);
      let ytUrl = searchQuery;
      let videoInfo = { title: searchQuery, channelTitle: '', duration: '', thumbnail: '' };

      if (!isUrl) {
        const items = await xwolfSearch(searchQuery, 1);
        if (items.length) {
          const top = items[0];
          ytUrl = `https://youtube.com/watch?v=${top.id}`;
          videoInfo = {
            title:        top.title       || searchQuery,
            channelTitle: top.channelTitle || '',
            duration:     top.duration    || '',
            thumbnail:    `https://img.youtube.com/vi/${top.id}/hqdefault.jpg`
          };
        }
      } else {
        const vid = searchQuery.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
        if (vid) videoInfo.thumbnail = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      let audioBuffer = await keithAudio(ytUrl);
      if (!audioBuffer) audioBuffer = await streamXWolf(ytUrl, 'mp3');
      if (!audioBuffer) audioBuffer = await xcasperAudio(ytUrl);

      if (!audioBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ *Download failed*\n\n🎵 ${videoInfo.title}\n\nAll sources failed. Try \`${p}ytmp3 ${searchQuery}\``
        }, { quoted: m });
      }

      const fileSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);
      if (parseFloat(fileSizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ File too large: ${fileSizeMB}MB (max 50MB)` }, { quoted: m });
      }

      let thumbnailBuffer = null;
      if (videoInfo.thumbnail) {
        try {
          const tr = await axios.get(videoInfo.thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
          if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
        } catch {}
      }

      const cleanTitle = videoInfo.title.replace(/[^\w\s.-]/gi, '').substring(0, 50);

      await sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${cleanTitle}.mp3`,
        contextInfo: {
          externalAdReply: {
            title: videoInfo.title.substring(0, 60),
            body: `🎵 ${videoInfo.duration ? videoInfo.duration + ' • ' : ''}${fileSizeMB}MB | Downloaded by ${getBotName()}`,
            mediaType: 2,
            thumbnail: thumbnailBuffer,
            sourceUrl: ytUrl,
            mediaUrl: ytUrl,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [MP3] Success: ${videoInfo.title} (${fileSizeMB}MB)`);

    } catch (error) {
      console.error('❌ [MP3] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *MP3 Error:* ${error.message}\n\nTry: \`${p}ytmp3 ${args.join(' ')}\``
      }, { quoted: m });
    }
  }
};
