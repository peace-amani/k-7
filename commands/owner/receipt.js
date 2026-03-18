import { getOwnerName } from '../../lib/menuHelper.js';
import supabase from '../../lib/database.js';

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
                await supabase.setConfig('read_receipts_pref', { mode: 'all' }).catch(() => {});
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *READ RECEIPTS* ⌋\n│\n├─⊷ *Status:* 🟢 ON\n├─⊷ *Saved:* ✅ Persists across restarts\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } }); } catch {}

            } else if (action === 'off' || action === 'disable') {
                await sock.updateReadReceiptsPrivacy('none');
                await supabase.setConfig('read_receipts_pref', { mode: 'none' }).catch(() => {});
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 🔴 *READ RECEIPTS* ⌋\n│\n├─⊷ *Status:* 🔴 OFF\n├─⊷ *Saved:* ✅ Persists across restarts\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '🔴', key: msg.key } }); } catch {}

            } else {
                let currentStatus = 'Unknown';
                let savedPref = null;
                try {
                    const privacy = await sock.fetchPrivacySettings(true);
                    const rr = privacy.readreceipts || privacy.readReceipts;
                    currentStatus = (rr === 'all' || rr === true) ? '🟢 ON' : '🔴 OFF';
                } catch {}
                try {
                    savedPref = await supabase.getConfig('read_receipts_pref', null);
                } catch {}

                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 📋 *READ RECEIPTS* ⌋\n│\n├─⊷ *Current:* ${currentStatus}\n├─⊷ *Saved pref:* ${savedPref?.mode ? (savedPref.mode === 'all' ? '🟢 ON' : '🔴 OFF') : '⚪ Not set'}\n│\n├─⊷ *${PREFIX}receipt on*\n│  └⊷ Enable receipts\n├─⊷ *${PREFIX}receipt off*\n│  └⊷ Disable receipts\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                try { await sock.sendMessage(chatId, { react: { text: '📋', key: msg.key } }); } catch {}
            }

        } catch (error) {
            console.error('[Receipt] Error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ *Failed to update read receipts*\n\n${error.message}`
            }, { quoted: msg });
            try { await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }); } catch {}
        }
    }
};
