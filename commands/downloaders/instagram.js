import { createRequire } from 'module';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setActionSession } from '../../lib/actionSession.js';

const _req = createRequire(import.meta.url);
let giftedBtnsIg;
try { giftedBtnsIg = _req('gifted-btns'); } catch (e) {}

const XCASPER = 'https://apis.xcasper.space/api/downloader';

// ── Validate that a buffer is actually a video (MP4 / WebM / MOV) ────────────
function isValidVideoBuffer(buf) {
  if (!buf || buf.length < 12) return false;
  // MP4 / MOV: bytes 4-7 = 'ftyp' or 'free' or 'moov' or 'mdat'
  const sig4 = buf.slice(4, 8).toString('ascii');
  if (['ftyp', 'free', 'moov', 'mdat', 'wide', 'skip'].includes(sig4)) return true;
  // WebM: starts with 0x1A 0x45 0xDF 0xA3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;
  return false;
}

// ── Download to buffer with Content-Type guard ────────────────────────────────
async function downloadVideoBuffer(url, timeoutMs = 60_000) {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'arraybuffer',
    timeout: timeoutMs,
    maxContentLength: 100 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      'Referer': 'https://www.instagram.com/',
      'Accept': 'video/mp4,video/*,*/*;q=0.8'
    }
  });

  const ct = (response.headers['content-type'] || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('text/plain')) {
    throw new Error(`Server returned HTML instead of video (Content-Type: ${ct}) — likely IP-locked or expired URL`);
  }

  const buf = Buffer.from(response.data);
  if (!isValidVideoBuffer(buf)) {
    const preview = buf.slice(0, 20).toString('utf8').replace(/\s+/g, ' ');
    throw new Error(`Downloaded data is not a valid video file (starts with: "${preview}")`);
  }

  return buf;
}

// ── Provider chain ────────────────────────────────────────────────────────────

async function tryXcasper(url) {
  for (const ep of ['ig', 'ig2', 'ig3', 'ig4']) {
    try {
      const res = await axios.get(`${XCASPER}/${ep}`, { params: { url }, timeout: 20000 });
      const d = res.data;
      if (!d?.success) { console.log(`[IG/xcasper-${ep}] failed: ${d?.message || d?.error}`); continue; }

      const medias   = d.data?.medias || d.data?.media || d.medias || d.media || [];
      const mediaUrl = d.data?.url || d.url || (Array.isArray(medias) && medias[0]?.url) || null;
      if (!mediaUrl) { console.log(`[IG/xcasper-${ep}] no URL in response`); continue; }

      const isVideo = mediaUrl.includes('.mp4')
        || (Array.isArray(medias) && medias[0]?.type === 'video')
        || url.includes('/reel/') || url.includes('/tv/');

      const allUrls = Array.isArray(medias)
        ? medias.map(x => x.url).filter(Boolean)
        : [mediaUrl];

      console.log(`[IG/xcasper-${ep}] ✅ ${allUrls.length} item(s)`);
      return { mediaUrl, allUrls, isVideo };
    } catch (e) {
      console.log(`[IG/xcasper-${ep}] error: ${e.message}`);
    }
  }
  return null;
}

async function tryGiftedTech(url) {
  const res = await axios.get('https://api.giftedtech.co.ke/api/download/instadlv2', {
    params: { apikey: 'gifted', url },
    timeout: 15000
  });
  const d = res.data;
  if (d?.status === 200 && d?.result?.download_url) {
    console.log('[IG/gifted] ✅');
    return { mediaUrl: d.result.download_url, allUrls: [d.result.download_url], isVideo: true };
  }
  return null;
}

async function tryXwolf(url) {
  const res = await axios.get('https://apis.xwolf.space/api/download/instagram', {
    params: { url },
    timeout: 15000
  });
  const d = res.data;
  const mu = d?.result?.url || d?.url || d?.data?.url || null;
  if (mu && typeof mu === 'string' && mu.startsWith('http')) {
    console.log('[IG/xwolf] ✅');
    return { mediaUrl: mu, allUrls: [mu], isVideo: mu.includes('.mp4') || url.includes('/reel/') };
  }
  return null;
}

