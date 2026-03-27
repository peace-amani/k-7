import { delay } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';
import { resolveJid } from '../tools/getjid.js';

async function tryWaUnblock(sock, jid) {
    const listNode = {
        tag: 'iq',
        attrs: { xmlns: 'blocklist', to: 's.whatsapp.net', type: 'set' },
        content: [{ tag: 'list', attrs: { action: 'unblock' }, content: [{ tag: 'item', attrs: { jid } }] }],
    };
    try {
        await sock.query(listNode);
        return true;
    } catch (e1) {
        const msg = e1?.message || '';
        if (msg === 'bad-request') return false;
        console.log(`[UNBLOCK] IQ list-format: ${msg}`);
    }
    try {
        await sock.updateBlockStatus(jid, 'unblock');
        return true;
    } catch (e2) {
        const msg = e2?.message || '';
        if (msg === 'bad-request') return false;
        console.log(`[UNBLOCK] updateBlockStatus: ${msg}`);
    }
    if (typeof sock.sendNode === 'function') {
        listNode.attrs.id = typeof sock.generateMessageTag === 'function'
            ? sock.generateMessageTag() : `unblock-${Date.now()}`;
        await sock.sendNode(listNode).catch(() => {});
    }
    return false;
}

export default {
    name: 'unblock',
    description: 'Unblock a user by number, mention, or reply',
    category: 'owner',
    async execute(sock, msg, args) {
        const { key, message } = msg;
        let rawTarget = null;

        if (args[0]) {
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

        if (!rawTarget) {
            return sock.sendMessage(key.remoteJid, {
                text: `╭─⌈ 🕊️ *UNBLOCK* ⌋\n│\n├─⊷ */unblock <number>*\n│  └⊷ e.g. /unblock 254712345678\n├─⊷ *Tag* or *reply* to a user\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
            }, { quoted: msg });
        }

        if (rawTarget.endsWith('@g.us') || rawTarget.endsWith('@newsletter')) {
            return sock.sendMessage(key.remoteJid, {
                text: '⚠️ Cannot unblock a group or newsletter.',
            }, { quoted: msg });
        }

        const target = await resolveJid(sock, rawTarget);
        console.log(`[UNBLOCK] rawTarget=${rawTarget} → resolved=${target}`);

        const botNum = (sock.user?.id || '').split(':')[0].split('@')[0];
        const targetNum = (target || '').split('@')[0];
        if (botNum && targetNum && botNum === targetNum) {
            return sock.sendMessage(key.remoteJid, {
                text: `⚠️ Cannot unblock the bot's own number.`,
            }, { quoted: msg });
        }

        if (!target || target.endsWith('@lid')) {
            return sock.sendMessage(key.remoteJid, {
                text: `⚠️ Could not resolve this user.\n\nTry the number directly:\n*/unblock 254712345678*`,
            }, { quoted: msg });
        }

        // PRIMARY: remove from bot-side blocklist immediately
        if (typeof globalThis.removeBlockedUser === 'function') {
            globalThis.removeBlockedUser(target);
        }

        // BACKGROUND: attempt WA-level unblock (best-effort)
        tryWaUnblock(sock, target).catch(() => {});

        await delay(400);
        const num = target.split('@')[0];
        await sock.sendMessage(key.remoteJid, {
            text: `🌕 *Unblocked.*\n\n✅ +${num} has been unblocked.\n_The bot will respond to this user again._`,
        }, { quoted: msg });
    },
};
