import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: 'groupadd',
    alias: ['groupaddprivacy', 'setgroupadd', 'whocanadd'],
    category: 'owner',
    description: 'Control who can add you to WhatsApp groups',
    ownerOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager } = extra;

        const isSudoUser = extra?.isSudo ? extra.isSudo() : false;
        if (!jidManager.isOwner(msg) && !isSudoUser) {
            return sock.sendMessage(chatId, {
                text: '❌ *Owner Only Command*'
            }, { quoted: msg });
        }

        const action = args[0]?.toLowerCase();

        try {
            await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

            if (action === 'everyone' || action === 'all') {
                await sock.updateGroupsAddPrivacy('all');
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 👥 *GROUP ADD PRIVACY* ⌋\n│\n├─⊷ *Set:* 🌍 Everyone\n│  └⊷ Anyone can add you to groups\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '🌍', key: msg.key } }); } catch {}

            } else if (action === 'contacts') {
                await sock.updateGroupsAddPrivacy('contacts');
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 👥 *GROUP ADD PRIVACY* ⌋\n│\n├─⊷ *Set:* 👥 Contacts Only\n│  └⊷ Only your contacts can add you to groups\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '👥', key: msg.key } }); } catch {}

            } else if (action === 'except') {
                await sock.updateGroupsAddPrivacy('contact_blacklist');
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 👥 *GROUP ADD PRIVACY* ⌋\n│\n├─⊷ *Set:* 🚫 Contacts Except...\n│  └⊷ Contacts except blacklisted ones can add you\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '🚫', key: msg.key } }); } catch {}

            } else if (action === 'none' || action === 'nobody' || action === 'off') {
                await sock.updateGroupsAddPrivacy('none');
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 👥 *GROUP ADD PRIVACY* ⌋\n│\n├─⊷ *Set:* 🔒 Nobody\n│  └⊷ No one can add you to groups directly\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '🔒', key: msg.key } }); } catch {}

            } else {
                let currentStatus = 'Unknown';
                try {
                    const privacy = await sock.fetchPrivacySettings(true);
                    const val = privacy.groupadd || privacy.groupAdd;
                    if (val === 'all') currentStatus = '🌍 Everyone';
                    else if (val === 'contacts') currentStatus = '👥 Contacts Only';
                    else if (val === 'contact_blacklist') currentStatus = '🚫 Contacts Except...';
                    else if (val === 'none') currentStatus = '🔒 Nobody';
                    else currentStatus = val || 'Unknown';
                } catch {}

                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 👥 *GROUP ADD PRIVACY* ⌋\n│\n` +
                          `├─⊷ *Current:* ${currentStatus}\n│\n` +
                          `├─⌈ ⚙️ *OPTIONS* ⌋\n│\n` +
                          `├─⊷ *${PREFIX}groupadd everyone*\n│  └⊷ 🌍 Anyone can add you\n` +
                          `├─⊷ *${PREFIX}groupadd contacts*\n│  └⊷ 👥 Only your contacts\n` +
                          `├─⊷ *${PREFIX}groupadd except*\n│  └⊷ 🚫 Contacts except blacklist\n` +
                          `├─⊷ *${PREFIX}groupadd nobody*\n│  └⊷ 🔒 No one can add you\n│\n` +
                          `╰───`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '📋', key: msg.key } }); } catch {}
            }

        } catch (error) {
            console.error('[GroupAdd] Error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ *Failed to update group add privacy*\n\n${error.message}`
            }, { quoted: msg });
            try { await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }); } catch {}
        }
    }
};