// ── Main download orchestrator ────────────────────────────────────────────────
async function downloadInstagram(url) {
  const providers = [
    { name: 'xcasper',    fn: () => tryXcasper(url) },
    { name: 'xwolf',      fn: () => tryXwolf(url) },
    { name: 'giftedtech', fn: () => tryGiftedTech(url) },
  ];

  for (const p of providers) {
    let info = null;
    try {
      info = await p.fn();
    } catch (e) {
      console.log(`[IG/${p.name}] error: ${e.message}`);
    }
    if (!info) continue;

    // Try downloading each URL from this provider
    for (const dlUrl of info.allUrls) {
      try {
        console.log(`[IG/${p.name}] Downloading: ${dlUrl.substring(0, 80)}...`);
        const buf = await downloadVideoBuffer(dlUrl, 60_000);
        console.log(`[IG/${p.name}] ✅ ${(buf.length / 1024 / 1024).toFixed(1)}MB valid video`);
        return { success: true, buf, isVideo: info.isVideo, source: p.name };
      } catch (e) {
        console.log(`[IG/${p.name}] download failed: ${e.message}`);
      }
    }
  }

  return { success: false, error: 'All providers failed — Instagram is IP-restricting downloads from this server' };
}

// ── URL validator ─────────────────────────────────────────────────────────────
function isValidInstagramUrl(url) {
  return [
    /https?:\/\/(?:www\.)?instagram\.com\/(p|reel|tv|reels)\/[a-zA-Z0-9_-]+/i,
    /https?:\/\/(?:www\.)?instagr\.am\/(p|reel|tv|reels)\/[a-zA-Z0-9_-]+/i
  ].some(p => p.test(url));
}

// ── Command export ────────────────────────────────────────────────────────────
export default {
  name: 'instagram',
  aliases: ['ig', 'igdl', 'insta'],
  description: 'Download Instagram videos/photos without watermark',
  category: 'downloaders',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const url = (args[0] || m.quoted?.text?.trim() || '').trim();

    if (!url) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 📷 *INSTAGRAM DOWNLOADER* ⌋\n│\n├─⊷ *${PREFIX}ig <url>*\n│  └⊷ Download reels / posts\n│\n├─⊷ *Examples:*\n│  └⊷ ${PREFIX}ig https://instagram.com/reel/xyz\n│  └⊷ ${PREFIX}ig https://instagram.com/p/xyz\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    if (!isValidInstagramUrl(url)) {
      return sock.sendMessage(jid, {
        text: `❌ *Invalid Instagram URL*\n\nSupported:\n• instagram.com/p/...\n• instagram.com/reel/...`
      }, { quoted: m });
    }

    // Button mode card
    if (isButtonModeEnabled() && giftedBtnsIg?.sendInteractiveMessage) {
      const isReel = url.includes('/reel/');
      const mediaType = isReel ? 'Reel' : url.includes('/tv/') ? 'IGTV' : 'Post';
      const shortUrl = url.replace(/^https?:\/\/(www\.)?instagram\.com/, '').split('?')[0].slice(0, 40);
      const senderClean = (m.key.participant || m.key.remoteJid).split(':')[0].split('@')[0];
      setActionSession(`ig:${senderClean}:${jid.split('@')[0]}`, { url, mediaType }, 10 * 60 * 1000);
      try {
        await giftedBtnsIg.sendInteractiveMessage(sock, jid, {
          body: { text: `📷 *Instagram ${mediaType} Found*\n\n🔗 ${shortUrl}\n\n▸ Tap Download to get the media` },
          footer: { text: getBotName() },
          interactiveButtons: [{ type: 'quick_reply', display_text: '⬇️ Download', id: `${PREFIX}igdlget` }]
        }, { quoted: m });
        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
        return;
      } catch {}
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      const result = await downloadInstagram(url);

      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ *Instagram download failed*\n\n⚠️ Instagram actively blocks server downloads.\n\n💡 *Try manually:*\n• https://snapinsta.app\n• https://sssinstagram.com`
        }, { quoted: m });
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const { buf, isVideo } = result;
      const sizeMB = (buf.length / 1024 / 1024).toFixed(1);
      const caption = `📷 *Instagram ${isVideo ? 'Video' : 'Photo'}*\n📦 ${sizeMB}MB | 🐺 ${getBotName()}`;

      if (isVideo) {
        await sock.sendMessage(jid, {
          video:    buf,
          mimetype: 'video/mp4',
          caption
        }, { quoted: m });
      } else {
        await sock.sendMessage(jid, {
          image:   buf,
          caption
        }, { quoted: m });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [IG] Sent ${sizeMB}MB ${isVideo ? 'video' : 'image'}`);

    } catch (error) {
      console.error('❌ [IG] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *Error:* ${error.message}`
      }, { quoted: m });
    }
  }
};

export { downloadInstagram };
