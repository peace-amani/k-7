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
│  └⊷ Get it: Panel → Admin → API → Application API
│
├─⊷ *${PREFIX}mysetkey*
│  └⊷ Show your saved API key with a copy button
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
├─⊷ *${PREFIX}nestconfig nodes / locations*
│  └⊷ List available nodes and locations
│
├─⊷ *${PREFIX}nestconfig nest/egg/node/location <id>*
│  └⊷ Set each value by ID
│
├─⊷ *${PREFIX}nestconfig cpu/ram/disk <value>*
│  └⊷ Set resource limits for new servers
│
╰─⊷

╭─⊷ *👤 STEP 3 — MANAGE USERS*
│
├─⊷ *${PREFIX}createuser <name> <email> <username> <password>*
│  └⊷ Create a new panel user account
│
├─⊷ *${PREFIX}deleteuser <email>*
│  └⊷ Delete user and all their servers
│
├─⊷ *${PREFIX}listusers*
│  └⊷ List all users on the panel
│
├─⊷ *${PREFIX}totalusers*
│  └⊷ Show total count of users
│
├─⊷ *${PREFIX}listadminusers*
│  └⊷ List all admin users with a Demote ALL button
│
├─⊷ *${PREFIX}demoteadminusers*
│  └⊷ Demote all admins except the main admin
│
├─⊷ *${PREFIX}deleteallusers*
│  └⊷ Delete all users except the main admin
│
╰─⊷

╭─⊷ *🖥️ STEP 4 — MANAGE SERVERS*
│
├─⊷ *${PREFIX}createpanel <email>*
│  └⊷ Create a server for an existing user
│
├─⊷ *${PREFIX}deletepanel <server-id>*
│  └⊷ Delete a server by ID (get ID from listpanels)
│
├─⊷ *${PREFIX}listpanels*
│  └⊷ List all servers with their IDs
│
├─⊷ *${PREFIX}totalpanels*
│  └⊷ Show total count of servers
│
├─⊷ *${PREFIX}deleteall*
│  └⊷ Force-delete every server on the panel
│
╰─⊷`;

    await sendSubMenu(sock, jid, 'CPanel Guide', commandsText, m, PREFIX);
  },
};
