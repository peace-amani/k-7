import { delay } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';
import { resolveJid } from '../tools/getjid.js';

async function tryWaBlock(sock, jid) {
    const listNode = {
        tag: 'iq',
        attrs: { xmlns: 'blocklist', to: 's.whatsapp.net', type: 'set' },
        content: [{ tag: 'list', attrs: { action: 'block' }, content: [{ tag: 'item', attrs: { jid } }] }],
    };
    try {
        await sock.query(listNode);
        return true;
    } catch (e1) {
        const msg = e1?.message || '';
        if (msg === 'bad-request') return false;
        console.log(`[BLOCK] IQ list-format: ${msg}`);
    }
    try {
        await sock.updateBlockStatus(jid, 'block');
        return true;
    } catch (e2) {
        const msg = e2?.message || '';
        if (msg === 'bad-request') return false;
        console.log(`[BLOCK] updateBlockStatus: ${msg}`);
    }
    if (typeof sock.sendNode === 'function') {
        listNode.attrs.id = typeof sock.generateMessageTag === 'function'
            ? sock.generateMessageTag() : `block-${Date.now()}`;
        await sock.sendNode(listNode).catch(() => {});
    }
    return false;
}

export default {
    name: 'block',
    description: 'Block a user — bot will ignore them and attempts WA-level block',
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
                    text: `╭─⌈ 🕸️ *BLOCK LIST* ⌋\n│\n╰⊷ No users blocked yet.`,
                }, { quoted: msg });
            }
            const lines = list.map((n, i) => `├─⊷ ${i + 1}. +${n}`).join('\n');
            return sock.sendMessage(key.remoteJid, {
                text: `╭─⌈ 🕸️ *BLOCK LIST* ⌋\n│\n${lines}\n╰⊷ Total: ${list.length}`,
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
        console.log(`[BLOCK] rawTarget=${rawTarget} → resolved=${target}`);

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

        // PRIMARY: add to bot-side blocklist immediately
        if (typeof globalThis.addBlockedUser === 'function') {
            globalThis.addBlockedUser(target);
        }

        // BACKGROUND: attempt WA-level block (best-effort, may not work for all accounts)
        tryWaBlock(sock, target).catch(() => {});

        await delay(400);
        const num = target.split('@')[0];
        await sock.sendMessage(key.remoteJid, {
            text: `🕸️ *Blocked.*\n\n❌ +${num} is now blocked.\n_The bot will ignore all messages from this user._`,
        }, { quoted: msg });
    },
};
