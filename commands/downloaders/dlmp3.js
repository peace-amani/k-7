import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { streamXWolf } from '../../lib/xwolfApi.js';
import { xcasperAudio } from '../../lib/xcasperApi.js';

const XWOLF_BASE = 'https://apis.xwolf.space/download';

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
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const isUrl = /^https?:\/\//i.test(searchQuery);
      let audioSource = null; // { url } or Buffer
      let trackTitle = searchQuery;
      let thumbnail = '';
      let quality = '192kbps';

      // PRIMARY: xwolf /download/dlmp3?q=<query> — returns downloadUrl directly
      if (!isUrl) {
        try {
          const r = await axios.get(`${XWOLF_BASE}/dlmp3`, {
            params: { q: searchQuery },
            timeout: 60000
          });
          const d = r.data;
          if (d?.success && d?.downloadUrl) {
            console.log(`[xwolf/dlmp3] ✅ got URL: ${d.title}`);
            trackTitle = d.title || searchQuery;
            quality = d.quality || '192kbps';
            if (d.videoId) thumbnail = `https://img.youtube.com/vi/${d.videoId}/hqdefault.jpg`;
            audioSource = { url: d.downloadUrl };
          }
        } catch (e) {
          console.log(`[xwolf/dlmp3] failed: ${e.message}`);
        }
      }

      // FALLBACK: streamXWolf → xcasperAudio (buffer-based)
      if (!audioSource) {
        let ytUrl = searchQuery;
        if (!isUrl) {
          // derive YouTube URL from search
          const { xwolfSearch } = await import('../../lib/xwolfApi.js');
          const items = await xwolfSearch(searchQuery, 1);
          if (items.length) {
            const top = items[0];
            trackTitle = top.title || searchQuery;
            thumbnail = `https://img.youtube.com/vi/${top.id}/hqdefault.jpg`;
            ytUrl = `https://youtube.com/watch?v=${top.id}`;
          }
        } else {
          const vid = searchQuery.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
          if (vid) thumbnail = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
        }
        let buf = await streamXWolf(ytUrl, 'mp3');
        if (!buf) buf = await xcasperAudio(ytUrl);
        if (buf) audioSource = buf;
      }

      if (!audioSource) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Download failed. Please try again later.` }, { quoted: m });
      }

      // Build thumbnail
      let thumbnailBuffer = null;
      if (thumbnail) {
        try {
          const tr = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
          if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
        } catch {}
      }

      const cleanTitle = trackTitle.replace(/[^\w\s.-]/gi, '').substring(0, 50);
      const isBuffer = Buffer.isBuffer(audioSource);
      const sizeMB = isBuffer ? (audioSource.length / 1024 / 1024).toFixed(1) : '?';

      if (isBuffer && parseFloat(sizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ File too large: ${sizeMB}MB (max 50MB)` }, { quoted: m });
      }

      await sock.sendMessage(jid, {
        audio:    isBuffer ? audioSource : audioSource,
        mimetype: 'audio/mpeg',
        ptt:      false,
        fileName: `${cleanTitle}.mp3`,
        contextInfo: {
          externalAdReply: {
            title:                 trackTitle.substring(0, 60),
            body:                  `🎵 ${quality}${isBuffer ? ` | ${sizeMB}MB` : ''} | Downloaded by ${getBotName()}`,
            mediaType:             2,
            thumbnail:             thumbnailBuffer,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [DLMP3] Success: ${trackTitle}`);

    } catch (error) {
      console.error('❌ [DLMP3] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ DLMP3 Error: ${error.message}` }, { quoted: m });
    }
  }
};
