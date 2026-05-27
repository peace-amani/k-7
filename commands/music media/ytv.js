import axios from 'axios';
import yts from 'yt-search';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { xwolfDownloadVideo } from '../../lib/xwolfApi.js';

const KEITH_BASE  = 'https://apiskeith.top/download';
const XCASPER_API = 'https://apis.xcasper.space/api/downloader/yt-video';

// ── Search YouTube and return first result ────────────────────────────────
async function searchYouTube(query) {
  const { videos } = await yts(query);
  if (!videos?.length) throw new Error('No YouTube results found for that search.');
  const v = videos[0];
  return {
    url:       `https://www.youtube.com/watch?v=${v.videoId}`,
    title:     v.title     || query,
    thumbnail: v.thumbnail || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`
  };
}

// ── Download buffer from URL, validates it's real media ───────────────────
async function downloadBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 180000,
    maxRedirects: 10,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    validateStatus: s => s >= 200 && s < 400
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 50000) throw new Error(`file too small (${buf.length} bytes) — server returned an error`);
  const hdr = buf.slice(0, 20).toString('utf8').toLowerCase();
  if (hdr.includes('<!doctype') || hdr.includes('<html')) throw new Error('server returned HTML instead of video');
  return buf;
}

// ── Keith video fallback chain (ytv → ytv4 → mp4) ────────────────────────
async function tryKeithVideo(ytUrl) {
  const endpoints = ['ytv', 'ytv4', 'mp4'];
  for (const ep of endpoints) {
    try {
      const res = await axios.get(`${KEITH_BASE}/${ep}`, {
        params: { url: ytUrl }, timeout: 35000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const d = res.data;
      if (!(d?.status === true || d?.success === true)) continue;
      if (typeof d?.result !== 'string' || !d.result.startsWith('http')) continue;
      if (d.result.includes('googlevideo.com')) { console.log(`[ytv/${ep}] skipping IP-locked Google CDN URL`); continue; }
      if (d.result === 'Waiting...') continue;
      console.log(`[ytv/${ep}] got URL, downloading...`);
      return await downloadBuffer(d.result);
    } catch (e) {
      console.log(`[ytv/${ep}] failed: ${e.message}`);
    }
  }
  throw new Error('all Keith video endpoints failed');
}

// ── Source 3: XCasper (360p) ──────────────────────────────────────────────
async function tryXcasper(ytUrl) {
  const res = await axios.get(XCASPER_API, {
    params: { url: ytUrl }, timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const d = res.data;
  if (!d?.success || !Array.isArray(d?.videos) || !d.videos.length) {
    throw new Error(d?.message || 'no videos in response');
  }
  const chosen = d.videos.find(v => v.quality === '360p' && v.url)
               || d.videos.find(v => v.quality === '480p' && v.url)
               || d.videos.find(v => v.url);
  if (!chosen) throw new Error('no usable video format');
  return await downloadBuffer(chosen.url);
}

export default {
  name: 'ytv',
  aliases: ['ytvid', 'keithtv'],
  category: 'Downloader',
  description: 'Download a YouTube video via Keith ytv API',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p   = prefix || '/';
    const quotedText = m.quoted?.text?.trim()
      || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim()
      || '';

    const input = args.join(' ').trim() || quotedText;

    if (!input) {
      return sock.sendMessage(jid, {
        text:
          `╭─⌈ 🎬 *YTV DOWNLOADER* ⌋\n` +
          `│\n` +
          `├─⊷ *${p}ytv <video name>*\n` +
          `│  └⊷ Search and download\n` +
          `├─⊷ *${p}ytv <YouTube URL>*\n` +
          `│  └⊷ Download from link\n` +
          `│\n` +
          `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎬 [YTV] Query: "${input}"`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      // ── Step 1: Resolve to YouTube URL + metadata ─────────────────────────
      const isUrl = /^https?:\/\//i.test(input);
      let ytUrl    = input;
      let title     = 'YouTube Video';
      let thumbnail = '';

      if (!isUrl) {
        console.log(`🎬 [YTV] Searching: "${input}"`);
        const found = await searchYouTube(input);
        ytUrl     = found.url;
        title     = found.title;
        thumbnail = found.thumbnail;
        console.log(`🎬 [YTV] Found: ${title} → ${ytUrl}`);
      } else {
        const vid = ytUrl.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
        if (vid) thumbnail = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      // ── Step 2: Download via fallback chain ───────────────────────────────
      let videoBuffer = null;

      // 1️⃣ xwolf (PRIMARY — iterates all 5 video endpoints)
      try {
        console.log(`🎬 [YTV] Trying xwolf (primary)...`);
        const xwBuf = await xwolfDownloadVideo(ytUrl);
        if (xwBuf) {
          videoBuffer = xwBuf;
          if (xwBuf._meta?.title)     title     = xwBuf._meta.title || title;
          if (xwBuf._meta?.thumbnail) thumbnail = xwBuf._meta.thumbnail || thumbnail;
          console.log(`🎬 [YTV] xwolf success`);
        }
      } catch (e) {
        console.log(`🎬 [YTV] xwolf failed: ${e.message}`);
      }

      // 2️⃣ Keith (ytv → ytv4 → mp4)
      if (!videoBuffer) {
        try {
          console.log(`🎬 [YTV] Trying Keith video endpoints...`);
          videoBuffer = await tryKeithVideo(ytUrl);
          console.log(`🎬 [YTV] Keith success`);
        } catch (e) {
          console.log(`🎬 [YTV] Keith all failed: ${e.message}`);
        }
      }

      // 3️⃣ XCasper 360p
      if (!videoBuffer) {
        console.log(`🎬 [YTV] Trying XCasper...`);
        videoBuffer = await tryXcasper(ytUrl);
        console.log(`🎬 [YTV] XCasper success`);
      }

      const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(1);
      console.log(`🎬 [YTV] Downloaded ${sizeMB}MB`);

      if (parseFloat(sizeMB) > 64) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ Video too large (${sizeMB}MB). WhatsApp limit is 64MB.\nTry *${p}ytmp4 360 <title>* for a lower quality.`
        }, { quoted: m });
      }

      // ── Step 4: Fetch thumbnail buffer ────────────────────────────────────
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
        caption:  `🎬 *${title}*\n📹 ${sizeMB}MB\n🐺 ${getBotName()}`,
        contextInfo: {
          externalAdReply: {
            title:               title.substring(0, 60),
            body:                `📹 ${sizeMB}MB | ${getBotName()}`,
            mediaType:           2,
            thumbnail:           thumbnailBuffer,
            sourceUrl:           ytUrl,
            mediaUrl:            ytUrl,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [YTV] Sent: "${title}" (${sizeMB}MB)`);

    } catch (err) {
      console.error(`❌ [YTV] ${err.message}`);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *YTV download failed.*\n\n_${err.message}_`
      }, { quoted: m });
    }
  }
};
