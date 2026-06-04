import { downloadContentFromMessage, generateWAMessageContent, generateWAMessageFromContent } from '@whiskeysockets/baileys';
import crypto from 'crypto';
import { PassThrough } from 'stream';
import { getOwnerName } from '../../lib/menuHelper.js';

async function toVN(inputBuffer) {
    return new Promise((resolve, reject) => {
        try {
            import('fluent-ffmpeg').then(ffmpeg => {
                const inStream = new PassThrough();
                inStream.end(inputBuffer);
                const outStream = new PassThrough();
                const chunks = [];

                ffmpeg.default(inStream)
                    .noVideo()
                    .audioCodec("libopus")
                    .format("ogg")
                    .audioBitrate("48k")
                    .audioChannels(1)
                    .audioFrequency(48000)
                    .on("error", reject)
                    .on("end", () => resolve(Buffer.concat(chunks)))
                    .pipe(outStream, { end: true });

                outStream.on("data", chunk => chunks.push(chunk));
            }).catch(() => resolve(inputBuffer));
        } catch {
            resolve(inputBuffer);
        }
    });
}

async function downloadToBuffer(message, type) {
    const stream = await downloadContentFromMessage(message, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

async function buildPayloadFromQuoted(quotedMessage) {
    if (quotedMessage.videoMessage) {
        const buffer = await downloadToBuffer(quotedMessage.videoMessage, 'video');
        return {
            video: buffer,
            caption: quotedMessage.videoMessage.caption || '',
            gifPlayback: quotedMessage.videoMessage.gifPlayback || false,
            mimetype: quotedMessage.videoMessage.mimetype || 'video/mp4'
        };
    }
    if (quotedMessage.imageMessage) {
        const buffer = await downloadToBuffer(quotedMessage.imageMessage, 'image');
        return {
            image: buffer,
            caption: quotedMessage.imageMessage.caption || ''
        };
    }
    if (quotedMessage.audioMessage) {
        const buffer = await downloadToBuffer(quotedMessage.audioMessage, 'audio');
        if (quotedMessage.audioMessage.ptt) {
            try {
                const audioVn = await toVN(buffer);
                return { audio: audioVn, mimetype: "audio/ogg; codecs=opus", ptt: true };
            } catch {
                return { audio: buffer, mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg', ptt: true };
            }
        }
        return { audio: buffer, mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg', ptt: false };
    }
    if (quotedMessage.stickerMessage) {
        const buffer = await downloadToBuffer(quotedMessage.stickerMessage, 'sticker');
        return { sticker: buffer, mimetype: quotedMessage.stickerMessage.mimetype || 'image/webp' };
    }
    if (quotedMessage.conversation || quotedMessage.extendedTextMessage?.text) {
        const textContent = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '';
        return { text: textContent };
    }
    return null;
}

function detectMediaType(quotedMessage) {
    if (!quotedMessage) return 'Text';
    if (quotedMessage.videoMessage) return 'Video';
    if (quotedMessage.imageMessage) return 'Image';
    if (quotedMessage.audioMessage) return 'Audio';
    if (quotedMessage.stickerMessage) return 'Sticker';
    return 'Text';
}

async function sendGroupStatus(conn, jid, content) {
    const inside = await generateWAMessageContent(content, { upload: conn.waUploadToServer });
    const messageSecret = crypto.randomBytes(32);
    const m = generateWAMessageFromContent(jid, {
        messageContextInfo: { messageSecret },
        groupStatusMessageV2: { message: { ...inside, messageContextInfo: { messageSecret } } }
    }, {});
    await conn.relayMessage(jid, m.message, { messageId: m.key.id });
    return m;
}

function stripCommand(messageText) {
    return messageText.replace(/^[^a-zA-Z0-9]?(togstatus|swgc|groupstatus|tosgroup|gs|gstatus|togroupstatus)\s*/i, '').trim();
}

export default {
    name: 'togstatus',
    aliases: ['swgc', 'groupstatus', 'tosgroup', 'gs', 'gstatus', 'togroupstatus'],
    description: 'Send group status updates (text, images, videos, audio, stickers)',
    category: 'group',
    adminOnly: false,

    async execute(sock, m, args, PREFIX, extra) {
        try {
            const jid = m.key.remoteJid;

            if (!jid.endsWith('@g.us')) {
                return sock.sendMessage(jid, {
                    text: '❌ This command only works in groups!'
                }, { quoted: m });
            }

            const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
            const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const textAfterCommand = stripCommand(messageText);

            if (!quotedMessage && !textAfterCommand && !messageText.trim()) {
                return sock.sendMessage(jid, {
                    text: `╭─⌈ 💡 *GROUP STATUS* ⌋\n│\n├─⊷ *${PREFIX}togstatus* (reply)\n│  └⊷ Reply to media/text\n├─⊷ *${PREFIX}togstatus Your text here*\n│  └⊷ Post text status\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: m });
            }

            let payload = null;
            let mediaType = 'Text';

            if (quotedMessage) {
                mediaType = detectMediaType(quotedMessage);
                payload = await buildPayloadFromQuoted(quotedMessage);

                if (payload && (payload.video || payload.image) && textAfterCommand) {
                    payload.caption = textAfterCommand;
                }
            }
            else if (textAfterCommand) {
                mediaType = 'Text';
                payload = { text: textAfterCommand };
            }
            else {
                return sock.sendMessage(jid, {
                    text: `╭─⌈ 💡 *GROUP STATUS* ⌋\n│\n├─⊷ *${PREFIX}togstatus Your text*\n│  └⊷ Text or reply media\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: m });
            }

            if (!payload) {
                return sock.sendMessage(jid, {
                    text: '❌ Could not process the message.'
                }, { quoted: m });
            }

            await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

            await sendGroupStatus(sock, jid, payload);

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

            let successMsg = `✅ ${mediaType} group status posted!\n`;
            if (payload.caption) successMsg += `📝 Caption: "${payload.caption.substring(0, 80)}"\n`;
            if (payload.text) successMsg += `📄 "${payload.text.substring(0, 80)}"\n`;
            successMsg += `\n👥 Visible to all group members`;

            await sock.sendMessage(jid, { text: successMsg }, { quoted: m });

        } catch (error) {
            console.error('[TogStatus] Error:', error);
            try {
                await sock.sendMessage(m.key.remoteJid, {
                    text: `❌ Failed: ${error.message}`
                }, { quoted: m });
            } catch {}
        }
    }
};
