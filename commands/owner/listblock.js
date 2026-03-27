import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: 'listblock',
    description: 'List all blocked WhatsApp contacts',
    category: 'owner',
    aliases: ['blocklist', 'blocked'],
    async execute(sock, msg, args) {
        const chatId = msg.key.remoteJid;

        await sock.sendMessage(chatId, {
            text: '🔍 Fetching block list...',
        }, { quoted: msg });

        let blocklist = [];
        try {
            blocklist = await sock.fetchBlocklist();
        } catch (err) {
            console.error('[LISTBLOCK] fetchBlocklist error:', err?.message);
            return sock.sendMessage(chatId, {
                text: `❌ Failed to fetch block list.\n\n_Error: ${err?.message || 'Unknown'}_`,
            }, { quoted: msg });
        }

        if (!blocklist || blocklist.length === 0) {
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 🚫 *BLOCK LIST* ⌋\n│\n├─⊷ *Status:* Empty\n│  └⊷ No contacts are currently blocked.\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
            }, { quoted: msg });
        }

        // Build paginated list (max 50 per message to avoid length issues)
        const PAGE_SIZE = 50;
        const page = Math.max(1, parseInt(args[0]) || 1);
        const total = blocklist.length;
        const totalPages = Math.ceil(total / PAGE_SIZE);
        const start = (page - 1) * PAGE_SIZE;
        const slice = blocklist.slice(start, start + PAGE_SIZE);

        let text = `╭─⌈ 🚫 *BLOCK LIST* ⌋\n│\n`;
        text += `├─⊷ *Total blocked:* ${total}\n`;
        if (totalPages > 1) text += `├─⊷ *Page:* ${page}/${totalPages}\n`;
        text += `│\n`;

        slice.forEach((jid, i) => {
            const num = jid.split('@')[0].split(':')[0];
            text += `├─⊷ ${start + i + 1}. +${num}\n`;
        });

        if (totalPages > 1 && page < totalPages) {
            text += `│\n├─⊷ More: *listblock ${page + 1}*\n`;
        }

        text += `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;

        return sock.sendMessage(chatId, { text }, { quoted: msg });
    },
};
