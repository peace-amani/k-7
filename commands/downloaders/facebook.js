import { createRequire } from 'module';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setActionSession } from '../../lib/actionSession.js';
import { proxyFetch } from '../../lib/proxyFetch.js';

const _req = createRequire(import.meta.url);
let giftedBtnsFb;
try { giftedBtnsFb = _req('gifted-btns'); } catch (e) {}

const XCASPER = 'https://apis.xcasper.space/api/downloader';

const FB_PATTERNS = [
  /https?:\/\/(?:www\.|m\.)?facebook\.com\/.+\/videos\/.+/i,
  /https?:\/\/(?:www\.|m\.)?facebook\.com\/watch/i,
  /https?:\/\/(?:www\.|m\.)?fb\.watch\/.+/i,
  /https?:\/\/(?:www\.)?facebook\.com\/reel\/.+/i,
  /https?:\/\/(?:www\.)?facebook\.com\/share\/.+/i,
  /https?:\/\/(?:www\.)?facebook\.com\/.+\/video/i,
  /https?:\/\/(?:www\.)?fb\.com\/.+/i
];

function isValidFbUrl(url) {
  return FB_PATTERNS.some(p => p.test(url));
}

/**
 * Try xcasper fb → fb2 and extract best video URL.
 * Returns { videoUrl, title, thumbnail } or null.
 */
async function fetchFbInfo(url) {
  for (const ep of ['fb', 'fb2']) {
    try {
      console.log(`[FB] Trying xcasper/${ep}...`);
      const res = await axios.get(`${XCASPER}/${ep}`, {
        params: { url },
        timeout: 30000
      });
      const d = res.data;
      if (!d?.success) { console.log(`[FB/${ep}] failed: ${d?.message || d?.error}`); continue; }

      // Defensive extraction — xcasper fb endpoints vary in structure
      const hd  = d.hd  || d.data?.hd  || d.result?.hd  || d.links?.hd  || null;
      const sd  = d.sd  || d.data?.sd  || d.result?.sd  || d.links?.sd  || null;
      const url2= d.url || d.data?.url || d.result?.url || d.download   || null;

      const medias = d.data?.medias || d.data?.media || d.medias || d.media || [];
      const mediaUrl = (Array.isArray(medias) && medias[0]?.url) || null;

      const videoUrl = hd || sd || url2 || mediaUrl;
      if (!videoUrl) { console.log(`[FB/${ep}] no video URL in response`); continue; }

      const title     = d.title     || d.data?.title     || d.result?.title     || '';
      const thumbnail = d.thumbnail || d.data?.thumbnail || d.result?.thumbnail || '';

      console.log(`[FB/${ep}] ✅ found: ${videoUrl.substring(0, 80)}`);
      return { videoUrl, title, thumbnail };
    } catch (e) {
      console.log(`[FB/${ep}] error: ${e.message}`);
    }
  }
  return null;
}

export default {
  name: 'facebook',
  aliases: ['fb', 'fbdl', 'fbvideo'],
  description: 'Download Facebook videos and reels',
  category: 'downloaders',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const p = PREFIX || '.';
    const quotedText = m.quoted?.text?.trim() || '';
    const url = (args[0] || quotedText || '').trim();

    if (!url) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 📘 *FACEBOOK DOWNLOADER* ⌋\n│\n├─⊷ *${p}fb <url>*\n│  └⊷ Download video or reel\n│\n├─⊷ *Supported:*\n│  └⊷ fb.watch links\n│  └⊷ facebook.com/reel/...\n│  └⊷ facebook.com/watch/...\n│  └⊷ facebook.com/.../videos/...\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    if (!isValidFbUrl(url)) {
      return sock.sendMessage(jid, {
        text: `❌ *Invalid Facebook URL*\n\nMust be a public Facebook video, reel, or watch link.`
      }, { quoted: m });
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    // Button mode card
    if (isButtonModeEnabled() && giftedBtnsFb?.sendInteractiveMessage) {
      const mediaType = url.includes('/reel/') ? 'Reel' : url.includes('fb.watch') ? 'Watch' : 'Video';
      const senderClean = (m.key.participant || m.key.remoteJid).split(':')[0].split('@')[0];
      setActionSession(`fb:${senderClean}:${jid.split('@')[0]}`, { url, mediaType }, 10 * 60 * 1000);
      try {
        await giftedBtnsFb.sendInteractiveMessage(sock, jid, {
          body: { text: `📘 *Facebook ${mediaType} Found*\n\n🔗 ${url.substring(0, 60)}\n\n▸ Tap Download to get the video` },
          footer: { text: getBotName() },
          interactiveButtons: [{ type: 'quick_reply', display_text: '⬇️ Download', id: `${p}fbdlget` }]
        }, { quoted: m });
        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
        return;
      } catch {}
    }

    try {
      const info = await fetchFbInfo(url);

      if (!info) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ *Could not fetch this Facebook video.*\n\n💡 Make sure the video is *public*.\nTry: https://fbdown.net or https://getfvid.com`
        }, { quoted: m });
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const videoBuf = await proxyFetch(info.videoUrl, 120_000);

      if (!videoBuf) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ *Download failed.*\n\n💡 *Direct link:*\n${info.videoUrl}`
        }, { quoted: m });
      }

      const sizeMB = (videoBuf.byteLength / 1024 / 1024).toFixed(1);
      console.log(`[FB] downloaded ${sizeMB}MB`);

      if (parseFloat(sizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ Video too large (${sizeMB}MB). WhatsApp limit is 50MB.\n\n💡 *Direct link:*\n${info.videoUrl}`
        }, { quoted: m });
      }

      const caption = info.title
        ? `📘 *${info.title}*\n\n📦 ${sizeMB}MB | 🐺 ${getBotName()}`
        : `📘 *Facebook Video*\n\n📦 ${sizeMB}MB | 🐺 ${getBotName()}`;

      // Send as video
      await sock.sendMessage(jid, {
        video:    videoBuf,
        mimetype: 'video/mp4',
        caption
      }, { quoted: m });

      // Also send as document for easy saving if under 20MB
      if (parseFloat(sizeMB) <= 20) {
        await sock.sendMessage(jid, {
          document: videoBuf,
          mimetype:  'video/mp4',
          fileName:  `${(info.title || 'facebook_video').replace(/[^\w\s]/gi, '').trim().substring(0, 40) || 'facebook_video'}.mp4`,
          caption:   `📄 ${info.title || 'Facebook Video'} | ${sizeMB}MB`
        }, { quoted: m });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [FB] Sent: ${info.title || url} (${sizeMB}MB)`);

    } catch (error) {
      console.error('❌ [FB] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *Error:* ${error.message}`
      }, { quoted: m });
    }
  }
};
