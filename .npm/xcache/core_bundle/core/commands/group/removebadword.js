import { removeBadWord, getBadWords } from '../../lib/badwords-store.js';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: 'removebadword',
    alias: ['delbadword', 'deleteswear', 'unbanword'],
    description: 'Remove a word from the bad word filter list',
    category: 'group',
    async execute(sock, msg, args) {
        const chatId = msg.key.remoteJid;

        if (!args || args.length === 0) {
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 🤬 *REMOVE BAD WORD* ⌋\n│\n├─⊷ *Usage:* .removebadword <word>\n├─⊷ *Example:* .removebadword badterm\n│\n├─⊷ Use *.listbadword* to view all words\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
            }, { quoted: msg });
        }

        const removed = [];
        const notFound = [];

        for (const word of args) {
            const clean = word.toLowerCase().trim();
            if (!clean) continue;
            const result = removeBadWord(clean);
            if (result) {
                removed.push(clean);
            } else {
                notFound.push(clean);
            }
        }

        const total = getBadWords().length;
        let reply = `╭─⌈ 🤬 *BAD WORD FILTER* ⌋\n│\n`;
        if (removed.length > 0) reply += `├─⊷ ✅ Removed: ${removed.map(w => `*${w}*`).join(', ')}\n`;
        if (notFound.length > 0) reply += `├─⊷ ⚠️ Not found: ${notFound.map(w => `*${w}*`).join(', ')}\n`;
        reply += `├─⊷ 📋 Remaining words: *${total}*\n╰───`;

        return sock.sendMessage(chatId, { text: reply }, { quoted: msg });
    }
};
