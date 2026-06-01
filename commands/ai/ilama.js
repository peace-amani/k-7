import axios from 'axios';
import { downloadContentFromMessage, downloadMediaMessage } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';

const LLAMA_FAST = 'https://apis.xwolf.space/api/nvidia/llama-fast';
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
        console.error('[ILAMA] catbox failed:', e.message);
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
        console.error('[ILAMA] litterbox failed:', e.message);
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
            console.error('[ILAMA] downloadMediaMessage failed:', e.message);
        }
    }
    return null;
}

export default {
    name: 'ilama',
    description: 'LLaMA Fast AI — instant responses with optional image analysis',
    category: 'ai',
    aliases: ['llama', 'llamaai', 'llamafast', 'fastllama'],
    usage: 'ilama [question] — optionally reply to an image or include an image URL',

    async execute(sock, m, args, PREFIX) {
        const jid = m.key.remoteJid;

        const urlArg = args.find(a => /^https?:\/\//i.test(a));
        const query  = args.filter(a => !/^https?:\/\//i.test(a)).join(' ').trim();

        let imageUrl    = urlArg || null;
        let imageBuffer = null;

        if (!imageUrl) {
            try { imageBuffer = await getImageBuffer(m, sock, jid); } catch (e) {
                console.error('[ILAMA] getImageBuffer error:', e.message);
            }
        }

        const hasImage = imageUrl || (imageBuffer && imageBuffer.length > 500);

        if (!query && !hasImage) {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 🦙 *LLAMA FAST AI* ⌋\n│\n` +
                      `├─⊷ *Text chat:*\n│  └⊷ \`${PREFIX}ilama <question>\`\n│\n` +
                      `├─⊷ *Image analysis:*\n│  └⊷ Reply to image + \`${PREFIX}ilama [question]\`\n│  └⊷ \`${PREFIX}ilama https://image.url [question]\`\n│\n` +
                      `├─⊷ *Model:* Llama 3.1 8B Instruct (Fast)\n│\n` +
                      `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            const effectiveQuery = query || 'Analyze this image and describe what you see in detail';

            if (imageBuffer && !imageUrl) {
                console.log('[ILAMA] Uploading image buffer...');
                imageUrl = await uploadImage(imageBuffer);
                console.log('[ILAMA] Uploaded to:', imageUrl);
            }

            const params = { key: API_KEY, q: effectiveQuery };
            if (imageUrl) params.image = imageUrl;

            console.log('[ILAMA] Calling llama-fast API, query:', effectiveQuery, imageUrl ? 'with image' : 'text-only');
            const res = await axios.get(LLAMA_FAST, { params, timeout: 45000 });
            console.log('[ILAMA] API response success:', res.data?.success, 'model:', res.data?.model);

            if (!res.data?.success || !res.data?.result) {
                throw new Error(res.data?.error || 'No result returned from API');
            }

            let reply = res.data.result.trim();
            if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

            const model = res.data.model || 'llama-3.1-8b-instruct';

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
            await sock.sendMessage(jid, {
                text: `🦙 *LLAMA FAST AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🤖 _${model}_\n🐺 _Powered by ${getOwnerName().toUpperCase()} TECH_`
            }, { quoted: m });

        } catch (err) {
            console.error('[ILAMA] Error:', err.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, {
                text: `❌ *LLaMA Fast Error*\n\n${err.message}\n\nPlease try again later.`
            }, { quoted: m });
        }
    }
};
