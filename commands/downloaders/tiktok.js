import { createRequire } from 'module';
import axios from 'axios';
import { createWriteStream, existsSync } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName, getFooter } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setActionSession } from '../../lib/actionSession.js';

const _requireTt = createRequire(import.meta.url);
let giftedBtnsTt;
try { giftedBtnsTt = _requireTt('gifted-btns'); } catch (e) {}

const execAsync = promisify(exec);

const globalUserCaptions = new Map();

const XWOLF_API_KEY = process.env.XWOLF_API_KEY || 'wxa_u_xwk7sch6xj';
const XWOLF_TT_API = 'https://apis.xwolf.space/api/download/tiktok';

export default {
  name: "tiktok",
  aliases: ['tt', 'tikdown', 'ttdl'],
  description: "Download TikTok videos without watermark",
  category: 'downloaders',
  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const userId = m.key.participant || m.key.remoteJid;

    try {
      if (!args[0]) {
        await sock.sendMessage(jid, {
          text: `╭─⌈ 🎵 *TIKTOK DOWNLOADER* ⌋\n│\n├─⊷ *${PREFIX}tiktok <url>*\n│  └⊷ Download without watermark\n│\n├─⊷ *Examples:*\n│  └⊷ ${PREFIX}tiktok https://vt.tiktok.com/xyz\n│  └⊷ ${PREFIX}tt https://www.tiktok.com/@user/video/123\n│\n╰⊷ ${getFooter(m.key.participant || m.key.remoteJid)}`
        }, { quoted: m });
        return;
      }

      const url = args[0];

      if (!isValidTikTokUrl(url)) {
        await sock.sendMessage(jid, { text: `❌ Invalid TikTok URL` }, { quoted: m });
        return;
      }

      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      if (isButtonModeEnabled() && giftedBtnsTt?.sendInteractiveMessage) {
        try {
          const meta = await fetchTikTokMeta(url);
          if (meta.success) {
            const senderClean = (m.key.participant || m.key.remoteJid).split(':')[0].split('@')[0];
            const sessionKey = `tiktok:${senderClean}:${jid.split('@')[0]}`;
            setActionSession(sessionKey, { url, play: meta.videoUrl, wmplay: meta.videoUrlNoWatermark });
            const cardText = `╭─⌈ 🎵 *TIKTOK* ⌋\n├─⊷ *${meta.title || 'TikTok Video'}*\n├─⊷ Powered by: ${meta.provider || 'Wolf Tech'}\n╰───`;
            await giftedBtnsTt.sendInteractiveMessage(sock, jid, {
              body: { text: cardText },
              footer: { text: getBotName() },
              interactiveButtons: [
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⬇️ No Watermark', id: `${PREFIX}ttdlget` }) },
                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '💧 With Watermark', id: `${PREFIX}ttdlwm` }) }
              ]
            }, { quoted: m });
            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
            return;
          }
        } catch (e) {}
      }

      const result = await downloadTikTok(url);

      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        await sock.sendMessage(jid, { text: `❌ Download failed: ${result.error || 'Unknown error'}` }, { quoted: m });
        return;
      }

      const { videoPath } = result;
      const userCaption = globalUserCaptions.get(userId) || `${getBotName()} is the Alpha`;

      await sock.sendMessage(jid, {
        video: fs.readFileSync(videoPath),
        caption: userCaption
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

      try { if (existsSync(videoPath)) fs.unlinkSync(videoPath); } catch {}

    } catch (error) {
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
    }
  },
};

export function getUserCaption(userId) {
  return globalUserCaptions.get(userId) || `${getBotName()} is the Alpha`;
}

export function setUserCaption(userId, caption) {
  globalUserCaptions.set(userId, caption);
}

export function getUserCaptionMap() {
  return globalUserCaptions;
}

async function fetchTikTokMeta(url) {
  try {
    const response = await axios.get(XWOLF_TT_API, {
      params: { url, key: XWOLF_API_KEY },
      timeout: 20000
    });
    const data = response.data;
    if (!data?.success) return { success: false };
    return {
      success: true,
      title: data.title || '',
      videoUrl: data.videoUrl || '',
      videoUrlNoWatermark: data.videoUrlNoWatermark || data.videoUrl || '',
      videoProxyUrl: data.videoProxyUrl || data.videoUrl || '',
      videoNoWatermarkProxyUrl: data.videoNoWatermarkProxyUrl || data.videoUrlNoWatermark || '',
      provider: data.provider || 'Wolf Tech'
    };
  } catch (e) {
    return { success: false };
  }
}

function isValidTikTokUrl(url) {
  const patterns = [
    /https?:\/\/(vm|vt)\.tiktok\.com\/\S+/,
    /https?:\/\/(www\.)?tiktok\.com\/@\S+\/video\/\d+/,
    /https?:\/\/(www\.)?tiktok\.com\/t\/\S+/,
    /https?:\/\/m\.tiktok\.com\/v\/\d+/
  ];
  return patterns.some(pattern => pattern.test(url));
}

async function downloadTikTok(url) {
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2);
  const videoPath = `/tmp/wolfbot_tiktok_${timestamp}_${rand}.mp4`;

  // 1. Try xwolf API first (no-watermark preferred)
  try {
    const response = await axios.get(XWOLF_TT_API, {
      params: { url, key: XWOLF_API_KEY },
      timeout: 20000
    });
    const data = response.data;
    if (data?.success) {
      const videoUrl = data.videoNoWatermarkProxyUrl || data.videoUrlNoWatermark || data.videoProxyUrl || data.videoUrl;
      if (videoUrl) {
        await downloadFile(videoUrl, videoPath);
        return { success: true, videoPath };
      }
    }
  } catch {}

  // 2. Fallback: tikwm.com
  try {
    const response = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 30000 });
    const videoUrl = response.data?.data?.play;
    if (videoUrl) {
      await downloadFile(videoUrl, videoPath);
      return { success: true, videoPath };
    }
  } catch {}

  // 3. Last resort: yt-dlp
  return await downloadWithYtDlp(url, videoPath);
}

async function downloadWithYtDlp(url, videoPath) {
  try {
    await execAsync('yt-dlp --version');
  } catch {
    return { success: false, error: 'All download methods failed' };
  }
  try {
    await execAsync(`yt-dlp -f "best[ext=mp4]" -o "${videoPath}" "${url}"`, { timeout: 60000 });
    return { success: true, videoPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function downloadFile(url, filePath) {
  const writer = createWriteStream(filePath);
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream',
    timeout: 60000
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}
