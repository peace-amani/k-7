import fs from 'fs';
import { getActionSession, deleteActionSession } from '../../lib/actionSession.js';
import { downloadInstagram } from './instagram.js';
import { getBotName } from '../../lib/botname.js';

export default {
  name: 'igdlget',
  aliases: [],
  description: 'Download Instagram media from preview session',
  category: 'downloaders',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const senderClean = (m.key.participant || m.key.remoteJid).split(':')[0].split('@')[0];
    const sessionKey = `ig:${senderClean}:${jid.split('@')[0]}`;
    const session = getActionSession(sessionKey);

    if (!session || !session.url) {
      await sock.sendMessage(jid, {
        text: `❌ No Instagram download session found.\nPlease send the Instagram URL again with \`${PREFIX || '.'}instagram <url>\``
      }, { quoted: m });
      return;
    }

    deleteActionSession(sessionKey);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    const result = await downloadInstagram(session.url);

    if (!result.success) {
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ Download failed: ${result.error || 'Unknown error'}\n\n📱 Try manual: https://snapinsta.app`
      }, { quoted: m });
      return;
    }

    const { mediaPath, isVideo } = result;
    const botName = getBotName();

    try {
      if (isVideo) {
        await sock.sendMessage(jid, {
          video: fs.readFileSync(mediaPath),
          mimetype: 'video/mp4',
          caption: `${botName} is the Alpha`
        }, { quoted: m });
      } else {
        await sock.sendMessage(jid, {
          image: fs.readFileSync(mediaPath),
          caption: `${botName} is the Alpha`
        }, { quoted: m });
      }
      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Failed to send: ${e.message}` }, { quoted: m });
    } finally {
      try { if (fs.existsSync(mediaPath)) fs.unlinkSync(mediaPath); } catch {}
    }
  }
};
