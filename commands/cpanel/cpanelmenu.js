import { sendSubMenu } from '../../lib/menuHelper.js';

export default {
  name: 'cpanelmenu',
  alias: ['panelmenu', 'ptero', 'pteromenu'],
  desc: 'Shows all Pterodactyl panel commands',
  category: 'CPanel',
  usage: '.cpanelmenu',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;

    const commandsText = `╭─⊷ *⚙️ SETUP*
│  • setlink
│  • setkey
╰─⊷

╭─⊷ *🏗️ NEST CONFIG*
│  • nestconfig
╰─⊷

╭─⊷ *👤 CREATION*
│  • createuser
│  • createpanel
╰─⊷

╭─⊷ *📘 GUIDE*
│  • cpanelguide
╰─⊷`;

    await sendSubMenu(sock, jid, 'CPanel Menu', commandsText, m, PREFIX);
  },
};
