export default {
  name: 'fakeblank',
  alias: ['blanktext', 'fakemsg', 'blankmsg'],
  description: 'Send a message that appears completely blank',
  category: 'bug',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const payload = '\u00AD\u200B\u200C\u200D\u2060\uFEFF\u034F\u200E\u200F'.repeat(20);

    try {
      await sock.sendMessage(jid, { react: { text: '⬜', key: m.key } });
      await sock.sendMessage(jid, { text: payload }, { quoted: m });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ Failed: ${err.message}`
      }, { quoted: m });
    }
  }
};
