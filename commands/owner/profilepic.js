import { getOwnerName } from '../../lib/menuHelper.js';
export default {
    name: 'profilepic',
    alias: ['pprivacy', 'dpprivacy', 'profilepicprivacy', 'picprivacy'],
    category: 'owner',
    description: 'Toggle who can see your profile picture',
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
                await sock.updateProfilePicturePrivacy('all');
                await sock.sendMessage(chatId, {
                    text:
                        `╭─⌈ 🖼️ *PROFILE PIC PRIVACY* ⌋\n` +
                        `│\n` +
                        `│ ✧ *Visibility:* 🌍 Everyone\n` +
                        `│\n` +
                        `│ Anyone can see your\n` +
                        `│ profile picture\n` +
                        `│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '🌍', key: msg.key } }); } catch {}

            } else if (action === 'contacts') {
                await sock.updateProfilePicturePrivacy('contacts');
                await sock.sendMessage(chatId, {
                    text:
                        `╭─⌈ 🖼️ *PROFILE PIC PRIVACY* ⌋\n` +
                        `│\n` +
                        `│ ✧ *Visibility:* 👥 Contacts Only\n` +
                        `│\n` +
                        `│ Only your contacts can\n` +
                        `│ see your profile picture\n` +
                        `│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '👥', key: msg.key } }); } catch {}

            } else if (action === 'except') {
                const number = args[1]?.replace(/[^0-9]/g, '');
                if (!number) {
                    return sock.sendMessage(chatId, {
                        text:
                            `╭─⌈ 🖼️ *PROFILE PIC PRIVACY* ⌋\n` +
                            `│\n` +
                            `│ ❌ Provide a number to exclude\n` +
                            `│\n` +
                            `│ • \`${PREFIX}profilepic except 2547XXXXXXXX\`\n` +
                            `│\n` +
                            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                    }, { quoted: msg });
                }
                await sock.updateProfilePicturePrivacy('contact_blacklist');
                await sock.sendMessage(chatId, {
                    text:
                        `╭─⌈ 🖼️ *PROFILE PIC PRIVACY* ⌋\n` +
                        `│\n` +
                        `│ ✧ *Visibility:* 🚫 Everyone Except\n` +
                        `│ ✧ *Excluded:* +${number}\n` +
                        `│\n` +
                        `│ Everyone can see your DP\n` +
                        `│ except the excluded user\n` +
                        `│\n` +
                        `│ ⚠️ Full blacklist management\n` +
                        `│ requires WhatsApp app settings\n` +
                        `│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '🚫', key: msg.key } }); } catch {}

            } else if (action === 'none' || action === 'nobody') {
                await sock.updateProfilePicturePrivacy('none');
                await sock.sendMessage(chatId, {
                    text:
                        `╭─⌈ 🖼️ *PROFILE PIC PRIVACY* ⌋\n` +
                        `│\n` +
                        `│ ✧ *Visibility:* 🔒 Nobody\n` +
                        `│\n` +
                        `│ No one can see your\n` +
                        `│ profile picture\n` +
                        `│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '🔒', key: msg.key } }); } catch {}

            } else {
                let currentStatus = 'Unknown';
                try {
                    const privacy = await sock.fetchPrivacySettings(true);
                    const pp = privacy.profile || privacy.profilePicture;
                    if (pp === 'all') currentStatus = '🌍 Everyone';
                    else if (pp === 'contacts') currentStatus = '👥 Contacts';
                    else if (pp === 'contact_blacklist') currentStatus = '🚫 Everyone Except...';
                    else if (pp === 'none') currentStatus = '🔒 Nobody';
                    else currentStatus = pp || 'Unknown';
                } catch {}

                await sock.sendMessage(chatId, {
                    text:
                        `╭─⌈ 🖼️ *PROFILE PIC PRIVACY* ⌋\n` +
                        `│\n` +
                        `│ ✧ *Current:* ${currentStatus}\n` +
                        `│\n` +
                        `│ *Usage:*\n` +
                        `│ • \`${PREFIX}profilepic everyone\`\n` +
                        `│ • \`${PREFIX}profilepic contacts\`\n` +
                        `│ • \`${PREFIX}profilepic except <number>\`\n` +
                        `│ • \`${PREFIX}profilepic nobody\`\n` +
                        `│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '📋', key: msg.key } }); } catch {}
            }

        } catch (error) {
            console.error('[ProfilePic] Error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ *Failed to update profile picture privacy*\n\n${error.message}`
            }, { quoted: msg });
            try { await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }); } catch {}
        }
    }
};
