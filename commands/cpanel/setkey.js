// ====== commands/cpanel/setkey.js ======
// Stores the Pterodactyl Application API key in data/cpanel_config.json.
//
// Usage:
//   .setkey <api-key>       — save the key
//   .setkey                 — show current status (key is masked for security)
//
// Owner only.  The key is never printed in full after it has been saved.

import { loadConfig, saveConfig } from '../../lib/cpanel.js';
import { getBotName }            from '../../lib/botname.js';

export default {
    name:        'setkey',
    alias:       ['cpanelkey', 'pterokey'],
    category:    'cpanel',
    description: 'Set the Pterodactyl Application API key for cPanel commands',
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

        // No argument — show current status
        if (!args[0]) {
            const status = config.apiKey
                ? `✅ Set (${config.apiKey.slice(0, 6)}••••••••)`
                : '❌ Not set';

            return sock.sendMessage(chatId, {
                text: `╭─⌈ 🔑 *CPANEL — SET API KEY* ⌋\n│\n` +
                      `├─⊷ *Status:* ${status}\n` +
                      `│\n` +
                      `├─⊷ *Usage:*\n` +
                      `│  └⊷ \`${PREFIX}setkey <your-api-key>\`\n` +
                      `│\n` +
                      `├─⊷ *Where to find it:*\n` +
                      `│  └⊷ Pterodactyl admin panel\n` +
                      `│     ➜ Account Settings ➜ API Credentials\n` +
                      `│     ➜ Create a new *Application* API key\n` +
                      `╰⊷ *Powered by ${BOT}*`
            }, { quoted: msg });
        }

        const key = args[0].trim();

        if (key.length < 16) {
            return sock.sendMessage(chatId, {
                text: `❌ That key looks too short.\n\nPterodactyl Application API keys are typically 48 characters long.`
            }, { quoted: msg });
        }

        config.apiKey = key;
        saveConfig(config);

        await sock.sendMessage(chatId, {
            text: `✅ *API Key Saved*\n\n` +
                  `Key: ${key.slice(0, 6)}••••••••\n\n` +
                  `_Next: run \`${PREFIX}setlink\` to set your panel URL._`
        }, { quoted: msg });
    }
};
