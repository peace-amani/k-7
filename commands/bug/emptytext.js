export default {
  name: 'emptytext',
  alias: ['empty', 'emptymsg', 'nullmsg'],
  description: 'Send an empty-looking text message',
  category: 'bug',

  async execute(sock, m, args, PREFIX) {
    const jid     = m.key.remoteJid;
    const payload = '\u2800';

    try {
      await sock.sendMessage(jid, { react: { text: '🫥', key: m.key } });
      await sock.sendMessage(jid, { text: payload }, { quoted: m });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ Failed: ${err.message}`
      }, { quoted: m });
    }
  }
};
