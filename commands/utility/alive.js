import moment from 'moment-timezone';
import { getBotName } from '../../lib/botname.js';

export default {
  name: 'alive',
  description: 'Check if bot is running',
  category: 'utility',

  async execute(sock, m, args, PREFIX) {
    try {
      const jid = m.key.remoteJid;
      const botName = getBotName();

      const uptime = process.uptime();
      const days    = Math.floor(uptime / 86400);
      const hours   = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);

      let uptimeStr = '';
      if (days > 0)    uptimeStr += `${days}days : `;
      uptimeStr += `${hours}hrs : ${minutes}mins`;

      const text =
        `╭─⌈ 🐺 *${botName}* ⌋\n` +
        `│ ✅ Status  : Online\n` +
        `│ ⏱️ Uptime  : ${uptimeStr}\n` +
        `╰⊷ *${botName} is alive!*`;

      const fkontak = {
        key: {
          participant: '0@s.whatsapp.net',
          remoteJid:   'status@broadcast',
          fromMe:      false,
          id:          botName
        },
        messageTimestamp: moment().unix(),
        pushName: botName,
        message: {
          contactMessage: {
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nEND:VCARD`
          }
        },
        participant: '0@s.whatsapp.net'
      };

      await sock.sendMessage(jid, { text }, { quoted: fkontak });
      try { await sock.sendMessage(jid, { react: { text: '🐺', key: m.key } }); } catch {}

    } catch (err) {
      await sock.sendMessage(m.key.remoteJid, {
        text: `🐺 ${getBotName()} is alive!`
      }, { quoted: m });
    }
  }
};
