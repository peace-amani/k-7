// ====== commands/cpanel/createpanel.js ======
// Creates a Pterodactyl server (panel) for an existing panel user.
//
// Usage:
//   .createpanel user@example.com
//   .createpanel someusername
//
// The command accepts either an email address or a username.
// It looks up the user on the panel, then creates a server using the
// Nest / Egg / Node / resource settings from nestconfig.
//
// The server name defaults to "username's Server" but can be overridden:
//   .createpanel user@example.com My Custom Server Name
//
// Owner only.

import {
    getUserByEmail, getUserByUsername, createServer, isConfigured
} from '../../lib/cpanel.js';
import { getBotName } from '../../lib/botname.js';

export default {
    name:        'createpanel',
    alias:       ['newpanel', 'addpanel', 'cpanelcreate'],
    category:    'cpanel',
    description: 'Create a Pterodactyl server (panel) for a panel user',
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

        // ── Guard: panel must be configured ─────────────────────────────────
        if (!isConfigured()) {
            return sock.sendMessage(chatId, {
                text: `❌ *cPanel not configured*\n\n` +
                      `Run these first:\n` +
                      `  1. \`${PREFIX}setkey <api-key>\`\n` +
                      `  2. \`${PREFIX}setlink <panel-url>\`\n` +
                      `  3. \`${PREFIX}nestconfig\` (set egg + location)`
            }, { quoted: msg });
        }

        // ── Usage guard ──────────────────────────────────────────────────────
        const identifier = args[0]?.trim();
        if (!identifier) {
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 🖥️ *CREATE PANEL* ⌋\n│\n` +
                      `├─⊷ *Usage:*\n` +
                      `│  └⊷ \`${PREFIX}createpanel user@email.com\`\n` +
                      `│  └⊷ \`${PREFIX}createpanel username\`\n` +
                      `│  └⊷ \`${PREFIX}createpanel email Server Name\`\n` +
                      `│\n` +
                      `├─⊷ The user must already exist on the panel.\n` +
                      `├─⊷ Use \`${PREFIX}createuser\` to create them first.\n` +
                      `╰⊷ *Powered by ${BOT}*`
            }, { quoted: msg });
        }

        // Optional custom server name (everything after the first arg)
        const customName = args.slice(1).join(' ').trim() || null;

        await sock.sendMessage(chatId, {
            text: `⏳ Looking up user *${identifier}*...`
        }, { quoted: msg });

        // ── Resolve user ─────────────────────────────────────────────────────
        let user;
        try {
            if (identifier.includes('@')) {
                user = await getUserByEmail(identifier);
            } else {
                user = await getUserByUsername(identifier);
            }
        } catch (err) {
            return sock.sendMessage(chatId, {
                text: `❌ *Could not look up user*\n\n${err.message}`
            }, { quoted: msg });
        }

        if (!user) {
            return sock.sendMessage(chatId, {
                text: `❌ *User not found*\n\n` +
                      `No panel user matches \`${identifier}\`.\n\n` +
                      `Create them first with \`${PREFIX}createuser ${identifier}\``
            }, { quoted: msg });
        }

        const userId   = user.attributes.id;
        const username = user.attributes.username;
        const email    = user.attributes.email;

        // ── Derive server name ───────────────────────────────────────────────
        const serverName = customName || `${username}'s Server`;

        await sock.sendMessage(chatId, {
            text: `⏳ Creating server *${serverName}* for *${username}*...`
        }, { quoted: msg });

        // ── Create the server ────────────────────────────────────────────────
        let server;
        try {
            server = await createServer(userId, serverName);
        } catch (err) {
            return sock.sendMessage(chatId, {
                text: `❌ *Failed to create server*\n\n${err.message}`
            }, { quoted: msg });
        }

        const serverId     = server?.attributes?.id;
        const serverUUID   = server?.attributes?.uuid;
        const serverIdShort = server?.attributes?.identifier;

        await sock.sendMessage(chatId, {
            text: `╭─⌈ ✅ *PANEL CREATED* ⌋\n│\n` +
                  `├─⊷ *Server  :* ${serverName}\n` +
                  `├─⊷ *Owner   :* ${username} (${email})\n` +
                  `├─⊷ *Server ID :* ${serverId ?? '—'}\n` +
                  `├─⊷ *Short ID  :* ${serverIdShort ?? '—'}\n` +
                  (serverUUID ? `├─⊷ *UUID     :* ${serverUUID}\n` : '') +
                  `│\n` +
                  `├─⊷ The user can log in at your panel URL.\n` +
                  `╰⊷ *Powered by ${BOT}*`
        }, { quoted: msg });
    }
};
