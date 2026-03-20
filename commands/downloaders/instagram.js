import { createRequire } from 'module';
import { igdl } from 'ruhend-scraper';
import axios from 'axios';
import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setActionSession } from '../../lib/actionSession.js';

const _req = createRequire(import.meta.url);
let giftedBtnsIg;
try { giftedBtnsIg = _req('gifted-btns'); } catch (e) {}

const XCASPER = 'https://apis.xcasper.space/api/downloader';
const TEMP_DIR = '/tmp/wolfbot_ig';

// ── MP4/video magic-byte check ────────────────────────────────────────────────
function isValidVideoBuffer(buf) {
  if (!buf || buf.length < 12) return false;
  const sig4 = buf.slice(4, 8).toString('ascii');
  if (['ftyp', 'free', 'moov', 'mdat', 'wide', 'skip'].includes(sig4)) return true;
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;
  return false;
}

function isValidImageBuffer(buf) {
  if (!buf || buf.length < 4) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf[0] === 0x47 && buf[1] === 0x49) return true; // GIF
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[4] === 0x57) return true; // WEBP
  return false;
}

// ── Download file with Content-Type + magic-byte validation ──────────────────
async function downloadToBuffer(url, timeoutMs = 60_000) {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'arraybuffer',
    timeout: timeoutMs,
    maxContentLength: 150 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      'Referer':    'https://www.instagram.com/',
      'Accept':     'video/mp4,video/*,image/*,*/*;q=0.8'
    }
  });

  const ct = (response.headers['content-type'] || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('text/plain')) {
    throw new Error(`IP-locked or expired: server returned ${ct}`);
  }

  const buf = Buffer.from(response.data);

  if (!isValidVideoBuffer(buf) && !isValidImageBuffer(buf)) {
    const preview = buf.slice(0, 24).toString('utf8').replace(/[\r\n]/g, ' ');
    throw new Error(`Not a valid media file (starts with: "${preview}")`);
  }

  return buf;
}

// ── Provider: ruhend-scraper (igdl → SnapSave internally) ─────────────────────
async function tryRuhend(url) {
  const result = await igdl(url);
  if (!result?.data || result.data.length === 0) return null;
  const items = result.data.filter(x => x?.url);
  if (items.length === 0) return null;
  console.log(`[IG/ruhend] ✅ ${items.length} item(s)`);
  return items.map(x => ({
    mediaUrl: x.url,
    isVideo: x.url?.includes('.mp4') || x.type === 'video' || url.includes('/reel/') || url.includes('/tv/')
  }));
}

// ── Provider: SnapSave direct (decode obfuscated JS response) ─────────────────
async function trySnapSave(url) {
  const res = await axios({
    method: 'POST',
    url: 'https://snapsave.app/action.php?lang=en',
    data: new URLSearchParams({ url }),
    headers: {
      'Content-Type':    'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin':          'https://snapsave.app',
      'Referer':         'https://snapsave.app/',
      'X-Requested-With':'XMLHttpRequest',
    },
    timeout: 20000
  });

  if (typeof res.data !== 'string') return null;

  // Decode the obfuscated eval() response inside a safe VM
  let html = '';
  try {
    const sandbox = {};
    vm.createContext(sandbox);
    const code = res.data.replace(/^eval\(/, 'output=(').replace(/\)\s*$/, ')');
    vm.runInContext(code, sandbox, { timeout: 3000 });
    html = sandbox.output || '';
  } catch {
    html = res.data;
  }

  if (!html || html.includes('Unable to connect') || html.includes('error_api')) return null;

  // Extract download URLs
  const matches = [...html.matchAll(/href="([^"]+)"/g)]
    .map(m => m[1])
    .filter(u => u.startsWith('http') && !u.includes('snapsave.app'));

  const isVideo = url.includes('/reel/') || url.includes('/tv/')
    || matches.some(u => u.includes('.mp4'));

  if (matches.length === 0) return null;

  console.log(`[IG/snapsave] ✅ ${matches.length} URL(s)`);
  return matches.map(mediaUrl => ({ mediaUrl, isVideo }));
}

