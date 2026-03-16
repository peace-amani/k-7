import moment from 'moment-timezone';
import { getBotName } from '../../lib/botname.js';

export default {
  name: 'uptime',
  aliases: ['runtime', 'online'],
  description: 'Check how long the bot has been running',
  category: 'utility',

  async execute(sock, m, args, PREFIX) {
    try {
      const jid = m.key.remoteJid;

      function createFakeContact(message) {
        return {
          key: {
            participant: "0@s.whatsapp.net",
            remoteJid: "status@broadcast",
            fromMe: false,
            id: getBotName()
          },
          messageTimestamp: moment().unix(),
          pushName: getBotName(),
          message: {
            contactMessage: {
              vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:${getBotName()}\nitem1.TEL;waid=${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}:${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
            }
          },
          participant: "0@s.whatsapp.net"
        };
      }

      const fkontak = createFakeContact(m);

      const uptime = process.uptime();
      const days = Math.floor(uptime / (3600 * 24));
      const hours = Math.floor((uptime % (3600 * 24)) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      let timeString = "";
      if (days > 0) timeString += `${days}d `;
      if (hours > 0) timeString += `${hours}h `;
      if (minutes > 0) timeString += `${minutes}m `;
      timeString += `${seconds}s`;

      const uptimeText = `
╭━「 *${getBotName()} UPTIME* 」━╮
│  ⏱️ *Running:* ${timeString.trim()}
│  📅 *Since:* ${new Date(Date.now() - uptime * 1000).toLocaleString()}
╰━━━━━━━━━━━━━╯
_🐺 The Wolf never sleeps..._
`;

      await sock.sendMessage(jid, {
        text: uptimeText
      }, {
        quoted: fkontak
      });

      await sock.sendMessage(jid, {
        react: { text: '⏱️', key: m.key }
      });

    } catch (error) {
      console.error("Uptime command error:", error);

      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);

      await sock.sendMessage(m.key.remoteJid, {
        text: `🐺 ${getBotName()}: ${hours}h ${minutes}m`
      }, {
        quoted: m
      });
    }
  }
};
