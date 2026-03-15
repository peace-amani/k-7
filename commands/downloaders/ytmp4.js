import { createRequire } from 'module';
import axios from 'axios';
import yts from 'yt-search';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setMusicSession } from '../../lib/musicSession.js';
import { queryKeithVideo } from '../../lib/keithApi.js';

const require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = require('gifted-btns'); } catch (e) {}

const GIFTED_BASE_DEFAULT = 'https://api.giftedtech.co.ke/api/download';
const VIDEO_ENDPOINTS = ['ytv', 'dlmp4', 'ytmp4'];

async function queryAPI(url, endpoints) {
  const GIFTED_BASE = globalThis._apiOverrides?.['ytmp4'] || GIFTED_BASE_DEFAULT;
  for (const endpoint of endpoints) {
    try {
      const res = await axios.get(`${GIFTED_BASE}/${endpoint}`, {
        params: { apikey: 'gifted', url },
        timeout: 30000
      });
      if (res.data?.success && res.data?.result?.download_url) {
        return { success: true, data: res.data.result, endpoint };
      }
    } catch {}
  }
  return { success: false };
}

async function downloadAndValidate(url, timeout = 120000) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    validateStatus: (s) => s >= 200 && s < 400
  });
  const buffer = Buffer.from(response.data);
  if (buffer.length < 5000) throw new Error('File too small, likely not video');
  const header = buffer.slice(0, 50).toString('utf8').toLowerCase();
  if (header.includes('<!doctype') || header.includes('<html') || header.includes('bad gateway')) {
    throw new Error('Received HTML instead of video');
  }
  return buffer;
}

export default {
  name: 'ytmp4',
  description: 'Download YouTube videos as MP4',
  category: 'Downloader',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p = prefix || '.';
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

    const searchQuery = args.length > 0 ? args.join(' ') : quotedText;

    if (!searchQuery) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎬 *YTMP4 DOWNLOADER* ⌋\n│\n├─⊷ *${p}ytmp4 <video name>*\n│  └⊷ Download video\n├─⊷ *${p}ytmp4 <YouTube URL>*\n│  └⊷ Download from link\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎬 [YTMP4] Request: ${searchQuery}`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      let videos = [];
      let videoUrl = searchQuery;

      if (!searchQuery.match(/(youtube\.com|youtu\.be)/i)) {
        const result = await yts(searchQuery);
        if (result?.videos?.length) {
          videos = result.videos.slice(0, 5);
          videoUrl = videos[0].url;
        }
      } else {
        const videoId = videoUrl.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
        videos = [{ url: videoUrl, title: 'Video', author: { name: '' }, timestamp: '', videoId, thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '' }];
      }

      if (isButtonModeEnabled() && giftedBtns?.sendInteractiveMessage && videos.length) {
        const v = videos[0];
        const thumbUrl = v.thumbnail || (v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : null);

        setMusicSession(jid, {
          videos: videos.map(vd => ({
            url: vd.url,
            title: vd.title,
            author: vd.author?.name || '',
            duration: vd.timestamp || '',
            videoId: vd.videoId || '',
            thumbnail: vd.thumbnail || (vd.videoId ? `https://i.ytimg.com/vi/${vd.videoId}/hqdefault.jpg` : '')
          })),
          index: 0,
          type: 'video'
        });

        const buttons = [
          { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⬇️ Download Video', id: `${p}viddl` }) }
        ];
        if (videos.length > 1) {
          buttons.push({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '➡️ Next Result', id: `${p}vnext` }) });
        }

        try {
          const msgOpts = {
            title: v.title.substring(0, 60),
            text: `🎬 *${v.title}*\n👤 ${v.author?.name || 'Unknown'}\n⏱️ ${v.timestamp || 'N/A'}\n\n_Result 1 of ${videos.length}_`,
            footer: `🐺 ${getBotName()}`,
            interactiveButtons: buttons
          };
          if (thumbUrl) msgOpts.image = { url: thumbUrl };
          await giftedBtns.sendInteractiveMessage(sock, jid, msgOpts);
          await sock.sendMessage(jid, { react: { text: '🎬', key: m.key } });
          return;
        } catch (e) {
          console.log('[YTMP4] Button mode failed, falling back to download:', e?.message);
        }
      }

      let result = await queryAPI(videoUrl, VIDEO_ENDPOINTS);
      if (!result.success) result = await queryKeithVideo(videoUrl);
      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Video download failed. All services unavailable. Try again later.` }, { quoted: m });
      }

      const { data, endpoint } = result;
      const v0 = videos[0] || {};
      const trackTitle = data.title || v0.title || 'Video';
      const quality = data.quality || 'HD';
      const thumbUrl = data.thumbnail || v0.thumbnail;

      console.log(`🎬 [YTMP4] Found via ${endpoint}: ${trackTitle}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const videoBuffer = await downloadAndValidate(data.download_url);
      const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);

      if (parseFloat(fileSizeMB) > 99) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Video too large: ${fileSizeMB}MB\nMax size: 99MB` }, { quoted: m });
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
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption: `🎬 *${trackTitle}*\n📹 *Quality:* ${quality}\n📦 *Size:* ${fileSizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*`,
        fileName: `${cleanTitle}.mp4`,
        thumbnail: thumbnailBuffer,
        gifPlayback: false
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [YTMP4] Success: ${trackTitle} (${fileSizeMB}MB) via ${endpoint}`);

    } catch (error) {
      console.error('❌ [YTMP4] Fatal error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
    }
  }
};
