import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: "automenu",
  alias: ["autocmds", "autohelp", "automationmenu"],
  desc: "Shows automation commands",
  category: "Automation",
  usage: ".automenu",

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `automenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *⚙️ AUTOMATION COMMANDS*
│
│  • autoread
│  • autotyping
│  • autorecording
│  • autoreact
│  • autoreactstatus
│  • autoviewstatus
│  • autobio
│  • autorec
│  • reactowner
│
╰─⊷`;

    await sendSubMenu(sock, jid, '⚙️ AUTOMATION MENU', commandsText, m, PREFIX);
  }
};
