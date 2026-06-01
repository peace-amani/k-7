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
    // Try catbox first
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', buffer, { filename: `wolf_${Date.now()}.jpg`, contentType: 'image/jpeg' });
        const res = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: form.getHeaders(), timeout: 25000,
        });
        if (res.data?.includes('http')) return res.data.trim();
    } catch {}
    // Fallback: litterbox (24h temp)
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('time', '24h');
        form.append('fileToUpload', buffer, { filename: `wolf_${Date.now()}.jpg`, contentType: 'image/jpeg' });
        const res = await axios.post('https://litterbox.catbox.moe/resources/internals/api.php', form, {
            headers: form.getHeaders(), timeout: 25000,
        });
        if (res.data?.includes('http')) return res.data.trim();
    } catch {}
    throw new Error('Image upload failed — try again or use a direct URL');
}

async function getImageBuffer(m, sock, jid) {
    if (m.message?.imageMessage) {
        return streamToBuffer(await downloadContentFromMessage(m.message.imageMessage, 'image'));
    }
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.imageMessage) {
        return streamToBuffer(await downloadContentFromMessage(quoted.imageMessage, 'image'));
    }
    if (quoted) {
        try {
            const buf = await downloadMediaMessage(
                {
                    key: {
                        remoteJid: jid,
                        id: m.message.extendedTextMessage.contextInfo.stanzaId,
                        participant: m.message.extendedTextMessage.contextInfo.participant
                    },
                    message: quoted
                },
                'buffer', {},
                { logger: { level: 'silent' }, reuploadRequest: sock.updateMediaMessage }
            );
            if (buf && buf.length > 500) return buf;
        } catch {}
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
            try { imageBuffer = await getImageBuffer(m, sock, jid); } catch {}
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

        await sock.sendMessage(jid, { react: { text: '🔍', key: m.key } });
        const status = await sock.sendMessage(jid, {
            text: `👁️ *NVIDIA Vision AI*\n⏳ ${imageBuffer ? 'Uploading image...' : 'Analyzing image from URL...'}`
        }, { quoted: m });

        try {
            if (imageBuffer && !imageUrl) {
                await sock.sendMessage(jid, { text: `👁️ *NVIDIA Vision AI*\n📤 Uploading image...`, edit: status.key });
                imageUrl = await uploadImage(imageBuffer);
            }

            await sock.sendMessage(jid, { text: `👁️ *NVIDIA Vision AI*\n🧠 Analyzing...`, edit: status.key });

            const res = await axios.get(NVIDIA_VISION, {
                params: { key: API_KEY, q: query, image: imageUrl },
                timeout: 45000
            });

            if (!res.data?.success || !res.data?.result) {
                throw new Error(res.data?.error || 'No result returned from API');
            }

            const result = res.data.result.trim();
            const model  = res.data.model || 'llama-3.2-11b-vision-instruct';

            await sock.sendMessage(jid, {
                text: `👁️ *NVIDIA VISION AI*\n━━━━━━━━━━━━━━━━━\n` +
                      `💭 *Query:* ${query}\n\n` +
                      `📋 *Analysis:*\n${result}\n` +
                      `━━━━━━━━━━━━━━━━━\n` +
                      `🤖 _${model}_\n` +
                      `🐺 _Powered by ${getOwnerName().toUpperCase()} TECH_`,
                edit: status.key
            });
            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

        } catch (err) {
            console.error('[VISION] Error:', err.message);
            await sock.sendMessage(jid, {
                text: `❌ *Vision AI Error*\n\n${err.message}\n\n💡 Try a different image or URL.`,
                edit: status.key
            });
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        }
    }
};
