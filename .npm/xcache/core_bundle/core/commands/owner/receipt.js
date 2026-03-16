import { getOwnerName } from '../../lib/menuHelper.js';
export default {
    name: 'receipt',
    alias: ['readreceipt', 'readreceipts', 'bluetics', 'bluetick'],
    category: 'owner',
    description: 'Toggle WhatsApp read receipts on/off',
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

            if (action === 'on' || action === 'enable') {
                await sock.updateReadReceiptsPrivacy('all');
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *READ RECEIPTS* ⌋\n│\n├─⊷ *Status:* 🟢 ON\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } }); } catch {}

            } else if (action === 'off' || action === 'disable') {
                await sock.updateReadReceiptsPrivacy('none');
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 🔴 *READ RECEIPTS* ⌋\n│\n├─⊷ *Status:* 🔴 OFF\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '🔴', key: msg.key } }); } catch {}

            } else {
                let currentStatus = 'Unknown';
                try {
                    const privacy = await sock.fetchPrivacySettings(true);
                    const rr = privacy.readreceipts || privacy.readReceipts;
                    currentStatus = (rr === 'all' || rr === true) ? '🟢 ON' : '🔴 OFF';
                } catch {}

                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *READ RECEIPTS* ⌋\n│\n├─⊷ *${PREFIX}receipt on*\n│  └⊷ Enable receipts\n├─⊷ *${PREFIX}receipt off*\n│  └⊷ Disable receipts\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '📋', key: msg.key } }); } catch {}
            }

        } catch (error) {
            console.error('[Receipt] Error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ *Failed to update read receipts*\n\n${error.message}\n\n💡 This feature requires Baileys support for privacy updates.`
            }, { quoted: msg });
            try { await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }); } catch {}
        }
    }
};
