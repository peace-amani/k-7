import { getBotName } from '../../lib/botname.js';

function cleanNumber(input) {
    return input.replace(/[\s\+\-\(\)]/g, '').replace(/^0+/, '');
}

export default {
    name: 'onwhatsapp',
    alias: ['isonwa', 'checkwa', 'wacheck'],
    description: 'Check if a phone number is registered on WhatsApp',
    category: 'tools',

    async execute(sock, msg, args, PREFIX) {
        const chatId = msg.key.remoteJid;

        if (!args.length) {
            return sock.sendMessage(chatId, {
                text: `╭⊷『 📱 ON WHATSAPP 』\n│\n` +
                      `├⊷ *Usage:* ${PREFIX}onwhatsapp <number>\n` +
                      `├⊷ *Example:* ${PREFIX}onwhatsapp 254713046497\n` +
                      `└⊷ *Tip:* Include country code (no + needed)\n\n` +
                      `╰⊷ *${getBotName()} Tools* 🐾`
            }, { quoted: msg });
        }

        const raw = args.join('').trim();
        const number = cleanNumber(raw);

        if (!/^\d{7,15}$/.test(number)) {
            return sock.sendMessage(chatId, {
                text: `❌ *Invalid number format.*\n\nPlease enter a valid number with country code.\n*Example:* ${PREFIX}onwhatsapp 254713046497`
            }, { quoted: msg });
        }

        const jid = `${number}@s.whatsapp.net`;

        try {
            await sock.sendMessage(chatId, {
                text: `⏳ *Checking* +${number} *on WhatsApp...*`
            }, { quoted: msg });

            const result = await sock.onWhatsApp(jid);
            const exists = result && result.length > 0 && result[0]?.exists;

            if (exists) {
                await sock.sendMessage(chatId, {
                    text: `╭⊷『 ✅ WHATSAPP CHECK 』\n│\n` +
                          `├⊷ *Number:* +${number}\n` +
                          `├⊷ *Status:* ✅ Registered on WhatsApp\n` +
                          `├⊷ *JID:* ${result[0]?.jid || jid}\n` +
                          `└⊷ *Verified by:* ${getBotName()}\n\n` +
                          `╰⊷ *${getBotName()} Tools* 🐾`
                }, { quoted: msg });
            } else {
                await sock.sendMessage(chatId, {
                    text: `╭⊷『 ❌ WHATSAPP CHECK 』\n│\n` +
                          `├⊷ *Number:* +${number}\n` +
                          `├⊷ *Status:* ❌ Not registered on WhatsApp\n` +
                          `└⊷ *Verified by:* ${getBotName()}\n\n` +
                          `╰⊷ *${getBotName()} Tools* 🐾`
                }, { quoted: msg });
            }

        } catch (e) {
            await sock.sendMessage(chatId, {
                text: `❌ *Failed to check number.*\n\nError: ${e.message}\n\nMake sure the number includes a valid country code.`
            }, { quoted: msg });
        }
    }
};
