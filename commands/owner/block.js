import { delay } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';
import { resolveJid } from '../tools/getjid.js';

async function tryBlock(sock, jid) {
    try {
        await sock.updateBlockStatus(jid, 'block');
        return;
    } catch (e1) {
        console.log(`[BLOCK] updateBlockStatus failed (${e1?.message}), trying IQ...`);
    }
    await sock.query({
        tag: 'iq',
        attrs: { xmlns: 'blocklist', to: 's.whatsapp.net', type: 'set' },
        content: [{
            tag: 'list',
            attrs: {},
            content: [{ tag: 'item', attrs: { action: 'block', jid } }],
        }],
    });
}

export default {
    name: 'block',
    description: 'Block a user by number, mention, reply, or DM contact',
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

        // 4. In a group with no target — show usage
        if (!rawTarget && isGroup) {
            return sock.sendMessage(key.remoteJid, {
                text: `╭─⌈ 🐺 *BLOCK* ⌋\n│\n├─⊷ */block <number>*\n│  └⊷ e.g. /block 254712345678\n├─⊷ *Tag a user* or *reply* to their message\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
            }, { quoted: msg });
        }

        // 5. DM with no target — block the DM contact
        if (!rawTarget && !isGroup) rawTarget = key.remoteJid;

        if (!rawTarget || rawTarget.endsWith('@g.us') || rawTarget.endsWith('@newsletter')) {
            return sock.sendMessage(key.remoteJid, {
                text: '⚠️ Cannot block a group or newsletter. Provide a number: */block 254712345678*',
            }, { quoted: msg });
        }

        // Resolve using the same comprehensive logic as getjid
        const target = await resolveJid(sock, rawTarget);
        console.log(`[BLOCK] rawTarget=${rawTarget} → resolved=${target}`);

        if (!target || target.endsWith('@lid')) {
            return sock.sendMessage(key.remoteJid, {
                text: `⚠️ Could not resolve this user to a phone number.\n\nTry using the number directly:\n*/block 254712345678*`,
            }, { quoted: msg });
        }

        // Try phone JID first, raw JID as last-resort fallback only if different
        const attempts = [target];
        if (rawTarget !== target && !rawTarget.endsWith('@lid')) attempts.push(rawTarget);

        let blocked = false;
        let lastErr = null;

        for (const jid of attempts) {
            try {
                console.log(`[BLOCK] Attempting: ${jid}`);
                await tryBlock(sock, jid);
                blocked = true;
                console.log(`[BLOCK] Success: ${jid}`);
                break;
            } catch (err) {
                console.error(`[BLOCK] Failed (${jid}):`, err?.message || err);
                lastErr = err;
            }
        }

        await delay(500);
        if (blocked) {
            const num = target.split('@')[0];
            await sock.sendMessage(key.remoteJid, {
                text: `🕸️ *Blocked successfully.*\n\n❌ +${num} has been blocked.`,
            }, { quoted: msg });
        } else {
            await sock.sendMessage(key.remoteJid, {
                text: `⚠️ Block failed.\n\n_Error: ${lastErr?.message || 'Unknown'}_\n\nMake sure the number exists on WhatsApp.`,
            }, { quoted: msg });
        }
    },
};
