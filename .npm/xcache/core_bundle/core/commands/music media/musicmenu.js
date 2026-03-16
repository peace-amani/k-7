import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: "musicmenu",
  alias: ["mmenu", "musichelp", "musiccmds"],
  desc: "Shows music and media commands",
  category: "Music",
  usage: ".musicmenu",

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `musicmenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *🎵 MUSIC COMMANDS*
│
│  • play
│  • song
│  • video
│  • videodoc
│  • lyrics
│  • shazam
│  • spotify
│
╰─⊷`;

    await sendSubMenu(sock, jid, '🎵 MUSIC MENU', commandsText, m, PREFIX);
  }
};
