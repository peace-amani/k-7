import axios from "axios";
import { getBotName } from '../../lib/botname.js';

export default {
  name: "up",
  description: "Check bot uptime and system status",

  async execute(sock, m, args, PREFIX) {
    try {
      const jid = m.key.remoteJid;
      const sender = m.key.participant || m.key.remoteJid;

      function createFakeContact(message) {
        return {
          key: {
            participants: "0@s.whatsapp.net",
            remoteJid: "status@broadcast",
            fromMe: false,
            id: getBotName()
          },
          message: {
            contactMessage: {
              vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:${getBotName()}\nitem1.TEL;waid=${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}:${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
            }
          },
          participant: "0@s.whatsapp.net"
        };
      }

      const fkontak = createFakeContact(m);

      const pingStartTime = Date.now();

      const uptime = process.uptime();
      const days = Math.floor(uptime / (3600 * 24));
      const hours = Math.floor((uptime % (3600 * 24)) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      let githubAvatar = "https://avatars.githubusercontent.com/u/10639145";
      let githubUrl = "https://github.com/sil3nt-wolf/silentwolf";

      try {
        const { data: githubData } = await axios.get(
          "https://api.github.com/users/sil3nt-wolf",
          {
            headers: {
              "User-Agent": "Silent-Wolf-Bot",
              "Accept": "application/vnd.github.v3+json"
            },
            timeout: 5000
          }
        );
        githubAvatar = githubData.avatar_url;
      } catch {}

      const pingTime = Date.now() - pingStartTime;

      const text = `
`.trim();

      await sock.sendMessage(
        jid,
        {
          text,
          contextInfo: {
            mentionedJid: sender ? [sender] : [],
            externalAdReply: {
              title: `🐺 ${getBotName()} Uptime`,
              body: `${days}d ${hours}h ${minutes}m ${seconds}s • Ping: ${pingTime}ms`,
              mediaType: 1,
              thumbnailUrl: githubAvatar,
              sourceUrl: githubUrl,
              mediaUrl: githubUrl,
              renderLargerThumbnail: true
            },
          },
        },
        { quoted: fkontak }
      );

    } catch (err) {
      console.error("❌ [UP] Command error:", err.message || err);
      try {
        await sock.sendMessage(
          m.key.remoteJid,
          {
            text: ``,
            contextInfo: {
              externalAdReply: {
                title: `${getBotName()} Uptime`,
                body: "Bot is online",
                mediaType: 1,
                thumbnailUrl: "https://avatars.githubusercontent.com/u/10639145",
                sourceUrl: "https://github.com/sil3nt-wolf/silentwolf"
              }
            }
          },
          { quoted: m }
        );
      } catch (sendError) {
        console.error("❌ [UP] Failed to send fallback:", sendError.message);
      }
    }
  },
};
