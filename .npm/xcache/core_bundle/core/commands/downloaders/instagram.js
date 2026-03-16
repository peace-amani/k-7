import { createRequire } from 'module';
import axios from 'axios';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import fs from 'fs';
import path from 'path';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setActionSession } from '../../lib/actionSession.js';

const _requireIg = createRequire(import.meta.url);
let giftedBtnsIg;
try { giftedBtnsIg = _requireIg('gifted-btns'); } catch (e) {}

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

export default {
  name: 'instagram',
  aliases: ['ig', 'igdl', 'insta'],
  description: 'Download Instagram videos/photos without watermark',
  category: 'downloaders',
  
  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const userId = m.key.participant || m.key.remoteJid;

    try {
      if (!args[0]) {
        await sock.sendMessage(jid, {
          text: `╭─⌈ 📷 *INSTAGRAM DOWNLOADER* ⌋\n│\n├─⊷ *${PREFIX}instagram <url>*\n│  └⊷ Download reels/posts\n│\n├─⊷ *Examples:*\n│  └⊷ ${PREFIX}ig https://instagram.com/reel/xyz\n│  └⊷ ${PREFIX}insta https://instagram.com/p/xyz\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
        }, { quoted: m });
        return;
      }

      const url = args[0];

      if (!isValidInstagramUrl(url)) {
        await sock.sendMessage(jid, { 
          text: `❌ Invalid Instagram URL\n\nValid formats:\n• instagram.com/p/...\n• instagram.com/reel/...` 
        }, { quoted: m });
        return;
      }

      // Button mode preview card
      if (isButtonModeEnabled() && giftedBtnsIg) {
        const isReel = url.includes('/reel/');
        const isTV = url.includes('/tv/');
        const mediaType = isReel ? 'Reel' : isTV ? 'IGTV' : 'Post';
        const shortUrl = url.replace(/^https?:\/\/(www\.)?instagram\.com/, '').split('?')[0].slice(0, 40);
        const senderClean = (m.key.participant || m.key.remoteJid).split(':')[0].split('@')[0];
        setActionSession(`ig:${senderClean}:${jid.split('@')[0]}`, { url, mediaType }, 10 * 60 * 1000);
        const cardText = `📷 *Instagram ${mediaType} Found*\n\n🔗 ${shortUrl}\n\n▸ Tap Download to get the media`;
        try {
          await giftedBtnsIg.sendInteractiveMessage(sock, jid, {
            body: { text: cardText },
            footer: { text: getBotName() },
            interactiveButtons: [
              { type: 'quick_reply', display_text: '⬇️ Download', id: `${PREFIX}igdlget` }
            ]
          }, { quoted: m });
          await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
          return;
        } catch (e) {}
      }

      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const result = await downloadInstagram(url);

      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        await sock.sendMessage(jid, { 
          text: `❌ Download failed: ${result.error || 'Unknown error'}\n\n📱 Try manual: https://snapinsta.app` 
        }, { quoted: m });
        return;
      }

      const { mediaPath, isVideo } = result;
      const botName = getBotName();

      if (isVideo) {
        await sock.sendMessage(jid, {
          video: fs.readFileSync(mediaPath),
          mimetype: "video/mp4",
          caption: `${botName} is the Alpha`
        }, { quoted: m });
      } else {
        await sock.sendMessage(jid, {
          image: fs.readFileSync(mediaPath),
          caption: `${botName} is the Alpha`
        }, { quoted: m });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

      // Cleanup temp file
      try { 
        if (existsSync(mediaPath)) fs.unlinkSync(mediaPath); 
      } catch {}

    } catch (error) {
      console.error('Instagram download error:', error);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { 
        text: `❌ Error: ${error.message}` 
      }, { quoted: m });
    }
  }
};

function isValidInstagramUrl(url) {
  const patterns = [
    /https?:\/\/(?:www\.)?instagram\.com\/(p|reel|tv|reels)\/[a-zA-Z0-9_-]+/i,
    /https?:\/\/(?:www\.)?instagr\.am\/(p|reel|tv|reels)\/[a-zA-Z0-9_-]+/i
  ];
  return patterns.some(pattern => pattern.test(url));
}

async function downloadInstagram(url) {
  try {
    const timestamp = Date.now();
    const rand = Math.random().toString(36).slice(2);
    const mediaPath = path.join('/tmp', `wolfbot_ig_${timestamp}_${rand}.mp4`);

    let mediaUrl = null;
    let isVideo = url.includes('/reel/') || url.includes('/tv/');

    // Try GiftedTech API first
    try {
      const giftedUrl = `https://api.giftedtech.co.ke/api/download/instadlv2?apikey=gifted&url=${encodeURIComponent(url)}`;
      const response = await axios.get(giftedUrl, { timeout: 15000 });
      
      if (response.data?.status === 200 && response.data?.result?.download_url) {
        mediaUrl = response.data.result.download_url;
        isVideo = mediaUrl.includes('.mp4') || true;
        console.log('✅ GiftedTech API success');
      }
    } catch (e) {
      console.log('GiftedTech API failed:', e.message);
    }

    // Try xWolf API as fallback
    if (!mediaUrl) {
      try {
        const xwolfUrl = `https://apis.xwolf.space/api/download/instagram?url=${encodeURIComponent(url)}`;
        const response = await axios.get(xwolfUrl, { timeout: 15000 });
        
        if (response.data?.result?.url) {
          mediaUrl = response.data.result.url;
          isVideo = mediaUrl.includes('.mp4') || isVideo;
        } else if (response.data?.url) {
          mediaUrl = response.data.url;
          isVideo = mediaUrl.includes('.mp4') || isVideo;
        }
        console.log('✅ xWolf API success');
      } catch (e) {
        console.log('xWolf API failed:', e.message);
      }
    }

    if (!mediaUrl) {
      throw new Error('No API could fetch the media');
    }

    // Download the media
    await downloadFile(mediaUrl, mediaPath);

    return {
      success: true,
      mediaPath,
      isVideo
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

export { downloadInstagram };

async function downloadFile(url, filePath) {
  const writer = createWriteStream(filePath);
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream',
    timeout: 60000,
    maxContentLength: 100 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.instagram.com/'
    }
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
    response.data.on('error', reject);
  });
}
