const GLITCH_CHARS = ['̴','̵','̶','̷','̸','̡','̢','̧','̨','͜','͝','͞','͟','͠','͡'];

function glitchify(text) {
  return text.split('').map(ch => {
    if (ch === ' ') return ch;
    const g = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    return ch + g + (Math.random() > 0.5 ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)] : '');
  }).join('');
}

export default {
  name: 'glitch',
  alias: ['glitchmsg', 'glitched', 'vhstext'],
  description: 'Send glitched text. Usage: .glitch <text>',
  category: 'bug',

  async execute(sock, m, args, PREFIX) {
    const jid   = m.key.remoteJid;
    const input = args.join(' ') || 'WOLFBOT';
    const result = glitchify(input);

    try {
      await sock.sendMessage(jid, { react: { text: '📺', key: m.key } });
      await sock.sendMessage(jid, { text: result }, { quoted: m });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ Failed: ${err.message}`
      }, { quoted: m });
    }
  }
};
