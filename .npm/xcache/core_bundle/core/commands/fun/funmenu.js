import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: "funmenu",
  alias: ["funcmds", "funhelp"],
  desc: "Shows fun commands",
  category: "Fun",
  usage: ".funmenu",

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `funmenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *🎭 FUN & TOOLS*
│
│  • bf
│  • gf
│  • couple
│  • gay
│  • getjid
│  • movie
│  • trailer
│  • goodmorning
│  • goodnight
│  • channelstatus
│  • hack
│
╰─⊷`;

    await sendSubMenu(sock, jid, '🎭 FUN MENU', commandsText, m, PREFIX);
  }
};
