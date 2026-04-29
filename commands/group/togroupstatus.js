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
    return messageText.replace(/^.*?(togroupstatus|groupstatus|gstatus|togstatus|tosgroup|swgc|gs)\b\s*/i, '').trim();
}

// Extract a group JID from the start of a string.
// Accepts formats: 1234567890@g.us  or  (1234567890@g.us)  or  1234567890-123456@g.us
function extractGroupJid(text) {
    const match = text.match(/^\(?(\d[\d-]+@g\.us)\)?/);
    if (match) {
        const jid  = match[1];
        const rest = text.slice(match[0].length).trim();
        return { jid, rest };
    }
    // Also accept bare number strings (15+ digits) that could be a group id
    const numMatch = text.match(/^\(?(\d{10,}(?:-\d+)?)\)?/);
    if (numMatch) {
        const bare = numMatch[1];
        const jid  = bare.includes('@') ? bare : `${bare}@g.us`;
        const rest = text.slice(numMatch[0].length).trim();
        return { jid, rest };
    }
    return null;
}

export default {
    name: 'togstatus',
    aliases: ['swgc', 'groupstatus', 'tosgroup', 'gs', 'gstatus', 'togroupstatus'],
    description: 'Send group status updates (text, images, videos, audio, stickers) from group or DM',
    category: 'group',
    adminOnly: false,

    async execute(sock, m, args, PREFIX, extra) {
        try {
            const senderJid  = m.key.remoteJid;
            const inGroup    = senderJid.endsWith('@g.us');
            const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
            const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            let textAfterCommand = Array.isArray(args) && args.length
                ? args.join(' ').trim()
                : stripCommand(messageText);

            // ── Determine target group JID ────────────────────────────────────
            let groupJid = null;

            if (inGroup) {
                // In a group — target is always the current group; JID arg optional
                groupJid = senderJid;
                // If user still prefixed a JID, strip it so it doesn't become content
                const parsed = extractGroupJid(textAfterCommand);
                if (parsed && parsed.jid === senderJid) textAfterCommand = parsed.rest;

            } else {
                // In DM — first token must be a group JID
                const parsed = extractGroupJid(textAfterCommand);
                if (!parsed) {
                    return sock.sendMessage(senderJid, {
                        text:
                            `╭─⌈ 💡 *GROUP STATUS (DM mode)* ⌋\n` +
                            `│\n` +
                            `├─⊷ *${PREFIX}togstatus (groupJID) text*\n` +
                            `│  └⊷ Post text to that group\n` +
                            `├─⊷ Reply to media + *${PREFIX}togstatus (groupJID)*\n` +
                            `│  └⊷ Post image/video/audio\n` +
                            `│\n` +
                            `├─⊷ Example:\n` +
                            `│  └⊷ ${PREFIX}togstatus 120363424761834@g.us Hello!\n` +
                            `│\n` +
                            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                    }, { quoted: m });
                }
                groupJid = parsed.jid;
                textAfterCommand = parsed.rest;
            }

            // ── Show help if nothing to post ──────────────────────────────────
            if (!quotedMessage && !textAfterCommand) {
                const hint = inGroup
                    ? `${PREFIX}togstatus Your text  │  or reply to media`
                    : `${PREFIX}togstatus (JID) Your text  │  or reply media`;
                return sock.sendMessage(senderJid, {
                    text:
                        `╭─⌈ 💡 *GROUP STATUS* ⌋\n` +
                        `│\n` +
                        `├─⊷ ${hint}\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: m });
            }

            // ── Build payload ─────────────────────────────────────────────────
            let payload   = null;
            let mediaType = 'Text';

            if (quotedMessage) {
                mediaType = detectMediaType(quotedMessage);
                payload   = await buildPayloadFromQuoted(quotedMessage);
                if (payload && (payload.video || payload.image) && textAfterCommand) {
                    payload.caption = textAfterCommand;
                }
            } else if (textAfterCommand) {
                payload = { text: textAfterCommand };
            }

            if (!payload) {
                return sock.sendMessage(senderJid, {
                    text: '❌ Could not process the message. Unsupported media type?'
                }, { quoted: m });
            }

            await sock.sendMessage(senderJid, { react: { text: '⏳', key: m.key } });

            await sendGroupStatus(sock, groupJid, payload);

            await sock.sendMessage(senderJid, { react: { text: '✅', key: m.key } });

            let successMsg = `✅ *${mediaType} status posted* to group!\n`;
            if (!inGroup) successMsg += `📍 Group: \`${groupJid}\`\n`;
            if (payload.caption) successMsg += `📝 Caption: "${payload.caption.substring(0, 80)}"\n`;
            if (payload.text)    successMsg += `📄 "${payload.text.substring(0, 80)}"\n`;
            successMsg += `\n👥 Visible to all group members`;

            await sock.sendMessage(senderJid, { text: successMsg }, { quoted: m });

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
