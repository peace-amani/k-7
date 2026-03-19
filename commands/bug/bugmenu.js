import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: 'bugmenu',
  alias: ['bugcmds', 'bughelp', 'bugslist'],
  desc: 'Shows all bug & exploit commands',
  category: 'Bug',
  usage: '.bugmenu',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    await sock.sendMessage(jid, { text: 'bugmenu loading...' }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText =
      `╭─⊷ *💀 CRASH & FREEZE*\n` +
      `│\n` +
      `│  • ${PREFIX}freeze\n` +
      `│  • ${PREFIX}crash\n` +
      `│  • ${PREFIX}longbug\n` +
      `│  • ${PREFIX}rtlbug\n` +
      `│\n` +
      `╰─⊷\n\n` +
      `╭─⊷ *👻 GHOST & INVISIBLE*\n` +
      `│\n` +
      `│  • ${PREFIX}ghost\n` +
      `│  • ${PREFIX}fakeblank\n` +
      `│  • ${PREFIX}emptytext\n` +
      `│\n` +
      `╰─⊷\n\n` +
      `╭─⊷ *🔤 TEXT EFFECTS*\n` +
      `│\n` +
      `│  • ${PREFIX}zalgo\n` +
      `│  • ${PREFIX}glitch\n` +
      `│\n` +
      `╰─⊷`;

    await sendSubMenu(sock, jid, '🐛 BUG MENU', commandsText, m, PREFIX);
  }
};
