import { sendSubMenu } from '../../lib/menuHelper.js';

export default {
  name: 'cpanelguide',
  alias: ['panelguide', 'pteroguide', 'cpanelhelp'],
  desc: 'Detailed guide for all Pterodactyl panel commands',
  category: 'CPanel',
  usage: '.cpanelguide',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;

    const commandsText = `╭─⊷ *⚙️ STEP 1 — SETUP*
│
├─⊷ *${PREFIX}setlink <url>*
│  └⊷ Set your Pterodactyl panel URL
│  └⊷ Example: ${PREFIX}setlink https://panel.example.com
│
├─⊷ *${PREFIX}setkey <api-key>*
│  └⊷ Set your Application API key
│  └⊷ Get it from: Panel → Admin → API → Application API
│  └⊷ Example: ${PREFIX}setkey ptlc_xxxxxxxxxxxxxx
│
╰─⊷

╭─⊷ *🏗️ STEP 2 — CONFIGURE NEST TEMPLATE*
│
├─⊷ *${PREFIX}nestconfig*
│  └⊷ View your current saved settings
│
├─⊷ *${PREFIX}nestconfig nests*
│  └⊷ List all nests on your panel
│
├─⊷ *${PREFIX}nestconfig eggs <nestId>*
│  └⊷ List eggs inside a specific nest
│
├─⊷ *${PREFIX}nestconfig nodes*
│  └⊷ List all available nodes
│
├─⊷ *${PREFIX}nestconfig locations*
│  └⊷ List all locations
│
├─⊷ *${PREFIX}nestconfig nest <id>*
│  └⊷ Set which nest to use for new servers
│
├─⊷ *${PREFIX}nestconfig egg <id>*
│  └⊷ Set which egg to use for new servers
│
├─⊷ *${PREFIX}nestconfig node <id>*
│  └⊷ Set which node to deploy servers on
│
├─⊷ *${PREFIX}nestconfig location <id>*
│  └⊷ Set the server location
│
├─⊷ *${PREFIX}nestconfig cpu <amount>*
│  └⊷ Set CPU limit (e.g. 100 = 1 core, 200 = 2 cores)
│
├─⊷ *${PREFIX}nestconfig ram <mb>*
│  └⊷ Set RAM limit in MB (e.g. 1024 = 1 GB)
│
├─⊷ *${PREFIX}nestconfig disk <mb>*
│  └⊷ Set disk space limit in MB
│
╰─⊷

╭─⊷ *👤 STEP 3 — CREATE USER & SERVER*
│
├─⊷ *${PREFIX}createuser <name> <email> <username> <password>*
│  └⊷ Creates a new user account on the panel
│  └⊷ Example: ${PREFIX}createuser John john@mail.com john1 pass123
│
├─⊷ *${PREFIX}createpanel <email>*
│  └⊷ Creates a server for an existing panel user
│  └⊷ Uses the template set with nestconfig
│  └⊷ Example: ${PREFIX}createpanel john@mail.com
│
╰─⊷`;

    await sendSubMenu(sock, jid, 'CPanel Guide', commandsText, m, PREFIX);
  },
};
