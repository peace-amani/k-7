import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { imageEdit } from '../../lib/nvidia.js';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: 'fluxedit',
    description: 'Edit images with FLUX.1 Kontext — reply to an image and describe the change',
    category: 'ai',
    aliases: ['fedit', 'editimg', 'imgedit', 'aiimg', 'fluxkontext'],
    usage: 'fluxedit <edit instruction> — reply to any image',

    async execute(sock, m, args, PREFIX) {
        const jid    = m.key.remoteJid;
        const owner  = getOwnerName().toUpperCase();
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedImg = quoted?.imageMessage;
        const prompt = args.join(' ').trim();

        if (!quotedImg || !prompt) {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 🎨 *FLUX IMAGE EDITOR* ⌋\n├─⊷ *${PREFIX}fluxedit <instruction>*\n│  └⊷ Reply to any image with your edit\n│  └⊷ _e.g. "make the sky purple"_\n╰⊷ *Powered by ${owner} TECH*`
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '🎨', key: m.key } });

        try {
            const buf = await downloadMediaMessage(
                { key: m.key, message: quoted },
                'buffer', {},
                { reuploadRequest: sock.updateMediaMessage, logger: console }
            );
            if (!buf || buf.length === 0) throw new Error('Could not download image from WhatsApp');

            console.log(`[FLUXEDIT] Editing image (${(buf.length / 1024).toFixed(1)} KB), prompt: "${prompt}"`);

            const resultBuf = await imageEdit(prompt, buf, {
                model:       'black-forest-labs/flux.1-kontext-dev',
                timeoutMs:   180000
            });

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
            await sock.sendMessage(jid, {
                image:   resultBuf,
                caption: `🎨 *FLUX IMAGE EDITOR*\n━━━━━━━━━━━━━━━━━\n✏️ _"${prompt}"_\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by ${owner} TECH_`
            }, { quoted: m });

        } catch (err) {
            console.error('[FLUXEDIT] Error:', err.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, {
                text: `❌ *Flux Edit Error*\n\n${err.message}\n\nPlease try again.`
            }, { quoted: m });
        }
    }
};
