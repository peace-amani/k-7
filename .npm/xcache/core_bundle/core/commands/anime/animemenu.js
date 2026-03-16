import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: "animemenu",
  alias: ["anime", "amenu"],
  desc: "Shows anime reaction commands",
  category: "Anime",
  usage: ".animemenu",

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `animemenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *💖 AFFECTION & LOVE*
│
│  • cuddle
│  • kiss
│  • pat
│  • lick
│  • glomp
│  • wink
│  • highfive
│
╰─⊷

╭─⊷ *😂 FUN & REACTIONS*
│
│  • awoo
│  • bully
│  • cringe
│  • cry
│  • dance
│  • yeet
│
╰─⊷

╭─⊷ *🔥 SPECIAL CHARACTERS*
│
│  • waifu
│  • neko
│  • megumin
│  • shinobu
│
╰─⊷

╭─⊷ *⚠️ MISC & ACTION*
│
│  • kill
│  • trap
│  • trap2
│  • bj
│
╰─⊷`;

    await sendSubMenu(sock, jid, '🌸 Anime Menu', commandsText, m, PREFIX);
  }
};
