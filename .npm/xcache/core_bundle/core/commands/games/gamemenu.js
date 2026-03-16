import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: "gamemenu",
  alias: ["gamecmds", "gamehelp", "gameslist"],
  desc: "Shows game commands",
  category: "Games",
  usage: ".gamemenu",

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `gamemenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *🎮 GAMES*
│
│  • coinflip
│  • dare
│  • dice
│  • emojimix
│  • joke
│  • quiz
│  • rps
│  • snake
│  • tetris
│  • truth
│  • tictactoe
│  • quote
│
╰─⊷`;

    await sendSubMenu(sock, jid, '🎮 GAMES MENU', commandsText, m, PREFIX);
  }
};
