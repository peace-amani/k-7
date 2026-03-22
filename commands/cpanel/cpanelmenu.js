import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: 'cpanelmenu',
  alias: ['panelmenu', 'ptero', 'pteromenu', 'cpanel'],
  desc: 'Shows all Pterodactyl panel commands',
  category: 'CPanel',
  usage: '.cpanelmenu',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;

    const commandsText = `╭─⊷ *⚙️ PANEL SETUP*
│
├─⊷ *${PREFIX}setlink <url>*
│  └⊷ Set your Pterodactyl panel URL
│
├─⊷ *${PREFIX}setkey <api-key>*
│  └⊷ Set your Application API key
│
╰─⊷

╭─⊷ *🏗️ SERVER TEMPLATE*
│
├─⊷ *${PREFIX}nestconfig*
│  └⊷ View current nest/egg/node settings
│
├─⊷ *${PREFIX}nestconfig nests*
│  └⊷ List all available nests
│
├─⊷ *${PREFIX}nestconfig eggs <nestId>*
│  └⊷ List eggs inside a nest
│
├─⊷ *${PREFIX}nestconfig nodes*
│  └⊷ List all nodes
│
├─⊷ *${PREFIX}nestconfig locations*
│  └⊷ List all locations
│
├─⊷ *${PREFIX}nestconfig nest/egg/node/location <id>*
│  └⊷ Set each value by ID
│
├─⊷ *${PREFIX}nestconfig cpu/ram/disk <value>*
│  └⊷ Set resource limits
│
╰─⊷

╭─⊷ *👤 USER & SERVER CREATION*
│
├─⊷ *${PREFIX}createuser <name> <email> <user> <pass>*
│  └⊷ Create a new panel user account
│
├─⊷ *${PREFIX}createpanel <email>*
│  └⊷ Create a server for an existing user
│
╰─⊷`;

    await sendSubMenu(sock, jid, 'CPanel Menu', commandsText, m, PREFIX);
  },
};
