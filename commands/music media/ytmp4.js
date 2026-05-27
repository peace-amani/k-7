import axios from 'axios';
import yts from 'yt-search';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { xwolfDownloadVideo } from '../../lib/xwolfApi.js';

const XCASPER_VIDEO_API = 'https://apis.xcasper.space/api/downloader/yt-video';
const KEITH_VIDEO_API   = 'https://apiskeith.top/download/video';

// ── Search YouTube and return first result URL ────────────────────────────
async function searchYouTube(query) {
  const { videos } = await yts(query);
  if (!videos?.length) throw new Error('No YouTube results found for that search.');
  const v = videos[0];
  return {
    url:       `https://www.youtube.com/watch?v=${v.videoId}`,
    title:     v.title     || '',
    thumbnail: v.thumbnail || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`
  };
}

// ── Fetch video info + download URLs from XCasper ────────────────────────
async function xcasperVideo(ytUrl) {
  const res = await axios.get(XCASPER_VIDEO_API, {
    params: { url: ytUrl },
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const d = res.data;
  if (!d?.success || !Array.isArray(d?.videos) || !d.videos.length) {
    throw new Error(d?.message || 'XCasper returned no video links');
  }
  return d;
}

// ── Download video buffer via Keith API ───────────────────────────────────
async function keithVideo(ytUrl) {
  const res = await axios.get(KEITH_VIDEO_API, {
    params: { url: ytUrl },
    timeout: 35000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const d = res.data;
  if (d?.status !== true || typeof d?.result !== 'string' || !d.result.startsWith('http')) {
    throw new Error(d?.message || 'Keith video: no result URL');
  }
  console.log(`[keith/video] got URL, downloading...`);
  const dl = await axios.get(d.result, {
    responseType: 'arraybuffer',
    timeout: 180000,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const buf = Buffer.from(dl.data);
  if (buf.length < 10000) throw new Error('Keith video: downloaded file too small');
  console.log(`[keith/video] ✅ ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
  return buf;
}

// ── Pick best quality at or below the requested quality ──────────────────
// Preference: 360p default. Tries exact match first, then next available.
function pickQuality(videos, preferred = '360p') {
  const order = ['360p', '480p', '720p', '1080p'];
  const preferredIndex = order.indexOf(preferred);
  // Try preferred first, then go up in quality, then down
  const sorted = [...order.slice(preferredIndex), ...order.slice(0, preferredIndex).reverse()];
  for (const q of sorted) {
    const match = videos.find(v => v.quality === q && v.url);
    if (match) return match;
  }
  return videos.find(v => v.url) || null;
}

export default {
  name: 'ytmp4',
  aliases: ['video', 'mp4', 'ytvideo', 'vid'],
  category: 'Downloader',
  description: 'Download a YouTube video',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p   = prefix || '/';
    const quotedText = m.quoted?.text?.trim()
      || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim()
      || '';

    let input = args.join(' ').trim() || quotedText;

    if (!input) {
      return sock.sendMessage(jid, {
        text:
          `╭─⌈ 🎬 *VIDEO DOWNLOADER* ⌋\n` +
          `│\n` +
          `├─⊷ *${p}ytmp4 <video name>*\n` +
          `│  └⊷ Search and download\n` +
          `├─⊷ *${p}ytmp4 <YouTube URL>*\n` +
          `│  └⊷ Download from link\n` +
          `├─⊷ *${p}ytmp4 720 <name or URL>*\n` +
          `│  └⊷ Choose quality (360/480/720/1080)\n` +
          `│\n` +
          `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    // ── Optional quality prefix e.g. "720 Starboy" or "1080 https://..." ──
    const qualityMap = { '360': '360p', '480': '480p', '720': '720p', '1080': '1080p' };
    let preferredQuality = '360p';
    const firstWord = args[0];
    if (qualityMap[firstWord]) {
      preferredQuality = qualityMap[firstWord];
      input = args.slice(1).join(' ').trim() || quotedText;
    }

    if (!input) {
      return sock.sendMessage(jid, { text: `❌ Please provide a video name or YouTube URL.` }, { quoted: m });
    }

    console.log(`🎬 [YTMP4] Query: "${input}" | Quality: ${preferredQuality}`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      // ── Step 1: Resolve to a YouTube URL + metadata ───────────────────────
      const isUrl = /^https?:\/\//i.test(input);
      let ytUrl    = input;
      let metaTitle     = 'YouTube Video';
      let metaThumbnail = '';

      if (!isUrl) {
        console.log(`🎬 [YTMP4] Searching YouTube for: "${input}"`);
        const found = await searchYouTube(input);
        ytUrl         = found.url;
        metaTitle     = found.title     || metaTitle;
        metaThumbnail = found.thumbnail || metaThumbnail;
        console.log(`🎬 [YTMP4] Found: ${ytUrl}`);
      } else {
        const vid = ytUrl.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
        if (vid) metaThumbnail = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      // ── Step 2: Try xwolf first, then XCasper, then Keith as fallback ─────
      let videoBuffer = null;
      let title       = metaTitle;
      let thumbnail   = metaThumbnail;
      let quality     = preferredQuality;

      console.log(`🎬 [YTMP4] Trying xwolf (primary)...`);
      try {
        const xwBuf = await xwolfDownloadVideo(ytUrl);
        if (xwBuf) {
          videoBuffer = xwBuf;
          if (xwBuf._meta?.title)     title     = xwBuf._meta.title;
          if (xwBuf._meta?.thumbnail) thumbnail = xwBuf._meta.thumbnail;
          if (xwBuf._meta?.quality)   quality   = xwBuf._meta.quality;
          console.log(`✅ [YTMP4] xwolf: ${(videoBuffer.length/1024/1024).toFixed(1)}MB @ ${quality}`);
        }
      } catch (xwErr) {
        console.log(`⚠️ [YTMP4] xwolf failed: ${xwErr.message}`);
      }

      if (!videoBuffer) {
        console.log(`🎬 [YTMP4] Trying XCasper...`);
        try {
          const data   = await xcasperVideo(ytUrl);
          const chosen = pickQuality(data.videos, preferredQuality);
          if (!chosen) throw new Error('no usable format from XCasper');
          title     = data.title     || title;
          thumbnail = data.thumbnail || thumbnail;
          quality   = chosen.quality;
          console.log(`🎬 [YTMP4] XCasper: ${quality} — downloading...`);
          const dlRes = await axios.get(chosen.url, {
            responseType: 'arraybuffer', timeout: 180000, maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          videoBuffer = Buffer.from(dlRes.data);
          if (videoBuffer.length < 10000) throw new Error('XCasper: buffer too small');
          console.log(`✅ [YTMP4] XCasper: ${(videoBuffer.length/1024/1024).toFixed(1)}MB`);
        } catch (xcErr) {
          console.log(`⚠️ [YTMP4] XCasper failed: ${xcErr.message} — trying Keith...`);
          videoBuffer = await keithVideo(ytUrl);
          quality     = 'HD';
        }
      }

      if (!videoBuffer) throw new Error('All video sources failed. Try again later.');

      const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(1);
      if (videoBuffer.length < 10000) throw new Error('Downloaded file is too small — possible error response.');

      if (parseFloat(sizeMB) > 64) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ Video too large (${sizeMB}MB). WhatsApp limit is 64MB.\nTry a lower quality: *${p}ytmp4 360 <title>*`
        }, { quoted: m });
      }

      console.log(`🎬 [YTMP4] Downloaded ${sizeMB}MB — sending...`);

      // ── Step 4: Get thumbnail buffer ──────────────────────────────────────
      let thumbnailBuffer = null;
      if (thumbnail) {
        try {
          const tr = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
          if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
        } catch {}
      }

      const cleanTitle = title.replace(/[^\w\s.-]/gi, '').substring(0, 50);

      // ── Step 5: Send ──────────────────────────────────────────────────────
      await sock.sendMessage(jid, {
        video:    videoBuffer,
        mimetype: 'video/mp4',
        fileName: `${cleanTitle}.mp4`,
        caption:  `🎬 *${title}*\n📹 ${quality} • ${sizeMB}MB\n🐺 ${getBotName()}`,
        contextInfo: {
          externalAdReply: {
            title:               title.substring(0, 60),
            body:                `📹 ${quality} • ${sizeMB}MB | ${getBotName()}`,
            mediaType:           2,
            thumbnail:           thumbnailBuffer,
            sourceUrl:           ytUrl,
            mediaUrl:            ytUrl,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [YTMP4] Sent: "${title}" (${quality}, ${sizeMB}MB)`);

    } catch (err) {
      console.error(`❌ [YTMP4] ${err.message}`);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *Video download failed.*\n\n_${err.message}_`
      }, { quoted: m });
    }
  }
};
