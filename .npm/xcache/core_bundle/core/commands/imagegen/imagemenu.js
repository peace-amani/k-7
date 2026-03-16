import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: "imagemenu",
  alias: ["imgmenu", "imagehelp", "imgcmds"],
  desc: "Shows image generation commands",
  category: "ImageGen",
  usage: ".imagemenu",

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `imagemenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *🖼️ IMAGE GENERATION*
│
│  • image
│  • imagine
│  • imagegen
│  • anime
│  • art
│  • real
│  • remini
│  • vision
│
╰─⊷`;

    await sendSubMenu(sock, jid, '🖼️ IMAGE MENU', commandsText, m, PREFIX);
  }
};
