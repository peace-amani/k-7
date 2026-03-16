import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: 'stalkermenu',
  aliases: ['smenu', 'stalkermenu', 'stalkercmds'],
  description: 'Shows all Stalker commands',
  category: 'Stalker Commands',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `stalkermenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *📢 WHATSAPP CHANNEL*
│
│  • wachannel <URL>
│
╰─⊷

╭─⊷ *🎵 TIKTOK*
│
│  • tiktokstalk <username>
│
╰─⊷

╭─⊷ *🐦 TWITTER/X*
│
│  • twitterstalk <username>
│
╰─⊷

╭─⊷ *🌐 IP ADDRESS*
│
│  • ipstalk <IP>
│
╰─⊷

╭─⊷ *📸 INSTAGRAM*
│
│  • igstalk <username>
│
╰─⊷

╭─⊷ *📦 NPM PACKAGE*
│
│  • npmstalk <package>
│
╰─⊷

╭─⊷ *🐙 GITHUB*
│
│  • gitstalk <username>
│
╰─⊷`;

    await sendSubMenu(sock, jid, '🕵️ Stalker Menu', commandsText, m, PREFIX);
  }
};
