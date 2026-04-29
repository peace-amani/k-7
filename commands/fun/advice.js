import axios from 'axios';
import { getOwnerName } from '../../lib/menuHelper.js';

const FALLBACK_ADVICE = [
    "Don't believe everything you think.",
    "If it scares you, it might be a good thing to try.",
    "Drink a glass of water before deciding you're hungry.",
    "Most things you worry about never actually happen.",
    "Sleep on big decisions — your morning brain is sharper.",
    "Saying 'no' is a complete sentence.",
    "Action cures fear; sitting still feeds it.",
    "Your future self is watching — make them proud.",
    "Done is better than perfect.",
    "The best apology is changed behavior.",
    "Travel light — through life and through luggage.",
    "Compare yourself only to who you were yesterday.",
    "If you can't say it kindly, sleep on it.",
    "Read more than you scroll.",
    "Walk daily; problems shrink in motion.",
    "Be the person your dog already thinks you are.",
    "Don't argue with people who are committed to misunderstanding you.",
    "Save 10% of everything you earn — start today.",
    "The right time will never feel right. Start anyway.",
    "Listen twice as much as you speak."
];

async function fetchAdvice() {
    // Primary: api.adviceslip.com (free, no auth)
    try {
        // Cache-buster prevents the API's aggressive caching
        const r = await axios.get(`https://api.adviceslip.com/advice?_=${Date.now()}`, {
            timeout: 6000,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        // The API sometimes returns text/html content-type with JSON body — handle both
        let data = r.data;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch {}
        }
        const text = data?.slip?.advice;
        if (text && typeof text === 'string' && text.trim().length > 0) {
            return text.trim();
        }
    } catch {}

    // Fallback: local list
    return FALLBACK_ADVICE[Math.floor(Math.random() * FALLBACK_ADVICE.length)];
}

export default {
    name: 'advice',
    alias: ['wisdom', 'tip', 'getadvice'],
    desc: 'Get a random piece of advice — for you, a mention, or the whole group',
    category: 'Fun',
    usage: '.advice  |  .advice @user  |  reply to someone with .advice',

    async execute(sock, m, args, PREFIX) {
        const chatId   = m.key.remoteJid;
        const isGroup  = chatId.endsWith('@g.us');
        const senderJid = m.key.participant || (m.key.fromMe ? sock.user?.id : chatId);

        const ctx       = m.message?.extendedTextMessage?.contextInfo;
        const mentioned = ctx?.mentionedJid || [];
        const replyJid  = ctx?.participant;

        let target = null;
        if (mentioned.length > 0)      target = mentioned[0];
        else if (replyJid)             target = replyJid;

        await sock.sendMessage(chatId, { react: { text: '💡', key: m.key } });

        try {
            const advice = await fetchAdvice();

            if (target) {
                const tag = `@${target.split('@')[0]}`;
                return sock.sendMessage(chatId, {
                    text:
                        `╭─⌈ 💡 *ADVICE FOR ${tag.toUpperCase()}* ⌋\n` +
                        `├─⊷ ${tag}\n` +
                        `│  "${advice}"\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
                    mentions: [target]
                }, { quoted: m });
            }

            // No target — generic advice for the chat
            return sock.sendMessage(chatId, {
                text:
                    `╭─⌈ 💡 *DAILY ADVICE* ⌋\n` +
                    `│  "${advice}"\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });

        } catch (err) {
            console.error('[ADVICE] Error:', err);
            return sock.sendMessage(chatId, {
                text: `❌ Failed: ${err.message}`
            }, { quoted: m });
        }
    }
};
