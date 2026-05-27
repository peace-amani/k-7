import axios from 'axios';
import { downloadContentFromMessage, downloadMediaMessage } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function uploadToCatbox(buffer) {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, {
        filename: `image_${Date.now()}.jpg`,
        contentType: 'image/jpeg'
    });

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: { ...form.getHeaders(), 'User-Agent': 'WolfBot/1.0' },
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024,
    });

    const result = response.data;
    if (!result || !result.includes('http')) {
        throw new Error('Upload failed');
    }
    return result.trim();
}

async function uploadToTmpFiles(buffer) {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', buffer, {
        filename: `image_${Date.now()}.jpg`,
        contentType: 'image/jpeg'
    });

    const response = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
        headers: { ...form.getHeaders() },
        timeout: 30000,
    });

    if (response.data?.data?.url) {
        return response.data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    }
    throw new Error('tmpfiles upload failed');
}

export default {
    name: 'vision',
    description: 'AI-powered image analysis using Google Gemini Vision',
    category: 'ai',
    aliases: ['imgai', 'describe', 'whatisthis', 'geminivision', 'imganalyze', 'imageai', 'gvision', 'visual'],
    usage: 'vision [question] - Reply to an image or send image with caption',

    async execute(sock, m, args, PREFIX, extra) {
        const jid = m.key.remoteJid;

        if (args.length > 0 && args[0].toLowerCase() === 'help') {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 👁️ *VISION AI* ⌋\n│\n├─⊷ *${PREFIX}vision <question>*\n│  └⊷ Reply to image to analyze it\n│\n├─⊷ *${PREFIX}vision describe*\n│  └⊷ Send image with caption to describe\n│\n├─⊷ *${PREFIX}vision*\n│  └⊷ Reply to image for auto-analyze\n│\n├─⊷ 📁 *Supported:* JPG, PNG, GIF, WebP\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });
        }

        let imageBuffer = null;
        let imageSource = '';

        try {
            if (m.message?.imageMessage) {
                const stream = await downloadContentFromMessage(m.message.imageMessage, 'image');
                imageBuffer = await streamToBuffer(stream);
                imageSource = 'direct';
            }
            else if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;

                if (quoted.imageMessage) {
                    const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
                    imageBuffer = await streamToBuffer(stream);
                    imageSource = 'quoted';
                }
                else if (quoted.stickerMessage) {
                    const stream = await downloadContentFromMessage(quoted.stickerMessage, 'sticker');
                    imageBuffer = await streamToBuffer(stream);
                    imageSource = 'sticker';
                }
                else if (quoted.documentMessage?.mimetype?.startsWith('image/')) {
                    const stream = await downloadContentFromMessage(quoted.documentMessage, 'document');
                    imageBuffer = await streamToBuffer(stream);
                    imageSource = 'document';
                }
                else if (quoted.viewOnceMessageV2?.message?.imageMessage || quoted.viewOnceMessage?.message?.imageMessage) {
                    const voMsg = quoted.viewOnceMessageV2?.message?.imageMessage || quoted.viewOnceMessage?.message?.imageMessage;
                    const stream = await downloadContentFromMessage(voMsg, 'image');
                    imageBuffer = await streamToBuffer(stream);
                    imageSource = 'viewonce';
                }
            }

            if (!imageBuffer && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                try {
                    const quotedMsg = m.message.extendedTextMessage.contextInfo.quotedMessage;
                    const quotedKey = {
                        remoteJid: jid,
                        id: m.message.extendedTextMessage.contextInfo.stanzaId,
                        participant: m.message.extendedTextMessage.contextInfo.participant
                    };
                    const mockMsg = { key: quotedKey, message: quotedMsg };
                    imageBuffer = await downloadMediaMessage(mockMsg, 'buffer', {}, {
                        logger: { level: 'silent' },
                        reuploadRequest: sock.updateMediaMessage
                    });
                    if (imageBuffer && imageBuffer.length > 1000) {
                        imageSource = 'fallback';
                    } else {
                        imageBuffer = null;
                    }
                } catch (dlErr) {}
            }
        } catch (dlError) {
            console.error('👁️ Download error:', dlError.message);
        }

        if (!imageBuffer || imageBuffer.length < 1000) {
            return sock.sendMessage(jid, {
                text: `❌ *No image found!*\n\n` +
                    `💡 *How to use:*\n` +
                    `1. Reply to an image with \`${PREFIX}vision\`\n` +
                    `2. Send image with caption \`${PREFIX}vision\`\n` +
                    `3. Reply to a sticker with \`${PREFIX}vision\`\n\n` +
                    `📌 Make sure you're replying to an *image* message!`
            }, { quoted: m });
        }

        let query = args.join(' ').trim();
        if (!query) query = 'Analyze this image and describe what you see in detail';

        const imageSizeMB = (imageBuffer.length / 1024 / 1024).toFixed(2);

        try {
            await sock.sendMessage(jid, { react: { text: '🔍', key: m.key } });
        } catch {}

        const statusMsg = await sock.sendMessage(jid, {
            text: `👁️ *Analyzing image...*\n📊 Size: ${imageSizeMB}MB\n💭 "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`
        }, { quoted: m });

        try {
            let uploadedUrl = '';
            try {
                uploadedUrl = await uploadToCatbox(imageBuffer);
            } catch {
                try {
                    uploadedUrl = await uploadToTmpFiles(imageBuffer);
                } catch {}
            }

            let analysisResult = '';

            if (uploadedUrl) {
                const apis = [
                    { url: `https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(query)}&url=${encodeURIComponent(uploadedUrl)}`, extract: (d) => d?.answer || d?.result || d?.response },
                    { url: `https://apiskeith.top/ai/gemini?q=${encodeURIComponent(query)}&url=${encodeURIComponent(uploadedUrl)}`, extract: (d) => d?.result || d?.response },
                    { url: `https://api.ootaizumi.web.id/ai/gptnano?prompt=${encodeURIComponent(query)}&imageUrl=${encodeURIComponent(uploadedUrl)}`, extract: (d) => d?.result || d?.response || d?.text },
                    { url: `https://api.nexoracle.com/ai/gemini-vision?apikey=free&url=${encodeURIComponent(uploadedUrl)}&prompt=${encodeURIComponent(query)}`, extract: (d) => d?.result || d?.response },
                ];

                for (const api of apis) {
                    try {
                        const resp = await axios.get(api.url, { timeout: 45000 });
                        const result = api.extract(resp.data);
                        if (result && typeof result === 'string' && result.length > 10) {
                            analysisResult = result;
                            break;
                        }
                    } catch {}
                }
            }

            if (!analysisResult) {
                const base64Image = imageBuffer.toString('base64');
                const base64Apis = [
                    {
                        url: 'https://gemini-proxy-production.up.railway.app/gemini-pro-vision',
                        method: 'POST',
                        data: { image: base64Image, prompt: query, mime_type: 'image/jpeg' },
                        extract: (d) => d?.result || d?.response || d?.text
                    },
                ];

                for (const api of base64Apis) {
                    try {
                        const resp = await axios.post(api.url, api.data, {
                            timeout: 45000,
                            headers: { 'Content-Type': 'application/json' }
                        });
                        const result = api.extract(resp.data);
                        if (result && typeof result === 'string' && result.length > 10) {
                            analysisResult = result;
                            break;
                        }
                    } catch {}
                }
            }

            if (!analysisResult) {
                throw new Error('All vision APIs failed. Please try again later.');
            }

            const resultText = `👁️ *VISION ANALYSIS*\n\n` +
                `💭 *Question:* "${query}"\n\n` +
                `📋 *Result:*\n${analysisResult.trim()}\n\n` +
                `📊 Size: ${imageSizeMB}MB | Source: ${imageSource}`;

            await sock.sendMessage(jid, { text: resultText, edit: statusMsg.key });
            try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch {}

        } catch (error) {
            console.error('❌ Vision error:', error.message);
            await sock.sendMessage(jid, {
                text: `❌ *Vision Analysis Failed*\n\n${error.message}\n\n💡 Try again or use a different image.`,
                edit: statusMsg.key
            });
            try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch {}
        }
    }
};
