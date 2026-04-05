import { getOwnerName } from '../../lib/menuHelper.js';

const SEND_DELAY = 1500; // ms between each send to avoid spam detection

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getGroupJids(sock) {
    const groups = await sock.groupFetchAllParticipating();
    return Object.keys(groups || {});
}

function getChatJids(sock) {
    const contacts = sock.store?.contacts || {};
    return Object.keys(contacts).filter(
        jid => jid.endsWith('@s.whatsapp.net') && jid !== 'status@broadcast'
    );
}

export default {
    name:        'broadcast',
    alias:       ['bc', 'bcast', 'sendall'],
    category:    'owner',
    ownerOnly:   true,
    description: 'Broadcast a text message to all groups or chats',

    async execute(sock, msg, args, PREFIX) {
        const chatId = msg.key.remoteJid;
        const reply  = (text) => sock.sendMessage(chatId, { text }, { quoted: msg });

        const HELP =
            `╭─⌈ *BROADCAST* ⌋\n` +
            `│\n` +
            `├─⊷ *Usage:*\n` +
            `│  ${PREFIX}broadcast groups <message>\n` +
            `│  ${PREFIX}broadcast chats <message>\n` +
            `│  ${PREFIX}broadcast all <message>\n` +
            `│\n` +
            `├─⊷ *Targets:*\n` +
            `│  • groups — all groups bot is in\n` +
            `│  • chats  — all private/DM chats\n` +
            `│  • all    — groups + chats\n` +
            `│\n` +
            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;

        if (args.length < 2) return reply(HELP);

        const target  = args[0].toLowerCase();
        const message = args.slice(1).join(' ').trim();

        if (!['groups', 'chats', 'all'].includes(target)) return reply(HELP);
        if (!message) return reply(`❌ Message cannot be empty.\n\n${HELP}`);

        await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

        // ── Collect targets ────────────────────────────────────────────────────
        let jids = [];
        try {
            if (target === 'groups' || target === 'all') {
                const groupJids = await getGroupJids(sock);
                jids.push(...groupJids);
            }
            if (target === 'chats' || target === 'all') {
                const chatJids = getChatJids(sock);
                jids.push(...chatJids);
            }
        } catch (err) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return reply(`❌ Failed to fetch target list.\n\n_${err.message}_`);
        }

        // Remove own JID and the current chat
        const selfJid = sock.user?.id;
        jids = [...new Set(jids)].filter(j => j !== selfJid && j !== chatId);

        if (jids.length === 0) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return reply(`❌ No targets found for *${target}*.`);
        }

        // ── Broadcast with progress update ────────────────────────────────────
        const statusMsg = await sock.sendMessage(chatId, {
            text: `📡 *Broadcasting…*\n\n🎯 Target: *${target}*\n📬 Sending to *${jids.length}* chat(s)\n\n⏳ Please wait…`
        }, { quoted: msg });

        let sent = 0;
        let failed = 0;

        for (const jid of jids) {
            try {
                await sock.sendMessage(jid, { text: message });
                sent++;
            } catch {
                failed++;
            }
            await sleep(SEND_DELAY);
        }

        // ── Final report ───────────────────────────────────────────────────────
        const summary =
            `📡 *Broadcast Complete*\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎯 *Target:* ${target}\n` +
            `📬 *Total:*  ${jids.length}\n` +
            `✅ *Sent:*   ${sent}\n` +
            `❌ *Failed:* ${failed}\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `🐺 _${getOwnerName().toUpperCase()} TECH_`;

        try {
            await sock.sendMessage(chatId, { text: summary, edit: statusMsg.key });
        } catch {
            await reply(summary);
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
    }
};
