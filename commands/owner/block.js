import { getOwnerName } from '../../lib/menuHelper.js';
import { resolveJid } from '../tools/getjid.js';

export default {
    name: 'block',
    description: 'Block a user from using the bot + manual WhatsApp block guidance',
    category: 'owner',
    async execute(sock, msg, args) {
        const { key, message } = msg;
        const isGroup = key.remoteJid.endsWith('@g.us');

        // Subcommand: /block list
        if (args[0] === 'list') {
            const list = typeof globalThis.getBotBlocklist === 'function'
                ? globalThis.getBotBlocklist() : [];
            if (list.length === 0) {
                return sock.sendMessage(key.remoteJid, {
                    text: `╭─⌈ 🕸️ *BOT BLOCK LIST* ⌋\n│\n╰⊷ No users blocked yet.`,
                }, { quoted: msg });
            }
            const lines = list.map((n, i) => `├─⊷ ${i + 1}. +${n}`).join('\n');
            return sock.sendMessage(key.remoteJid, {
                text: `╭─⌈ 🕸️ *BOT BLOCK LIST* ⌋\n│\n${lines}\n╰⊷ Total: ${list.length}`,
            }, { quoted: msg });
        }

        let rawTarget = null;

        if (args[0] && args[0] !== 'list') {
            const num = args[0].replace(/[^0-9]/g, '');
            if (num.length >= 7) rawTarget = `${num}@s.whatsapp.net`;
        }
        if (!rawTarget) {
            const mentioned = message?.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned?.length > 0) rawTarget = mentioned[0];
        }
        if (!rawTarget) {
            const quoted = message?.extendedTextMessage?.contextInfo?.participant;
            if (quoted) rawTarget = quoted;
        }
        if (!rawTarget && isGroup) {
            return sock.sendMessage(key.remoteJid, {
                text: `╭─⌈ 🐺 *BLOCK* ⌋\n│\n├─⊷ */block <number>*\n│  └⊷ e.g. /block 254712345678\n├─⊷ *Tag* or *reply* to a user\n├─⊷ */block list* — view blocked users\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
            }, { quoted: msg });
        }
        if (!rawTarget && !isGroup) rawTarget = key.remoteJid;

        if (!rawTarget || rawTarget.endsWith('@g.us') || rawTarget.endsWith('@newsletter')) {
            return sock.sendMessage(key.remoteJid, {
                text: '⚠️ Cannot block a group or newsletter.',
            }, { quoted: msg });
        }

        const target = await resolveJid(sock, rawTarget);

        const botNum = (sock.user?.id || '').split(':')[0].split('@')[0];
        const targetNum = (target || '').split('@')[0];
        if (botNum && targetNum && botNum === targetNum) {
            return sock.sendMessage(key.remoteJid, {
                text: `⚠️ Cannot block the bot's own number.`,
            }, { quoted: msg });
        }

        if (!target || target.endsWith('@lid')) {
            return sock.sendMessage(key.remoteJid, {
                text: `⚠️ Could not resolve this user.\n\nTry the number directly:\n*/block 254712345678*`,
            }, { quoted: msg });
        }

        // Add to bot-side blocklist — bot will completely ignore this user
        if (typeof globalThis.addBlockedUser === 'function') {
            globalThis.addBlockedUser(target);
        }

        const num = target.split('@')[0];
        await sock.sendMessage(key.remoteJid, {
            text: `🕸️ *Bot Block Applied*\n\n` +
                `❌ *+${num}* is now blocked from the bot.\n` +
                `_The bot will ignore all messages and commands from this user._\n\n` +
                `⚠️ *Note:* Due to WhatsApp API limitations, a full WhatsApp-level block\n` +
                `_(calls, messages, profile)_ cannot be done through the bot.\n\n` +
                `👉 *To fully block on WhatsApp:*\n` +
                `Open their chat → Tap name → *Block*\n` +
                `Or: *Settings → Privacy → Blocked Contacts → Add*`,
        }, { quoted: msg });
    },
};
