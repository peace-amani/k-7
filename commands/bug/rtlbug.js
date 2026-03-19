export default {
  name: 'rtlbug',
  alias: ['rtl', 'rtltext', 'mirrorbug'],
  description: 'Send a right-to-left override bug message',
  category: 'bug',

  async execute(sock, m, args, PREFIX) {
    const jid  = m.key.remoteJid;
    const text = args.join(' ') || 'This text is bugged';

    const rtlo    = '\u202E';
    const lro     = '\u202D';
    const payload = rtlo + lro.repeat(5) + rtlo.repeat(5) + text + rtlo.repeat(10);

    try {
      await sock.sendMessage(jid, { react: { text: '🔄', key: m.key } });
      await sock.sendMessage(jid, { text: payload }, { quoted: m });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ Failed: ${err.message}`
      }, { quoted: m });
    }
  }
};
