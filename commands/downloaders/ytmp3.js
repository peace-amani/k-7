import { createRequire } from 'module';
import axios from 'axios';
import yts from 'yt-search';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setMusicSession } from '../../lib/musicSession.js';
import { queryKeithAudio } from '../../lib/keithApi.js';

const require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = require('gifted-btns'); } catch (e) {}

const GIFTED_BASE_DEFAULT = 'https://api.giftedtech.co.ke/api/download';
const AUDIO_ENDPOINTS = ['ytmp3', 'yta', 'dlmp3'];

async function queryAPI(url, endpoints, base) {
  const GIFTED_BASE = base || globalThis._apiOverrides?.['ytmp3'] || GIFTED_BASE_DEFAULT;
  for (const endpoint of endpoints) {
    try {
      const params = { apikey: 'gifted', url };
      if (endpoint === 'ytmp3') params.quality = '128kbps';
      const res = await axios.get(`${GIFTED_BASE}/${endpoint}`, { params, timeout: 25000 });
      if (res.data?.success && res.data?.result?.download_url) {
        return { success: true, data: res.data.result, endpoint };
      }
    } catch {}
  }
  return { success: false };
}

async function downloadAndValidate(url) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout: 90000,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    validateStatus: (s) => s >= 200 && s < 400
  });
  const buffer = Buffer.from(response.data);
  if (buffer.length < 1000) throw new Error('File too small, likely not audio');
  const header = buffer.slice(0, 50).toString('utf8').toLowerCase();
  if (header.includes('<!doctype') || header.includes('<html') || header.includes('bad gateway')) {
    throw new Error('Received HTML instead of audio');
  }
  return buffer;
}

export default {
  name: 'ytmp3',
  description: 'Download YouTube audio as MP3',
  category: 'Downloader',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p = prefix || '.';
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

    const searchQuery = args.length > 0 ? args.join(' ') : quotedText;

    if (!searchQuery) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎵 *YTMP3 DOWNLOADER* ⌋\n│\n├─⊷ *${p}ytmp3 <song name>*\n│  └⊷ Download audio\n├─⊷ *${p}ytmp3 <YouTube URL>*\n│  └⊷ Download from link\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎵 [YTMP3] Request: ${searchQuery}`);
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
        videos = [{ url: videoUrl, title: 'Audio', author: { name: '' }, timestamp: '', videoId, thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '' }];
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
          type: 'audio'
        });

        const buttons = [
          { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⬇️ Download MP3', id: `${p}songdl` }) }
        ];
        if (videos.length > 1) {
          buttons.push({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '➡️ Next Result', id: `${p}snext` }) });
        }

        try {
          const msgOpts = {
            title: v.title.substring(0, 60),
            text: `🎵 *${v.title}*\n👤 ${v.author?.name || 'Unknown'}\n⏱️ ${v.timestamp || 'N/A'}\n\n_Result 1 of ${videos.length}_`,
            footer: `🐺 ${getBotName()}`,
            interactiveButtons: buttons
          };
          if (thumbUrl) msgOpts.image = { url: thumbUrl };
          await giftedBtns.sendInteractiveMessage(sock, jid, msgOpts);
          await sock.sendMessage(jid, { react: { text: '🎵', key: m.key } });
          return;
        } catch (e) {
          console.log('[YTMP3] Button mode failed, falling back to download:', e?.message);
        }
      }

      let result = await queryAPI(videoUrl, AUDIO_ENDPOINTS);
      if (!result.success) result = await queryKeithAudio(videoUrl);
      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ MP3 download failed. All services unavailable. Try again later.` }, { quoted: m });
      }

      const { data, endpoint } = result;
      const v0 = videos[0] || {};
      const trackTitle = data.title || v0.title || 'Audio';
      const quality = data.quality || '128kbps';
      const thumbUrl = data.thumbnail || v0.thumbnail || (v0.videoId ? `https://i.ytimg.com/vi/${v0.videoId}/hqdefault.jpg` : null);

      console.log(`🎵 [YTMP3] Found via ${endpoint}: ${trackTitle}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const audioBuffer = await downloadAndValidate(data.download_url);
      const fileSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);

      if (parseFloat(fileSizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ MP3 too large: ${fileSizeMB}MB\nMax size: 50MB` }, { quoted: m });
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
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${cleanTitle}.mp3`,
        contextInfo: {
          externalAdReply: {
            title: trackTitle.substring(0, 60),
            body: `🎵 ${quality} • ${fileSizeMB}MB | Downloaded by ${getBotName()}`,
            mediaType: 2,
            thumbnail: thumbnailBuffer,
            sourceUrl: videoUrl,
            mediaUrl: videoUrl,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [YTMP3] Success: ${trackTitle} (${fileSizeMB}MB) via ${endpoint}`);

    } catch (error) {
      console.error('❌ [YTMP3] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
    }
  }
};
