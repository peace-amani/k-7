import { getBotName } from '../../lib/botname.js';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = _require('gifted-btns'); } catch {}

const API = 'https://apiskeith.top/tools/encrypt';

function getContextText(m) {
    const ctx = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!ctx) return null;
    return ctx.conversation ||
           ctx.extendedTextMessage?.text ||
           null;
}

export default {
    name: 'encrypt',
    alias: ['jsencrypt', 'obfuscate', 'codeencrypt'],
    description: 'Encrypt / obfuscate JavaScript code',
    category: 'tools',

    async execute(sock, m, args, PREFIX) {
        const chatId = m.key.remoteJid;

        const quotedText = getContextText(m);
        const argText    = args.join(' ').trim();
        const code       = quotedText || argText;

        if (!code) {
            return sock.sendMessage(chatId, {
                text: `╭⊷『 🔐 JS ENCRYPT 』\n│\n` +
                      `├⊷ *Usage:*\n` +
                      `├⊷ ${PREFIX}encrypt <javascript code>\n` +
                      `├⊷ Or reply to a message containing code\n` +
                      `│\n` +
                      `├⊷ *Example:*\n` +
                      `├⊷ ${PREFIX}encrypt console.log("hello")\n` +
                      `└⊷ *Output:* Obfuscated JS that runs identically\n\n` +
                      `╰⊷ *${getBotName()} Tools* 🐾`
            }, { quoted: m });
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

        try {
            const url = `${API}?q=${encodeURIComponent(code)}`;
            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

            if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);

            const json = await res.json();
            if (!json.status || !json.result) throw new Error('API returned no result');

            const encrypted = json.result;
            const resultText =
                `╭⊷『 🔐 JS ENCRYPT 』\n│\n` +
                `├⊷ *Status:* ✅ Encrypted successfully\n` +
                `├⊷ *Original length:* ${code.length} chars\n` +
                `├⊷ *Encrypted length:* ${encrypted.length} chars\n` +
                `│\n` +
                `├⊷ *Result:*\n` +
                `│\n` +
                `${encrypted}\n` +
                `│\n` +
                `╰⊷ *${getBotName()} Tools* 🐾`;

            await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });

            if (giftedBtns?.sendInteractiveMessage) {
                try {
                    await giftedBtns.sendInteractiveMessage(sock, chatId, {
                        text: resultText,
                        interactiveButtons: [
                            {
                                name: 'cta_copy',
                                buttonParamsJson: JSON.stringify({
                                    display_text: '📋 Copy Encrypted Code',
                                    copy_code: encrypted
                                })
                            }
                        ]
                    }, { quoted: m });
                    return;
                } catch {}
            }

            await sock.sendMessage(chatId, { text: resultText }, { quoted: m });

        } catch (err) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(chatId, {
                text: `╭⊷『 🔐 JS ENCRYPT 』\n│\n` +
                      `├⊷ *Error:* ${err.message}\n` +
                      `└⊷ Please try again with valid JavaScript code\n\n` +
                      `╰⊷ *${getBotName()} Tools* 🐾`
            }, { quoted: m });
        }
    }
};
