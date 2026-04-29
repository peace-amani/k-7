import { getOwnerName } from '../../lib/menuHelper.js';

const BRAND = () => getOwnerName().toUpperCase();

export default {
    name: 'listadmins',
    alias: ['admins', 'getadmins', 'adminlist'],
    description: 'List all admins in a group. Run inside a group, or pass a group JID from anywhere.',
    category: 'group',

    execute: async (sock, msg, args, PREFIX) => {
        const chatId = msg.key.remoteJid;
        const isInGroup = chatId.endsWith('@g.us');
        const usedJid = !!args[0];

        // Resolve target group JID
        let targetJid = null;

        if (args[0]) {
            let input = args[0].trim();
            if (!input.endsWith('@g.us')) {
                input = input.replace(/[^0-9\-]/g, '');
                input = `${input}@g.us`;
            }
            targetJid = input;
        } else if (isInGroup) {
            targetJid = chatId;
        } else {
            return sock.sendMessage(chatId, {
                text:
                    `╭⌈ ❌ *NO GROUP SPECIFIED* ⌋\n` +
                    `├⊷ Run inside a group, or provide a JID:\n` +
                    `├⊷ *${PREFIX}listadmins 1234567890-1234567890@g.us*\n` +
                    `╰⊷ *Powered by ${BRAND()} TECH*`
            }, { quoted: msg });
        }

        let groupMeta;
        try {
            groupMeta = await sock.groupMetadata(targetJid);
        } catch {
            return sock.sendMessage(chatId, {
                text: `❌ Could not fetch group info. Make sure the bot is a member of that group and the JID is correct.`
            }, { quoted: msg });
        }

        const participants = groupMeta.participants || [];
        const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
        const groupName = groupMeta.subject || targetJid;
        const totalMembers = participants.length;

        if (admins.length === 0) {
            return sock.sendMessage(chatId, {
                text:
                    `╭⌈ 👑 *GROUP ADMINS* ⌋\n` +
                    `├⊷ Group : *${groupName}*\n` +
                    `├⊷ ⚠️ No admins found in this group.\n` +
                    `╰⊷ *Powered by ${BRAND()} TECH*`
            }, { quoted: msg });
        }

        const superAdmins = admins.filter(a => a.admin === 'superadmin');
        const regularAdmins = admins.filter(a => a.admin === 'admin');
        const mentionIds = admins.map(a => a.id);

        let text =
            `╭⌈ 👑 *GROUP ADMINS* ⌋\n` +
            `├⊷ Group : *${groupName}*\n` +
            `├⊷ Admins : *${admins.length}* of ${totalMembers} members\n` +
            `│\n`;

        // Super Admins section
        if (superAdmins.length > 0) {
            text += `├⊷ ⭐ *SUPER ADMIN*\n`;
            superAdmins.forEach((admin, index) => {
                const num = String(index + 1).padStart(2, '0');
                text += `│   ${num}. @${admin.id.split('@')[0]}\n`;
            });
            text += `│\n`;
        }

        // Admins section
        if (regularAdmins.length > 0) {
            text += `├⊷ 🔰 *ADMINS* (${regularAdmins.length})\n`;
            regularAdmins.forEach((admin, index) => {
                const num = String(index + 1).padStart(2, '0');
                text += `│   ${num}. @${admin.id.split('@')[0]}\n`;
            });
            text += `│\n`;
        }

        text +=
            (!usedJid ? `├⊷ 💡 Tip: Use *${PREFIX}listadmins <JID>* to check any group from anywhere\n` : '') +
            `╰⊷ *Powered by ${BRAND()} TECH*`;

        // Try to send with group picture, fall back to text-only
        let ppUrl = null;
        try {
            ppUrl = await sock.profilePictureUrl(targetJid, 'image');
        } catch {}

        if (ppUrl) {
            try {
                const res = await fetch(ppUrl);
                const buf = await res.arrayBuffer();
                return sock.sendMessage(chatId, {
                    image: Buffer.from(buf),
                    caption: text,
                    mentions: mentionIds
                }, { quoted: msg });
            } catch {}
        }

        return sock.sendMessage(chatId, {
            text,
            mentions: mentionIds
        }, { quoted: msg });
    },
};