// ── Provider: xcasper ig chain ────────────────────────────────────────────────
async function tryXcasper(url) {
  for (const ep of ['ig', 'ig2', 'ig3', 'ig4']) {
    try {
      const res = await axios.get(`${XCASPER}/${ep}`, { params: { url }, timeout: 20000 });
      const d = res.data;
      if (!d?.success) { console.log(`[IG/xcasper-${ep}] failed`); continue; }

      const medias   = d.data?.medias || d.data?.media || d.medias || d.media || [];
      const mediaUrl = d.data?.url || d.url || (Array.isArray(medias) && medias[0]?.url) || null;
      if (!mediaUrl) continue;

      const isVideo = mediaUrl.includes('.mp4')
        || (Array.isArray(medias) && medias[0]?.type === 'video')
        || url.includes('/reel/') || url.includes('/tv/');

      const allUrls = Array.isArray(medias)
        ? medias.map(x => x.url).filter(Boolean)
        : [mediaUrl];

      console.log(`[IG/xcasper-${ep}] ✅ ${allUrls.length} item(s)`);
      return allUrls.map(u => ({ mediaUrl: u, isVideo }));
    } catch (e) {
      console.log(`[IG/xcasper-${ep}] error: ${e.message}`);
    }
  }
  return null;
}

// ── Provider: xwolf ───────────────────────────────────────────────────────────
async function tryXwolf(url) {
  const res = await axios.get('https://apis.xwolf.space/api/download/instagram', {
    params: { url }, timeout: 15000
  });
  const d = res.data;
  const mu = d?.result?.url || d?.url || d?.data?.url || null;
  if (!mu || typeof mu !== 'string' || !mu.startsWith('http')) return null;
  const isVideo = mu.includes('.mp4') || url.includes('/reel/') || url.includes('/tv/');
  console.log(`[IG/xwolf] ✅`);
  return [{ mediaUrl: mu, isVideo }];
}

// ── Main orchestrator ─────────────────────────────────────────────────────────
async function downloadInstagram(url) {
  if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

  const providers = [
    { name: 'ruhend-scraper', fn: () => tryRuhend(url)   },
    { name: 'snapsave',       fn: () => trySnapSave(url)  },
    { name: 'xcasper',        fn: () => tryXcasper(url)   },
    { name: 'xwolf',          fn: () => tryXwolf(url)     },
  ];

  for (const p of providers) {
    let items = null;
    try { items = await p.fn(); } catch (e) {
      console.log(`[IG/${p.name}] error: ${e.message.substring(0, 80)}`);
    }
    if (!items || items.length === 0) continue;

    // Try downloading each URL from this provider
    const downloaded = [];
    for (const { mediaUrl, isVideo } of items.slice(0, 3)) {
      try {
        const buf = await downloadToBuffer(mediaUrl, 60_000);
        downloaded.push({ buf, isVideo });
        console.log(`[IG/${p.name}] ✅ ${(buf.length / 1024 / 1024).toFixed(1)}MB valid media`);
      } catch (e) {
        console.log(`[IG/${p.name}] dl failed: ${e.message.substring(0, 80)}`);
      }
    }

    if (downloaded.length > 0) {
      return { success: true, items: downloaded, source: p.name };
    }
  }

  return {
    success: false,
    error: 'Instagram is blocking all server-based downloaders. This is a temporary Instagram restriction.'
  };
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
          text: `❌ *Instagram download failed*\n\n⚠️ ${result.error}\n\n💡 *Try manually:*\n• https://snapinsta.app\n• https://sssinstagram.com`
        }, { quoted: m });
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      let sentCount = 0;
      for (const { buf, isVideo } of result.items) {
        const sizeMB = (buf.length / 1024 / 1024).toFixed(1);

        if (parseFloat(sizeMB) > 50) {
          await sock.sendMessage(jid, {
            text: `⚠️ Item ${sentCount + 1} too large (${sizeMB}MB), skipping.`
          }, { quoted: m });
          continue;
        }

        const caption = sentCount === 0
          ? `📷 *Instagram ${isVideo ? 'Video' : 'Photo'}*\n📦 ${sizeMB}MB | 🐺 ${getBotName()}`
          : `Part ${sentCount + 1} | ${sizeMB}MB`;

        try {
          if (isVideo) {
            await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: m });
          } else {
            await sock.sendMessage(jid, { image: buf, caption }, { quoted: m });
          }
          sentCount++;
          if (sentCount < result.items.length) await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          console.log(`[IG] send failed for item ${sentCount + 1}: ${e.message}`);
        }
      }

      if (sentCount > 0) {
        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
        console.log(`✅ [IG] Sent ${sentCount} item(s) via ${result.source}`);
      } else {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        await sock.sendMessage(jid, {
          text: `❌ All items were too large or invalid.\n\n💡 Try manually: https://snapinsta.app`
        }, { quoted: m });
      }

    } catch (error) {
      console.error('❌ [IG] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *Error:* ${error.message}\n\n💡 Try: https://snapinsta.app`
      }, { quoted: m });
    }
  }
};

export { downloadInstagram };
