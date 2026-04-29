import axios from 'axios';
import { createWriteStream, existsSync } from 'fs';
import fs from 'fs';
import { getBotName } from '../../lib/botname.js';
import { getActionSession, deleteActionSession } from '../../lib/actionSession.js';

async function downloadFile(url, filePath) {
  const writer = createWriteStream(filePath);
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    timeout: 60000
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

export default {
  name: 'ttdlget',
  aliases: ['ttdlwm'],
  description: 'Download TikTok video from pending session (no-watermark or with-watermark)',
  category: 'downloaders',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const senderClean = (m.key.participant || m.key.remoteJid).split(':')[0].split('@')[0];
    const sessionKey = `tiktok:${senderClean}:${jid.split('@')[0]}`;

    const session = getActionSession(sessionKey);
    if (!session) {
      return sock.sendMessage(jid, {
        text: `❌ No pending TikTok session. Use *${PREFIX}tiktok <url>* first.`
      }, { quoted: m });
    }

    const rawText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
    const useWatermark = rawText.includes('ttdlwm');
    const videoUrl = useWatermark ? (session.wmplay || session.play) : session.play;

    if (!videoUrl) {
      deleteActionSession(sessionKey);
      return sock.sendMessage(jid, {
        text: '❌ Download URL not found in session. Try fetching again.'
      }, { quoted: m });
    }

    deleteActionSession(sessionKey);

    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      const timestamp = Date.now();
      const rand = Math.random().toString(36).slice(2);
      const videoPath = `/tmp/wolfbot_tiktok_dl_${timestamp}_${rand}.mp4`;

      await downloadFile(videoUrl, videoPath);

      const caption = `${getBotName()} is the Alpha${useWatermark ? ' 💧' : ''}`;
      await sock.sendMessage(jid, {
        video: fs.readFileSync(videoPath),
        caption
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

      try { if (existsSync(videoPath)) fs.unlinkSync(videoPath); } catch {}
    } catch (error) {
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Download failed: ${error.message}` }, { quoted: m });
    }
  }
};
