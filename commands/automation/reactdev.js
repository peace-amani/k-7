import { getPhoneFromLid } from '../../lib/sudo-store.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const DEV_NUMBERS = ['254703397679', '254713046497', '254733961184'];
const DEV_EMOJI = '🐺';

function extractNumber(jid) {
    if (!jid) return '';
    return jid.replace(/[:@].*/g, '');
}

function isDevJid(jid) {
    if (!jid) return false;
    const number = extractNumber(jid);
    if (DEV_NUMBERS.includes(number)) return true;
    if (jid.includes('@lid')) {
        const phone = getPhoneFromLid(number);
        if (phone && DEV_NUMBERS.includes(phone)) return true;
    }
    return false;
}

async function isBotAdminInGroup(sock, groupJid) {
    try {
        const meta = await sock.groupMetadata(groupJid);
        const botJid = sock.user?.id || '';
        const botNumber = extractNumber(botJid);
        const botParticipant = meta.participants.find(p => {
            const pNum = extractNumber(p.id);
            return pNum === botNumber || p.id === botJid;
        });
        return botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
    } catch {
        return false;
    }
}

async function isGroupAnnounceOnly(sock, groupJid) {
    try {
        const meta = await sock.groupMetadata(groupJid);
        return meta.announce === true;
    } catch {
        return false;
    }
}

export async function handleReactDev(sock, msg) {
    try {
        if (!msg?.key || !msg.message) return;

        // Never react to a reaction message — avoids echo loops
        if (msg.message.reactionMessage) return;

        const ts = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : 0;
        if (ts > 0 && Date.now() - ts > 30000) return;

        const remoteJid = msg.key.remoteJid || '';
        if (remoteJid === 'status@broadcast') return;

        if (msg.key.fromMe) return;

        const isGroup = remoteJid.endsWith('@g.us');

        let senderJid = '';
        if (isGroup) {
            senderJid = msg.key.participant || '';
        } else {
            senderJid = remoteJid;
        }

        if (!senderJid) return;
        if (!isDevJid(senderJid)) return;

        // For non-group chats, react directly
        if (!isGroup) {
            await sock.sendMessage(remoteJid, {
                react: { text: DEV_EMOJI, key: msg.key }
            });
            return;
        }

        // For groups: try to react directly first
        let reacted = false;
        try {
            await sock.sendMessage(remoteJid, {
                react: { text: DEV_EMOJI, key: msg.key }
            });
            reacted = true;
        } catch {}

        if (reacted) return;

        // Direct react failed — check if the group is admin-only and bot is admin
        const announceOnly = await isGroupAnnounceOnly(sock, remoteJid);
        if (!announceOnly) return;

        const botIsAdmin = await isBotAdminInGroup(sock, remoteJid);
        if (!botIsAdmin) return;

        // Temporarily open the group, react, then lock it back
        try {
            await sock.groupSettingUpdate(remoteJid, 'not_announcement');
            await new Promise(r => setTimeout(r, 500));
            await sock.sendMessage(remoteJid, {
                react: { text: DEV_EMOJI, key: msg.key }
            });
        } catch {}

        // Always restore announce mode regardless of whether react succeeded
        try {
            await sock.groupSettingUpdate(remoteJid, 'announcement');
        } catch {}

    } catch {}
}

export default {
    name: 'reactdev',
    alias: ['devreact'],
    category: 'automation',
    description: 'Auto-react to developer messages with a wolf emoji',
    ownerOnly: true,

    async execute(sock, msg, args) {
        const chatId = msg.key.remoteJid;
        const devList = DEV_NUMBERS.map(n => `│ • +${n}`).join('\n');
        return await sock.sendMessage(chatId, {
            text: `╭─⌈ 🐺 *REACT DEV* ⌋\n│\n│ Status: ✅ ALWAYS ACTIVE\n│ Emoji: ${DEV_EMOJI}\n│\n│ *Developers:*\n${devList}\n│\n│ _Auto-reacts to developer\n│ messages in all DMs & groups_\n│ _Works in admin-only groups too_\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
        });
    }
};
