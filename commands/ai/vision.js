import axios from 'axios';
import { downloadContentFromMessage, downloadMediaMessage } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';

const NVIDIA_VISION = 'https://apis.xwolf.space/api/nvidia/vision';
const API_KEY = process.env.XWOLF_NVIDIA_KEY || 'wxa_u_f5wfr2vez6';

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

async function uploadImage(buffer) {
    const FormData = (await import('form-data')).default;
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', buffer, { filename: `wolf_${Date.now()}.jpg`, contentType: 'image/jpeg' });
        const res = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: form.getHeaders(), timeout: 25000,
        });
        if (res.data?.includes('http')) return res.data.trim();
    } catch (e) {
        console.error('[VISION] catbox failed:', e.message);
    }
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('time', '24h');
        form.append('fileToUpload', buffer, { filename: `wolf_${Date.now()}.jpg`, contentType: 'image/jpeg' });
        const res = await axios.post('https://litterbox.catbox.moe/resources/internals/api.php', form, {
            headers: form.getHeaders(), timeout: 25000,
        });
        if (res.data?.includes('http')) return res.data.trim();
    } catch (e) {
        console.error('[VISION] litterbox failed:', e.message);
    }
    throw new Error('Image upload failed — try again or use a direct URL');
}

async function getImageBuffer(m, sock, jid) {
    if (m.message?.imageMessage) {
        return streamToBuffer(await downloadContentFromMessage(m.message.imageMessage, 'image'));
    }
    const ctx = m.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (quoted?.imageMessage) {
        return streamToBuffer(await downloadContentFromMessage(quoted.imageMessage, 'image'));
    }
    if (quoted && ctx?.stanzaId) {
        try {
            const buf = await downloadMediaMessage(
                { key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant }, message: quoted },
                'buffer', {},
                { logger: { level: 'silent' }, reuploadRequest: sock.updateMediaMessage }
            );
            if (buf && buf.length > 500) return buf;
        } catch (e) {
            console.error('[VISION] downloadMediaMessage failed:', e.message);
        }
    }
    return null;
}

export default {
    name: 'vision',
    description: 'Analyze images with NVIDIA Llama 3.2 Vision (11B)',
    category: 'ai',
    aliases: ['imgai', 'describe', 'whatisthis', 'imageai', 'nvision', 'visualai'],
    usage: 'vision [question] — reply to image or pass URL as argument',

    async execute(sock, m, args, PREFIX) {
        const jid = m.key.remoteJid;

        const urlArg = args.find(a => /^https?:\/\//i.test(a));
        const query  = args.filter(a => !/^https?:\/\//i.test(a)).join(' ').trim()
                    || 'Analyze this image and describe what you see in detail';

        let imageUrl    = urlArg || null;
        let imageBuffer = null;

        if (!imageUrl) {
            try { imageBuffer = await getImageBuffer(m, sock, jid); } catch (e) {
                console.error('[VISION] getImageBuffer error:', e.message);
            }
        }

        if (!imageUrl && (!imageBuffer || imageBuffer.length < 500)) {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 👁️ *NVIDIA VISION AI* ⌋\n│\n` +
                      `├─⊷ *Reply to image:*\n│  └⊷ \`${PREFIX}vision\`\n│\n` +
                      `├─⊷ *Use a URL:*\n│  └⊷ \`${PREFIX}vision https://image.url\`\n│\n` +
                      `├─⊷ *Ask a question:*\n│  └⊷ \`${PREFIX}vision what breed is this dog?\`\n│\n` +
                      `├─⊷ *Model:* Llama 3.2 11B Vision Instruct\n│\n` +
                      `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            if (imageBuffer && !imageUrl) {
                console.log('[VISION] Uploading image buffer...');
                imageUrl = await uploadImage(imageBuffer);
                console.log('[VISION] Uploaded to:', imageUrl);
            }

            console.log('[VISION] Calling NVIDIA vision API, query:', query, 'image:', imageUrl);
            const res = await axios.get(NVIDIA_VISION, {
                params: { key: API_KEY, q: query, image: imageUrl },
                timeout: 45000
            });
            console.log('[VISION] API response success:', res.data?.success, 'model:', res.data?.model);

            if (!res.data?.success || !res.data?.result) {
                throw new Error(res.data?.error || 'No result returned from API');
            }

            const result = res.data.result.trim();
            const model  = res.data.model || 'llama-3.2-11b-vision-instruct';

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
            await sock.sendMessage(jid, {
                text: `👁️ *NVIDIA VISION AI*\n━━━━━━━━━━━━━━━━━\n` +
                      `💭 *Query:* ${query}\n\n` +
                      `📋 *Analysis:*\n${result}\n` +
                      `━━━━━━━━━━━━━━━━━\n` +
                      `🤖 _${model}_\n` +
                      `🐺 _Powered by ${getOwnerName().toUpperCase()} TECH_`
            }, { quoted: m });

        } catch (err) {
            console.error('[VISION] Error:', err.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, {
                text: `❌ *Vision AI Error*\n\n${err.message}\n\n💡 Try a different image or URL.`
            }, { quoted: m });
        }
    }
};
