import { delay } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
  name: 'unblock',
  description: 'Unblock a user (tag in group or provide number in DM)',
  category: 'owner',
  async execute(sock, msg, args) {
    const { key, message } = msg;
    const isGroup = key.remoteJid.endsWith('@g.us');
    let target;

    if (isGroup) {
      const mentioned = message?.extendedTextMessage?.contextInfo?.mentionedJid;
      if (!mentioned || mentioned.length === 0) {
        return await sock.sendMessage(key.remoteJid, {
          text: `╭─⌈ 🕊️ *UNBLOCK* ⌋\n│\n├─⊷ *Tag a user*\n│  └⊷ Unblock via mention\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
        }, { quoted: msg });
      }
      target = mentioned[0];
    } else {
      // In DM: use number if given
      if (!args[0]) {
        return await sock.sendMessage(key.remoteJid, {
          text: `╭─⌈ 🕊️ *UNBLOCK* ⌋\n│\n├─⊷ *unblock <number>*\n│  └⊷ Unblock by number\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
        }, { quoted: msg });
      }
      let number = args[0].replace(/[^0-9]/g, ''); // remove spaces/symbols
      if (number.length < 8) {
        return await sock.sendMessage(key.remoteJid, {
          text: `╭─⌈ ⚠️ *INVALID NUMBER* ⌋\n│\n├─⊷ *unblock <number>*\n│  └⊷ Set bot mode\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
        }, { quoted: msg });
      }
      target = `${number}@s.whatsapp.net`;
    }

    try {
      await sock.updateBlockStatus(target, 'unblock');
      await delay(1000);
      await sock.sendMessage(key.remoteJid, {
        text: `🌕 The Wolf has released ${target}.\n✅ *Unblocked successfully.*`,
      }, { quoted: msg });
    } catch (err) {
      console.error('Error unblocking user:', err);
      await sock.sendMessage(key.remoteJid, {
        text: '⚠️ The Wolf couldn’t release the target. Chains still bound...',
      }, { quoted: msg });
    }
  },
};
