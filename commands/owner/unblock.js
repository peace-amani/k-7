import { delay } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';
import { resolveJid } from '../tools/getjid.js';

async function tryUnblock(sock, jid) {
    const node = {
        tag: 'iq',
        attrs: { xmlns: 'blocklist', to: 's.whatsapp.net', type: 'set' },
        content: [{ tag: 'item', attrs: { action: 'unblock', jid } }],
    };

    // Strategy 1: Baileys helper
    try {
        await sock.updateBlockStatus(jid, 'unblock');
        return;
    } catch (e1) {
        console.log(`[UNBLOCK] updateBlockStatus: ${e1?.message}`);
    }

    // Strategy 2: query() — waits for server ACK
    try {
        await sock.query(node);
        return;
    } catch (e2) {
        console.log(`[UNBLOCK] query failed: ${e2?.message}`);
    }

    // Strategy 3: sendNode — fire-and-forget, bypasses ACK timeout
    if (typeof sock.sendNode === 'function') {
        const { generateMessageTag } = await import('@whiskeysockets/baileys');
        node.attrs.id = generateMessageTag();
        await sock.sendNode(node);
        return;
    }

    throw new Error('All unblock strategies exhausted');
}

export default {
    name: 'unblock',
    description: 'Unblock a user by number, mention, or reply',
    category: 'owner',
    async execute(sock, msg, args) {
        const { key, message } = msg;
        const isGroup = key.remoteJid.endsWith('@g.us');
        let rawTarget = null;

        // 1. Number argument
        if (args[0]) {
            const num = args[0].replace(/[^0-9]/g, '');
            if (num.length >= 7) rawTarget = `${num}@s.whatsapp.net`;
        }

        // 2. Mention
        if (!rawTarget) {
            const mentioned = message?.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) rawTarget = mentioned[0];
        }

        // 3. Quoted reply
        if (!rawTarget) {
            const quoted = message?.extendedTextMessage?.contextInfo?.participant;
            if (quoted) rawTarget = quoted;
        }

        if (!rawTarget) {
            return sock.sendMessage(key.remoteJid, {
                text: `╭─⌈ 🕊️ *UNBLOCK* ⌋\n│\n├─⊷ *unblock <number>*\n│  └⊷ e.g. unblock 254712345678\n├─⊷ *Tag a user* or *reply* to their message\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
            }, { quoted: msg });
        }

        if (rawTarget.endsWith('@g.us') || rawTarget.endsWith('@newsletter')) {
            return sock.sendMessage(key.remoteJid, {
                text: '⚠️ Cannot unblock a group or newsletter.',
            }, { quoted: msg });
        }

        const target = await resolveJid(sock, rawTarget);
        console.log(`[UNBLOCK] rawTarget=${rawTarget} → resolved=${target}`);

        if (!target || target.endsWith('@lid')) {
            return sock.sendMessage(key.remoteJid, {
                text: `⚠️ Could not resolve this user.\n\nTry the number directly:\n*unblock 254712345678*`,
            }, { quoted: msg });
        }

        let unblocked = false;
        let lastErr = null;

        for (const jid of [target]) {
            try {
                console.log(`[UNBLOCK] Attempting: ${jid}`);
                await tryUnblock(sock, jid);
                unblocked = true;
                console.log(`[UNBLOCK] Success: ${jid}`);
                break;
            } catch (err) {
                console.error(`[UNBLOCK] Failed (${jid}):`, err?.message || err);
                lastErr = err;
            }
        }

        await delay(500);
        if (unblocked) {
            const num = target.split('@')[0];
            await sock.sendMessage(key.remoteJid, {
                text: `🌕 *Unblocked successfully.*\n\n✅ +${num} has been unblocked.`,
            }, { quoted: msg });
        } else {
            await sock.sendMessage(key.remoteJid, {
                text: `⚠️ Unblock failed.\n\n_Error: ${lastErr?.message || 'Unknown'}_`,
            }, { quoted: msg });
        }
    },
};
