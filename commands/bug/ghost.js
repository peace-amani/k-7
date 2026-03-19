export default {
  name: 'ghost',
  alias: ['ghostmsg', 'ghosttext', 'invisiblemsg'],
  description: 'Send a ghost/invisible message',
  category: 'bug',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const zwsp = '\u200B';
    const zwnj = '\u200C';
    const zwj  = '\u200D';
    const wj   = '\u2060';

    const payload = (zwsp + zwnj + zwj + wj).repeat(30);

    try {
      await sock.sendMessage(jid, { react: { text: '👻', key: m.key } });
      await sock.sendMessage(jid, { text: payload }, { quoted: m });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ Failed: ${err.message}`
      }, { quoted: m });
    }
  }
};
