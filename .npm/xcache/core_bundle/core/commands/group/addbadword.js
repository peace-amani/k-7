import { addBadWord, getBadWords } from '../../lib/badwords-store.js';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: 'addbadword',
    alias: ['addswear', 'banword'],
    description: 'Add a word to the bad word filter list',
    category: 'group',
    async execute(sock, msg, args) {
        const chatId = msg.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');

        if (!args || args.length === 0) {
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 🤬 *ADD BAD WORD* ⌋\n│\n├─⊷ *Usage:* .addbadword <word>\n├─⊷ *Example:* .addbadword badterm\n│\n├─⊷ Add multiple: .addbadword word1 word2\n╰───\n\n💡 Use *.antibadword on* to enable detection\n💡 Use *.listbadword* to view all words`,
            }, { quoted: msg });
        }

        const added = [];
        const existing = [];

        for (const word of args) {
            const clean = word.toLowerCase().trim();
            if (!clean) continue;
            const result = addBadWord(clean);
            if (result) {
                added.push(clean);
            } else {
                existing.push(clean);
            }
        }

        const total = getBadWords().length;
        let reply = `╭─⌈ 🤬 *BAD WORD FILTER* ⌋\n│\n`;
        if (added.length > 0) reply += `├─⊷ ✅ Added: ${added.map(w => `*${w}*`).join(', ')}\n`;
        if (existing.length > 0) reply += `├─⊷ ⚠️ Already exists: ${existing.map(w => `*${w}*`).join(', ')}\n`;
        reply += `├─⊷ 📋 Total words: *${total}*\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;

        return sock.sendMessage(chatId, { text: reply }, { quoted: msg });
    }
};
