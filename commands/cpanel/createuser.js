// ====== commands/cpanel/createuser.js ======
// Creates a new user on the Pterodactyl panel.
//
// Usage:
//   .createuser user@example.com
//
// Behaviour:
//   • Derives a username from the local part of the email
//   • Generates a random 8-character password
//   • Calls POST /api/application/users on the configured panel
//   • Returns credentials with two dedicated copy buttons:
//       "Copy Username"  and  "Copy Password"
//   • Falls back to plain-text credential message if interactive
//     buttons are unavailable
//
// Owner only.

import {
    createUser, usernameFromEmail, generatePassword, isConfigured
} from '../../lib/cpanel.js';
import { getBotName } from '../../lib/botname.js';

export default {
    name:        'createuser',
    alias:       ['addpaneluser', 'newpaneluser', 'cpanelcreateuser'],
    category:    'cpanel',
    description: 'Create a new Pterodactyl panel user and receive their credentials',
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
                      `  2. \`${PREFIX}setlink <panel-url>\``
            }, { quoted: msg });
        }

        // ── Usage guard ──────────────────────────────────────────────────────
        const email = args[0]?.trim();
        if (!email || !email.includes('@')) {
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 👤 *CREATE PANEL USER* ⌋\n│\n` +
                      `├─⊷ *Usage:*\n` +
                      `│  └⊷ \`${PREFIX}createuser user@example.com\`\n` +
                      `│\n` +
                      `├─⊷ A username is derived from the email\n` +
                      `├─⊷ A random 8-char password is generated\n` +
                      `╰⊷ *Powered by ${BOT}*`
            }, { quoted: msg });
        }

        // ── Derive credentials ───────────────────────────────────────────────
        const username = usernameFromEmail(email);
        const password = generatePassword();

        await sock.sendMessage(chatId, {
            text: `⏳ Creating user *${username}* on the panel...`
        }, { quoted: msg });

        // ── Call Pterodactyl API ─────────────────────────────────────────────
        let userId;
        try {
            const result = await createUser(email, username, password);
            userId = result?.attributes?.id;
        } catch (err) {
            return sock.sendMessage(chatId, {
                text: `❌ *Failed to create user*\n\n${err.message}`
            }, { quoted: msg });
        }

        // ── Build the credential message ─────────────────────────────────────
        const credText =
            `╭─⌈ ✅ *USER CREATED* ⌋\n│\n` +
            `├─⊷ *Email    :* ${email}\n` +
            `├─⊷ *Username :* ${username}\n` +
            `├─⊷ *Password :* ${password}\n` +
            `├─⊷ *User ID  :* ${userId ?? '—'}\n` +
            `│\n` +
            `├─⊷ Share the credentials using the copy buttons below.\n` +
            `╰⊷ *Powered by ${BOT}*`;

        // ── Try to send with two dedicated copy buttons ──────────────────────
        // globalThis._giftedBtns is exposed by index.js when gifted-btns loads.
        const btns = globalThis._giftedBtns;

        if (btns?.sendInteractiveMessage) {
            try {
                await btns.sendInteractiveMessage(sock, chatId, {
                    text: credText,
                    footer: `🐺 ${BOT}`,
                    interactiveButtons: [
                        {
                            name: 'cta_copy',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📋 Copy Username',
                                copy_code:    username
                            })
                        },
                        {
                            name: 'cta_copy',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🔑 Copy Password',
                                copy_code:    password
                            })
                        }
                    ]
                });
                return;   // sent successfully with buttons — done
            } catch {
                // fall through to plain-text fallback
            }
        }

        // ── Plain-text fallback (no gifted-btns or send failed) ──────────────
        await sock.sendMessage(chatId, { text: credText }, { quoted: msg });
    }
};
