import { createRequire } from 'module';
import axios from 'axios';
import { createWriteStream, existsSync } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs';
import vm from 'vm';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setActionSession } from '../../lib/actionSession.js';

let _getUserCaption;
try {
  const _tk = await import('./tiktok.js');
  _getUserCaption = _tk.getUserCaption || ((uid) => `${getBotName()} is the Alpha`);
} catch { _getUserCaption = (uid) => `${getBotName()} is the Alpha`; }
function getCaption(uid) { return typeof _getUserCaption === 'function' ? _getUserCaption(uid) : `${getBotName()} is the Alpha`; }

const _req = createRequire(import.meta.url);
let giftedBtnsIg;
try { giftedBtnsIg = _req('gifted-btns'); } catch {}

const execAsync = promisify(exec);

// ── Stream a URL directly to a temp file (like tiktok.js downloadFile) ────────
async function downloadFile(url, filePath) {
  const writer = createWriteStream(filePath);
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    timeout: 90000,
    maxContentLength: 200 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'video/mp4,video/*,image/*,*/*;q=0.8',
      'Referer': 'https://www.instagram.com/',
    }
  });

  const ct = (response.headers['content-type'] || '').toLowerCase();
  if (ct.includes('text/html')) {
    writer.destroy();
    throw new Error(`IP-blocked: server returned HTML instead of media`);
  }

  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// ── Provider 1: apiskeith ─────────────────────────────────────────────────────
// Response: { status: true, creator, result: "<direct_url_string>" }
async function tryApisKeith(url) {
  const res = await axios.get('https://apiskeith.top/download/instadl', {
    params: { url },
    timeout: 25000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });

  const d = res.data;
  if (!d || d.status !== true) return null;

  const isVideo = url.includes('/reel/') || url.includes('/tv/');

  // result is a plain direct URL string
  if (typeof d.result === 'string' && d.result.startsWith('http')) {
    console.log(`[IG/apiskeith] ✅ single`);
    return [{ url: d.result, isVideo }];
  }

  // result is an object with items array (carousel)
  if (d.result && Array.isArray(d.result.items) && d.result.items.length > 0) {
    const items = d.result.items
      .map(x => {
        const u = x?.url || x?.download_url || x?.src || (typeof x === 'string' ? x : null);
        if (!u) return null;
        return { url: u, isVideo: x?.type === 'video' || u.includes('.mp4') || isVideo };
      })
      .filter(Boolean);
    if (items.length > 0) {
      console.log(`[IG/apiskeith] ✅ ${items.length} item(s)`);
      return items;
    }
  }

  return null;
}

// ── Provider 2: cobalt.tools ──────────────────────────────────────────────────
// cobalt proxies all media through its own CDN — URLs are NOT from Instagram CDN
// so they work from ANY server IP (VPS, Pterodactyl, Railway, etc.)
async function tryCobalt(url) {
  const res = await axios({
    method: 'POST',
    url: 'https://api.cobalt.tools/',
    data: { url, downloadMode: 'auto', videoQuality: '1080' },
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    timeout: 25000,
  });

  const d = res.data;
  if (!d || d.status === 'error') return null;

  const isVideo = url.includes('/reel/') || url.includes('/tv/');

  // Single video/reel — direct stream URL
  if (d.status === 'stream' && d.url) {
    console.log(`[IG/cobalt] ✅ stream`);
    return [{ url: d.url, isVideo }];
  }

  // Redirect response — also a single direct URL
  if (d.status === 'redirect' && d.url) {
    console.log(`[IG/cobalt] ✅ redirect`);
    return [{ url: d.url, isVideo }];
  }

  // Tunnel response — cobalt-proxied URL (works from any IP)
  if (d.status === 'tunnel' && d.url) {
    console.log(`[IG/cobalt] ✅ tunnel`);
    return [{ url: d.url, isVideo }];
  }

  // Carousel / multi-item post
  if (d.status === 'picker' && Array.isArray(d.picker) && d.picker.length > 0) {
    const items = d.picker.filter(x => x?.url).map(x => ({
      url: x.url,
      isVideo: x.type === 'video',
    }));
    if (items.length > 0) {
      console.log(`[IG/cobalt] ✅ picker — ${items.length} item(s)`);
      return items;
    }
  }

  return null;
}

