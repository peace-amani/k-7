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

      const text =
        `╭─⌈ 🐺 *${botName}* ⌋\n` +
        `│ ✅ Status : Online\n` +
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
