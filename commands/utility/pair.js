import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: "pair",
    alias: ["paircode", "linkdevice", "getcode"],
    description: "Generate a pairing code to link WhatsApp to this bot session",
    category: "utility",
    usage: ".pair <phone_number>",

    async execute(sock, m, args) {
        const jid = m.key.remoteJid;
        const prefix = global.prefix || '/';

        if (!args[0]) {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 📲 *PAIR CODE* ⌋\n│\n├─⊷ *Usage:*\n│  └⊷ *${prefix}pair <phone>*\n│\n├─⊷ *Examples:*\n│  └⊷ ${prefix}pair 254712345678\n│  └⊷ ${prefix}pair 1234567890\n│\n├─⊷ *Note:*\n│  └⊷ Include country code, no + or spaces\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });
        }

        const rawPhone = args[0].replace(/\D/g, '');

        if (rawPhone.length < 7 || rawPhone.length > 15) {
            return sock.sendMessage(jid, {
                text: `❌ *Invalid number*\n\nMust be 7–15 digits with country code.\n*Example:* ${prefix}pair 254712345678`
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        let code;
        try {
            code = await sock.requestPairingCode(rawPhone);
        } catch (err) {
            console.error('[PAIR] requestPairingCode error:', err.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            return sock.sendMessage(jid, {
                text: `❌ *Failed to generate pair code*\n\n_${err.message}_\n\nMake sure the number is not already linked to this session.`
            }, { quoted: m });
        }

        if (!code) {
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            return sock.sendMessage(jid, {
                text: `❌ *No code returned.*\n\nThe number may already be linked, or WhatsApp rejected the request.`
            }, { quoted: m });
        }

        const formatted = code.length === 8
            ? `${code.slice(0, 4)}-${code.slice(4)}`
            : code;

        const resultText =
            `╭─⌈ 📲 *PAIR CODE* ⌋\n` +
            `│\n` +
            `├─⊷ *Phone:* +${rawPhone}\n` +
            `├─⊷ *Code:*  \`${formatted}\`\n` +
            `│\n` +
            `├─⊷ *How to link:*\n` +
            `│  1️⃣  Open WhatsApp → ⋮ Menu\n` +
            `│  2️⃣  Linked Devices → Link a Device\n` +
            `│  3️⃣  Tap "Link with Phone Number"\n` +
            `│  4️⃣  Enter: *${formatted}*\n` +
            `│\n` +
            `├─⊷ ⚠️ Code valid for *~3 minutes*\n` +
            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;

        try {
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            const { sendInteractiveMessage } = require('gifted-btns');
            await sendInteractiveMessage(sock, jid, {
                text: resultText,
                footer: getBotName(),
                interactiveButtons: [
                    {
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: '📋 Copy Code',
                            copy_code: formatted
                        })
                    }
                ]
            });
        } catch (btnErr) {
            console.log('[PAIR] Buttons failed, sending plain text:', btnErr.message);
            await sock.sendMessage(jid, { text: resultText }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
    }
};
