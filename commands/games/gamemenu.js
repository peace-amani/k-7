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
