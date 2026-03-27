import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: "pair",
    alias: ["paircode", "linkdevice", "getcode"],
    description: "Instructions for linking WhatsApp to a new device",
    category: "utility",
    usage: ".pair",

    async execute(sock, m, args) {
        const jid = m.key.remoteJid;

        const text =
            `╭─⌈ 📲 *LINK A DEVICE* ⌋\n` +
            `│\n` +
            `├─⊷ *How to link WhatsApp:*\n` +
            `│\n` +
            `│  1️⃣  Open WhatsApp on your phone\n` +
            `│  2️⃣  Tap ⋮ (Menu) → *Linked Devices*\n` +
            `│  3️⃣  Tap *Link a Device*\n` +
            `│  4️⃣  Scan the QR code shown\n` +
            `│\n` +
            `├─⊷ *To link with phone number:*\n` +
            `│  └⊷ Tap "Link with Phone Number"\n` +
            `│      and enter the code shown\n` +
            `│      on your device screen\n` +
            `│\n` +
            `├─⊷ 🌐 *Web:* web.whatsapp.com\n` +
            `├─⊷ 💻 *Desktop:* desktop.whatsapp.com\n` +
            `│\n` +
            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;

        try {
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            const { sendInteractiveMessage } = require('gifted-btns');
            await sendInteractiveMessage(sock, jid, {
                text,
                footer: getBotName(),
                interactiveButtons: [
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '🌐 Open WhatsApp Web',
                            url: 'https://web.whatsapp.com'
                        })
                    }
                ]
            });
        } catch (btnErr) {
            await sock.sendMessage(jid, { text }, { quoted: m });
        }
    }
};
