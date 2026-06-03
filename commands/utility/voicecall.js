import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: 'voicecall',
    aliases: ['vcalllink', 'calllink', 'audiolink', 'callvoice'],
    description: 'Generate a WhatsApp voice call invite link',
    category: 'utility',

    async execute(sock, m, args, PREFIX) {
        const jid = m.key.remoteJid;
        try {
            await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

            const token = await sock.createCallLink('audio');
            if (!token) throw new Error('No token returned from WhatsApp');

            const url  = `https://call.whatsapp.com/voice/${token}`;
            const owner = getOwnerName().toUpperCase();

            const text =
                `╭─⌈ 📞 *VOICE CALL INVITE* ⌋\n` +
                `│\n` +
                `├─⊷ *Link:*\n` +
                `│  └⊷ ${url}\n` +
                `│\n` +
                `├─⊷ Tap the link to join the voice call\n` +
                `│  └⊷ Valid for 90 days\n` +
                `│\n` +
                `╰⊷ *Powered by ${owner} TECH*`;

            await sock.sendMessage(jid, { text }, { quoted: m });
            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

        } catch (err) {
            console.error('[VOICECALL]', err.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }).catch(() => {});
            await sock.sendMessage(jid, {
                text: `❌ *Failed to generate voice call link*\n\n*Error:* ${err.message}`
            }, { quoted: m });
        }
    }
};
