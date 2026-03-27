import { createRequire } from 'module';
import axios from 'axios';
import { createWriteStream, existsSync } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setActionSession } from '../../lib/actionSession.js';

const _requireTt = createRequire(import.meta.url);
let giftedBtnsTt;
try { giftedBtnsTt = _requireTt('gifted-btns'); } catch (e) {}

const execAsync = promisify(exec);

const globalUserCaptions = new Map();

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
          text: `╭─⌈ 🎵 *TIKTOK DOWNLOADER* ⌋\n│\n├─⊷ *${PREFIX}tiktok <url>*\n│  └⊷ Download without watermark\n│\n├─⊷ *Examples:*\n│  └⊷ ${PREFIX}tiktok https://vt.tiktok.com/xyz\n│  └⊷ ${PREFIX}tt https://www.tiktok.com/@user/video/123\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
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
            setActionSession(sessionKey, { url, play: meta.play, wmplay: meta.wmplay });
            const cardText = `╭─⌈ 🎵 *TIKTOK* ⌋\n├─⊷ *${meta.title || 'TikTok Video'}*\n├─⊷ By: ${meta.author || 'Unknown'}\n├─⊷ Duration: ${meta.duration || '?'}s\n╰───`;
            await giftedBtnsTt.sendInteractiveMessage(sock, jid, {
              image: meta.cover ? { url: meta.cover } : undefined,
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
    const response = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    const data = response.data?.data;
    if (!data) return { success: false };
    return {
      success: true,
      title: data.title || '',
      cover: data.cover || data.origin_cover || '',
      author: data.author?.nickname || data.author?.unique_id || '',
      duration: data.duration || 0,
      play: data.play || '',
      wmplay: data.wmplay || data.play || ''
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
  try {
    const timestamp = Date.now();
    const rand = Math.random().toString(36).slice(2);
    const videoPath = `/tmp/wolfbot_tiktok_${timestamp}_${rand}.mp4`;

    const apis = [
      {
        url: `https://tikwm.com/api/?url=${encodeURIComponent(url)}`,
        videoKey: 'data.play'
      },
      {
        url: `https://api.tikmate.app/api/lookup?url=${encodeURIComponent(url)}`,
        process: (data) => ({
          video_url: `https://tikmate.app/download/${data.token}/${data.id}.mp4`
        })
      }
    ];

    let videoUrl = null;

    for (const api of apis) {
      try {
        const response = await axios.get(api.url, { timeout: 30000 });

        if (response.data) {
          let data = response.data;

          if (api.process) {
            const processed = api.process(data);
            videoUrl = processed.video_url;
          } else {
            videoUrl = api.videoKey.split('.').reduce((obj, key) => obj?.[key], data);
          }

          if (videoUrl) break;
        }
      } catch {
        continue;
      }
    }

    if (!videoUrl) {
      return await downloadWithYtDlp(url, videoPath);
    }

    await downloadFile(videoUrl, videoPath);

    return {
      success: true,
      videoPath
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function downloadWithYtDlp(url, videoPath) {
  try {
    await execAsync('yt-dlp --version');
  } catch {
    return { success: false, error: 'yt-dlp not installed' };
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
