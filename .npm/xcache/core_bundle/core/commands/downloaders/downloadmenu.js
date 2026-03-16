import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: "downloadmenu",
  alias: ["dlmenu", "downloadhelp", "dlcmds"],
  desc: "Shows media download commands",
  category: "Downloaders",
  usage: ".downloadmenu",

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `downloadmenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *📱 SOCIAL MEDIA*
│
│  • tiktok
│  • tiktoksearch
│  • tiktokinfo
│  • instagram
│  • facebook
│  • snapchat
│
╰─⊷

╭─⊷ *🎬 YOUTUBE*
│
│  • yts
│  • ytplay
│  • ytmp3
│  • ytv
│  • ytmp4
│  • ytvdoc
│  • playlist
│
╰─⊷

╭─⊷ *🔞 ADULT*
│
│  • xvideos
│  • xnxx
│
╰─⊷

╭─⊷ *📦 OTHER*
│
│  • apk
│  • mp3
│  • mp4
│  • mediafire
│
╰─⊷`;

    await sendSubMenu(sock, jid, '⬇️ DOWNLOAD MENU', commandsText, m, PREFIX);
  }
};
