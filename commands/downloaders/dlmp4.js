import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { xwolfSearch, streamXWolf } from '../../lib/xwolfApi.js';
import { xcasperVideo } from '../../lib/xcasperApi.js';

const XWOLF_BASE = 'https://apis.xwolf.space/download';

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
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const isUrl = /^https?:\/\//i.test(searchQuery);
      let videoSource = null; // { url } or Buffer
      let trackTitle = searchQuery;
      let thumbnail = '';
      let quality = '360p';

      // PRIMARY: xwolf /download/dlmp4?q=<query> — search + download in one step
      if (!isUrl) {
        try {
          const r = await axios.get(`${XWOLF_BASE}/dlmp4`, {
            params: { q: searchQuery },
            timeout: 60000
          });
          const d = r.data;
          if (d?.success && d?.downloadUrl) {
            console.log(`[xwolf/dlmp4] ✅ got URL: ${d.title}`);
            trackTitle = d.title || searchQuery;
            quality = d.quality || '360p';
            if (d.videoId) thumbnail = `https://img.youtube.com/vi/${d.videoId}/hqdefault.jpg`;
            videoSource = { url: d.downloadUrl };
          }
        } catch (e) {
          console.log(`[xwolf/dlmp4] failed: ${e.message}`);
        }
      }

      // FALLBACK: search → streamXWolf → xcasperVideo (buffer-based)
      if (!videoSource) {
        let ytUrl = searchQuery;
        if (!isUrl) {
          const items = await xwolfSearch(searchQuery, 5);
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
        let buf = await streamXWolf(ytUrl, 'mp4', 150000);
        if (!buf) buf = await xcasperVideo(ytUrl);
        if (buf) videoSource = buf;
      }

      if (!videoSource) {
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
      const isBuffer = Buffer.isBuffer(videoSource);
      const sizeMB = isBuffer ? (videoSource.length / 1024 / 1024).toFixed(1) : '?';

      if (isBuffer && parseFloat(sizeMB) > 99) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Video too large: ${sizeMB}MB. Max 99MB.` }, { quoted: m });
      }

      await sock.sendMessage(jid, {
        video:       isBuffer ? videoSource : videoSource,
        mimetype:    'video/mp4',
        caption:     `🎬 *${trackTitle}*\n📹 *Quality:* ${quality}${isBuffer ? `\n📦 *Size:* ${sizeMB}MB` : ''}\n\n🐺 *Downloaded by ${getBotName()}*`,
        fileName:    `${cleanTitle}.mp4`,
        thumbnail:   thumbnailBuffer,
        gifPlayback: false
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [DLMP4] Success: ${trackTitle}`);

    } catch (error) {
      console.error('❌ [DLMP4] Fatal error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ DLMP4 Error: ${error.message}` }, { quoted: m });
    }
  }
};