// ── Provider 2: SnapSave ──────────────────────────────────────────────────────
async function trySnapSave(url) {
  const res = await axios({
    method: 'POST',
    url: 'https://snapsave.app/action.php?lang=en',
    data: new URLSearchParams({ url }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://snapsave.app',
      'Referer': 'https://snapsave.app/',
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeout: 20000
  });

  if (typeof res.data !== 'string') return null;

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

  const matches = [...html.matchAll(/href="([^"]+)"/g)]
    .map(m => m[1])
    .filter(u => u.startsWith('http') && !u.includes('snapsave.app'));

  if (matches.length === 0) return null;

  const isVideo = url.includes('/reel/') || url.includes('/tv/') || matches.some(u => u.includes('.mp4'));
  console.log(`[IG/snapsave] ✅ ${matches.length} URL(s)`);
  return matches.map(u => ({ url: u, isVideo }));
}

// ── Provider 3: xcasper chain ─────────────────────────────────────────────────
async function tryXcasper(url) {
  for (const ep of ['ig', 'ig2', 'ig3', 'ig4']) {
    try {
      const res = await axios.get(`https://apis.xcasper.space/api/downloader/${ep}`, {
        params: { url }, timeout: 20000
      });
      const d = res.data;
      if (!d?.success) continue;

      const medias = d.data?.medias || d.data?.media || d.medias || d.media || [];
      const mediaUrl = d.data?.url || d.url || (Array.isArray(medias) && medias[0]?.url) || null;
      if (!mediaUrl) continue;

      const isVideo = mediaUrl.includes('.mp4') || url.includes('/reel/') || url.includes('/tv/');
      const allUrls = Array.isArray(medias) ? medias.map(x => x.url).filter(Boolean) : [mediaUrl];

      console.log(`[IG/xcasper-${ep}] ✅ ${allUrls.length} item(s)`);
      return allUrls.map(u => ({ url: u, isVideo }));
    } catch (e) {
      console.log(`[IG/xcasper-${ep}] ${e.message?.slice(0, 60)}`);
    }
  }
  return null;
}

// ── Provider 4: yt-dlp (ultimate fallback — works from any IP) ────────────────
async function tryYtDlp(url) {
  try {
    await execAsync('yt-dlp --version', { timeout: 5000 });
  } catch {
    return null; // yt-dlp not installed
  }

  const ts = Date.now();
  const outPath = `/tmp/wolfbot_ig_ytdlp_${ts}.%(ext)s`;
  const finalPath = `/tmp/wolfbot_ig_ytdlp_${ts}.mp4`;

  try {
    await execAsync(
      `yt-dlp --no-playlist -f "best[ext=mp4]/best" -o "${outPath}" "${url}" --no-warnings`,
      { timeout: 120000 }
    );

    // yt-dlp may produce .webm or other extension — find the actual file
    const dir = '/tmp';
    const prefix = `wolfbot_ig_ytdlp_${ts}`;
    const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix));
    if (files.length === 0) return null;

    const actualPath = `/tmp/${files[0]}`;
    const isVideo = true;
    console.log(`[IG/yt-dlp] ✅ ${files[0]}`);
    return [{ filePath: actualPath, isVideo }];
  } catch (e) {
    console.log(`[IG/yt-dlp] failed: ${e.message?.slice(0, 80)}`);
    return null;
  }
}

