import axios from 'axios';
import yts from 'yt-search';
import { createRequire } from 'module';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setMusicSession } from '../../lib/musicSession.js';

const require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = require('gifted-btns'); } catch {}

const GIFTED_BASE = 'https://api.giftedtech.co.ke/api/download';
const YT_ENDPOINTS = ['ytv', 'dlmp4', 'ytmp4'];

function isFacebookUrl(url) {
  return /facebook\.com|fb\.watch|fb\.com/i.test(url);
}

async function queryYoutube(url) {
  for (const endpoint of YT_ENDPOINTS) {
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

async function queryFacebook(url) {
  try {
    const res = await axios.get(`${GIFTED_BASE}/facebookv2`, {
      params: { apikey: 'gifted', url },
      timeout: 30000
    });
    const r = res.data?.result;
    if (res.data?.success && r?.links?.length) {
      const best = r.links.find(l => l.ext === 'mp4') || r.links[0];
      return {
        success: true,
        downloadUrl: best.url || best.link,
        title: r.title,
        duration: r.duration,
        thumbnail: r.thumbnail,
        uploader: r.uploader,
        quality: best.quality,
        source: 'facebookv2'
      };
    }
  } catch {}

  try {
    const res = await axios.get(`${GIFTED_BASE}/facebook`, {
      params: { apikey: 'gifted', url },
      timeout: 30000
    });
    const r = res.data?.result;
    if (res.data?.success && (r?.hd_video || r?.sd_video)) {
      return {
        success: true,
        downloadUrl: r.hd_video || r.sd_video,
        title: r.title,
        duration: r.duration,
        thumbnail: r.thumbnail,
        quality: r.hd_video ? 'HD' : 'SD',
        source: 'facebook'
      };
    }
  } catch {}

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
  name: 'video',
  aliases: ['vid'],
  description: 'Download YouTube or Facebook videos',
  category: 'Downloader',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p = prefix || '.';
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';
    const searchQuery = args.length > 0 ? args.join(' ') : quotedText;

    if (!searchQuery) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎬 *VIDEO DOWNLOADER* ⌋\n│\n├─⊷ *${p}video <name or YouTube URL>*\n│  └⊷ Download YouTube video\n├─⊷ *${p}video <Facebook URL>*\n│  └⊷ Download Facebook reel/video\n├─⊷ Reply to a message to search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      if (isFacebookUrl(searchQuery)) {
        const fbResult = await queryFacebook(searchQuery);
        if (!fbResult.success) {
          await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
          return sock.sendMessage(jid, { text: `❌ Failed to fetch Facebook video. Make sure the URL is public and valid.` }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

        const videoBuffer = await downloadAndValidate(fbResult.downloadUrl);
        const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);

        if (parseFloat(fileSizeMB) > 99) {
          await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
          return sock.sendMessage(jid, { text: `❌ Video too large: ${fileSizeMB}MB\nMax size: 99MB` }, { quoted: m });
        }

        let thumbnailBuffer = null;
        if (fbResult.thumbnail) {
          try {
            const tr = await axios.get(fbResult.thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
            if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
          } catch {}
        }

        const title = fbResult.title || 'Facebook Video';
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '').substring(0, 50);
        const uploaderLine = fbResult.uploader ? `👤 *${fbResult.uploader}*\n` : '';
        const durationLine = fbResult.duration ? `⏱️ *${fbResult.duration}*\n` : '';

        await sock.sendMessage(jid, {
          video: videoBuffer,
          mimetype: 'video/mp4',
          caption: `🎬 *${title}*\n${uploaderLine}${durationLine}📦 *${fileSizeMB}MB* • ${fbResult.quality || 'HD'}\n\n🐺 *Downloaded by ${getBotName()}*`,
          fileName: `${cleanTitle}.mp4`,
          thumbnail: thumbnailBuffer,
          gifPlayback: false
        }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
        console.log(`\x1b[32m✅ [VIDEO] Facebook: ${title} (${fileSizeMB}MB)\x1b[0m`);
        return;
      }

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
        } catch {}
      }

      const result = await queryYoutube(videoUrl);
      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Video download failed. Try a different query or URL.` }, { quoted: m });
      }

      const { data, endpoint } = result;
      const v0 = videos[0] || {};
      const trackTitle = data.title || v0.title || 'Video';
      const quality = data.quality || 'HD';
      const thumbUrl = data.thumbnail || v0.thumbnail || (v0.videoId ? `https://i.ytimg.com/vi/${v0.videoId}/hqdefault.jpg` : null);

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
      console.log(`\x1b[32m✅ [VIDEO] YouTube: ${trackTitle} (${fileSizeMB}MB) via ${endpoint}\x1b[0m`);

    } catch (error) {
      console.error(`❌ [VIDEO] Error: ${error.message}`);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
    }
  }
};
