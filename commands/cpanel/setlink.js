// ====== commands/cpanel/setlink.js ======
// Stores the Pterodactyl panel URL in data/cpanel_config.json.
//
// Usage:
//   .setlink <url>    — e.g.  .setlink https://panel.myhost.com
//   .setlink          — show current URL
//
// Owner only.

import { loadConfig, saveConfig } from '../../lib/cpanel.js';
import { getBotName }            from '../../lib/botname.js';

export default {
    name:        'setlink',
    alias:       ['panellink', 'cpanelurl', 'pterolink'],
    category:    'cpanel',
    description: 'Set the Pterodactyl panel URL for cPanel commands',
    ownerOnly:   true,
    sudoAllowed: false,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const BOT    = getBotName();
        const { jidManager } = extra;

        if (!jidManager.isOwner(msg)) {
            return sock.sendMessage(chatId,
                { text: '❌ *Owner Only Command*' },
                { quoted: msg }
            );
        }

        const config = loadConfig();

        // No argument — show current link
        if (!args[0]) {
            const display = config.panelUrl || '❌ Not set';
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 🔗 *CPANEL — SET PANEL LINK* ⌋\n│\n` +
                      `├─⊷ *Current URL:* ${display}\n` +
                      `│\n` +
                      `├─⊷ *Usage:*\n` +
                      `│  └⊷ \`${PREFIX}setlink https://panel.example.com\`\n` +
                      `│\n` +
                      `╰⊷ *Powered by ${BOT}*`
            }, { quoted: msg });
        }

        let url = args[0].trim();

        // Normalise — ensure no trailing slash, require http(s)
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }
        url = url.replace(/\/+$/, '');

        config.panelUrl = url;
        saveConfig(config);

        await sock.sendMessage(chatId, {
            text: `✅ *Panel URL Saved*\n\n` +
                  `URL: ${url}\n\n` +
                  `_Next: run \`${PREFIX}nestconfig\` to configure the server template._`
        }, { quoted: msg });
    }
};