// ── Main download orchestrator (tiktok.js pattern: stream to file) ─────────────
async function downloadInstagram(url) {
  const ts = Date.now();

  // ── Providers that return URLs (we stream them to temp files) ──────────────
  const urlProviders = [
    { name: 'apiskeith', fn: () => tryApisKeith(url) },
    { name: 'cobalt',    fn: () => tryCobalt(url)    },
    { name: 'snapsave',  fn: () => trySnapSave(url)  },
    { name: 'xcasper',   fn: () => tryXcasper(url)   },
  ];

  for (const p of urlProviders) {
    let items = null;
    try { items = await p.fn(); } catch (e) {
      console.log(`[IG/${p.name}] error: ${e.message?.slice(0, 80)}`);
    }
    if (!items || items.length === 0) continue;

    const downloaded = [];
    for (const { url: mediaUrl, isVideo } of items.slice(0, 4)) {
      try {
        const ext = isVideo ? 'mp4' : 'jpg';
        const filePath = `/tmp/wolfbot_ig_${p.name}_${ts}_${downloaded.length}.${ext}`;
        await downloadFile(mediaUrl, filePath);
        downloaded.push({ filePath, isVideo });
        console.log(`[IG/${p.name}] ✅ saved ${filePath}`);
      } catch (e) {
        console.log(`[IG/${p.name}] dl failed: ${e.message?.slice(0, 80)}`);
      }
    }

    if (downloaded.length > 0) {
      return { success: true, items: downloaded, source: p.name };
    }
  }

  // ── yt-dlp fallback (downloads directly, no URL needed) ──────────────────
  try {
    const ytItems = await tryYtDlp(url);
    if (ytItems) return { success: true, items: ytItems, source: 'yt-dlp' };
  } catch (e) {
    console.log(`[IG/yt-dlp] outer error: ${e.message}`);
  }

  return {
    success: false,
    error: 'All providers failed. Try: https://snapinsta.app or https://sssinstagram.com'
  };
}

// ── Cleanup helper ────────────────────────────────────────────────────────────
function cleanupFiles(items) {
  for (const { filePath } of items) {
    try { if (filePath && existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
  }
}

// ── URL validator ─────────────────────────────────────────────────────────────
function isValidInstagramUrl(url) {
  return [
    /https?:\/\/(?:www\.)?instagram\.com\/(p|reel|tv|reels)\/[a-zA-Z0-9_-]+/i,
    /https?:\/\/(?:www\.)?instagr\.am\/(p|reel|tv|reels)\/[a-zA-Z0-9_-]+/i,
  ].some(p => p.test(url));
}

// ── Command export ────────────────────────────────────────────────────────────
export default {
  name: 'instagram',
  aliases: ['ig', 'igdl', 'insta'],
  description: 'Download Instagram reels / posts / carousels',
  category: 'downloaders',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const userId = m.key.participant || m.key.remoteJid;

    // Show help if no explicit URL typed — check args[0] BEFORE falling back
    // to quoted text, so typing `.ig` alone always returns help regardless of
    // whether the user is quoting a message that contains a link.
    if (!args[0]) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 📷 *INSTAGRAM DOWNLOADER* ⌋\n│\n├─⊷ *${PREFIX}ig <url>*\n│  └⊷ Download reels / posts\n│\n├─⊷ *Examples:*\n│  └⊷ ${PREFIX}ig https://instagram.com/reel/xyz\n│  └⊷ ${PREFIX}ig https://instagram.com/p/xyz\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    // Resolve URL — explicit arg first, then quoted text as convenience fallback
    const url = (args[0] || m.quoted?.text?.trim() || '').trim();

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
          interactiveButtons: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⬇️ Download', id: `${PREFIX}igdlget` }) }]
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
          text: `❌ *Instagram download failed*\n\n⚠️ ${result.error}`
        }, { quoted: m });
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      let sentCount = 0;
      for (const { filePath, isVideo } of result.items) {
        try {
          const buf = fs.readFileSync(filePath);
          const sizeMB = (buf.length / 1024 / 1024).toFixed(1);

          if (parseFloat(sizeMB) > 50) {
            await sock.sendMessage(jid, {
              text: `⚠️ Item ${sentCount + 1} too large (${sizeMB}MB), skipping.`
            }, { quoted: m });
            continue;
          }

          const caption = sentCount === 0
            ? `📷 *Instagram ${isVideo ? 'Video' : 'Photo'}*\n📦 ${sizeMB}MB | 🐺 ${getBotName()}\n\n${getCaption(userId)}`
            : `Part ${sentCount + 1} | ${sizeMB}MB`;

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
          text: `❌ All items were too large or failed to send.\n\n💡 Try: https://snapinsta.app`
        }, { quoted: m });
      }

      cleanupFiles(result.items);

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
