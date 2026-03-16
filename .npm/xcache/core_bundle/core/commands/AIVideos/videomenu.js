import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: "videomenu",
  alias: ["vidmenu", "aividmenu", "videoeffects"],
  desc: "Shows AI video effect commands",
  category: "AIVideos",
  usage: ".videomenu",

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `videomenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *🎬 AI VIDEO EFFECTS*
│
│  • tigervideo
│  • introvideo
│  • lightningpubg
│  • lovevideo
│  • videogen
│
╰─⊷`;

    await sendSubMenu(sock, jid, '🎬 AI VIDEO EFFECTS MENU', commandsText, m, PREFIX);
  }
};
