import { downloadContentFromMessage, generateWAMessageContent, generateWAMessageFromContent } from '@whiskeysockets/baileys';
import crypto from 'crypto';
import { PassThrough } from 'stream';
import { getOwnerName } from '../../lib/menuHelper.js';

let _prepareWAMessageMedia = null;
import('@whiskeysockets/baileys').then(m => {
    _prepareWAMessageMedia = m.prepareWAMessageMedia;
    console.log('[TogStatus] prepareWAMessageMedia loaded:', typeof _prepareWAMessageMedia);
}).catch(e => console.error('[TogStatus] Baileys dynamic import failed:', e.message));

async function toVN(inputBuffer) {
    return new Promise((resolve, reject) => {
        try {
            import('fluent-ffmpeg').then(ffmpeg => {
                const inStream = new PassThrough();
                inStream.end(inputBuffer);
                const outStream = new PassThrough();
                const chunks = [];
                ffmpeg.default(inStream)
                    .noVideo().audioCodec("libopus").format("ogg")
                    .audioBitrate("48k").audioChannels(1).audioFrequency(48000)
                    .on("error", reject)
                    .on("end", () => resolve(Buffer.concat(chunks)))
                    .pipe(outStream, { end: true });
                outStream.on("data", chunk => chunks.push(chunk));
            }).catch(() => resolve(inputBuffer));
        } catch { resolve(inputBuffer); }
    });
}

async function downloadToBuffer(message, type) {
    const stream = await downloadContentFromMessage(message, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    console.log(`[TogStatus] Downloaded ${type}: ${buffer.length} bytes`);
    return buffer;
}

async function buildPayloadFromQuoted(quotedMessage) {
    if (quotedMessage.videoMessage) {
        const buffer = await downloadToBuffer(quotedMessage.videoMessage, 'video');
        return { video: buffer, caption: quotedMessage.videoMessage.caption || '', gifPlayback: quotedMessage.videoMessage.gifPlayback || false, mimetype: quotedMessage.videoMessage.mimetype || 'video/mp4' };
    }
    if (quotedMessage.imageMessage) {
        const buffer = await downloadToBuffer(quotedMessage.imageMessage, 'image');
        return { image: buffer, caption: quotedMessage.imageMessage.caption || '', mimetype: quotedMessage.imageMessage.mimetype || 'image/jpeg' };
    }
    if (quotedMessage.audioMessage) {
        const buffer = await downloadToBuffer(quotedMessage.audioMessage, 'audio');
        if (quotedMessage.audioMessage.ptt) {
            try { const audioVn = await toVN(buffer); return { audio: audioVn, mimetype: "audio/ogg; codecs=opus", ptt: true }; }
            catch { return { audio: buffer, mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg', ptt: true }; }
        }
        return { audio: buffer, mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg', ptt: false };
    }
    if (quotedMessage.stickerMessage) {
        const buffer = await downloadToBuffer(quotedMessage.stickerMessage, 'sticker');
        return { sticker: buffer, mimetype: quotedMessage.stickerMessage.mimetype || 'image/webp' };
    }
    if (quotedMessage.conversation || quotedMessage.extendedTextMessage?.text) {
        return { text: quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '' };
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

// Helper: safely serialise a proto/object — strips Buffers to their byte-length
function safeJson(obj, depth = 0) {
    if (depth > 5) return '[deep]';
    if (obj === null || obj === undefined) return obj;
    if (Buffer.isBuffer(obj)) return `<Buffer ${obj.length}b>`;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => safeJson(v, depth + 1));
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        out[k] = safeJson(v, depth + 1);
    }
    return out;
}

async function sendGroupStatus(conn, jid, content) {
    console.log('[TogStatus:sendGroupStatus] ── START ──');
    console.log('[TogStatus:sendGroupStatus] jid:', jid);
    console.log('[TogStatus:sendGroupStatus] content keys:', Object.keys(content));

    const messageSecret = crypto.randomBytes(32);

    // ── Step 1: Upload media via generateWAMessageContent ────────────────────
    // (same as tochannelstatus which works — generateWAMessageContent uploads
    //  the buffer via conn.waUploadToServer and returns a fully populated proto)
    console.log('[TogStatus:sendGroupStatus] Calling generateWAMessageContent...');
    const inside = await generateWAMessageContent(content, { upload: conn.waUploadToServer });
    console.log('[TogStatus:sendGroupStatus] generateWAMessageContent result:');
    console.log(JSON.stringify(safeJson(inside), null, 2));

    // ── Step 2: Build groupStatusMessageV2 wrapper ────────────────────────────
    const msgProto = {
        messageContextInfo: { messageSecret },
        groupStatusMessageV2: {
            message: {
                ...inside,
                messageContextInfo: { messageSecret }
            }
        }
    };
    console.log('[TogStatus:sendGroupStatus] msgProto (no buffers):');
    console.log(JSON.stringify(safeJson(msgProto), null, 2));

    const m = generateWAMessageFromContent(jid, msgProto, {});
    console.log('[TogStatus:sendGroupStatus] Final m.message (no buffers):');
    console.log(JSON.stringify(safeJson(m.message), null, 2));
    console.log('[TogStatus:sendGroupStatus] m.key:', JSON.stringify(m.key));

    // ── Step 3: Relay ─────────────────────────────────────────────────────────
    console.log('[TogStatus:sendGroupStatus] Calling relayMessage...');
    await conn.relayMessage(jid, m.message, { messageId: m.key.id });
    console.log('[TogStatus:sendGroupStatus] relayMessage done ✅');

    // ── Step 4: Also try prepareWAMessageMedia path if available ──────────────
    // WhatsApp may require a different upload path for group status media.
    // We send BOTH and see which one (if either) appears in the group.
    if (_prepareWAMessageMedia && !content.text) {
        console.log('[TogStatus:sendGroupStatus] Also trying prepareWAMessageMedia path...');
        try {
            let uploadPayload;
            if (content.image)        uploadPayload = { image: content.image, mimetype: content.mimetype || 'image/jpeg' };
            else if (content.video)   uploadPayload = { video: content.video, mimetype: content.mimetype || 'video/mp4', gifPlayback: content.gifPlayback || false };
            else if (content.audio)   uploadPayload = { audio: content.audio, mimetype: content.mimetype || 'audio/mpeg', ptt: content.ptt || false };
            else if (content.sticker) uploadPayload = { sticker: content.sticker, mimetype: content.mimetype || 'image/webp' };

            const uploaded = await _prepareWAMessageMedia(uploadPayload, { upload: conn.waUploadToServer });
            console.log('[TogStatus:sendGroupStatus] prepareWAMessageMedia result:');
            console.log(JSON.stringify(safeJson(uploaded), null, 2));

            if (content.caption) {
                if (uploaded.imageMessage) uploaded.imageMessage.caption = content.caption;
                if (uploaded.videoMessage) uploaded.videoMessage.caption = content.caption;
            }

            const secret2 = crypto.randomBytes(32);
            const m2 = generateWAMessageFromContent(jid, {
                messageContextInfo: { messageSecret: secret2 },
                groupStatusMessageV2: {
                    message: { ...uploaded, messageContextInfo: { messageSecret: secret2 } }
                }
            }, {});

            console.log('[TogStatus:sendGroupStatus] prepareWAMessageMedia m2.message:');
            console.log(JSON.stringify(safeJson(m2.message), null, 2));

            await conn.relayMessage(jid, m2.message, { messageId: m2.key.id });
            console.log('[TogStatus:sendGroupStatus] prepareWAMessageMedia relayMessage done ✅');
        } catch (e2) {
            console.error('[TogStatus:sendGroupStatus] prepareWAMessageMedia path error:', e2.message);
        }
    }

    return m;
}

function stripCommand(messageText) {
    return messageText.replace(/^.*?(togroupstatus|groupstatus|gstatus|togstatus|tosgroup|swgc|gs)\b\s*/i, '').trim();
}

function extractGroupJid(text) {
    const match = text.match(/^\(?(\d[\d-]+@g\.us)\)?/);
    if (match) return { jid: match[1], rest: text.slice(match[0].length).trim() };
    const numMatch = text.match(/^\(?(\d{10,}(?:-\d+)?)\)?/);
    if (numMatch) {
        const bare = numMatch[1];
        return { jid: bare.includes('@') ? bare : `${bare}@g.us`, rest: text.slice(numMatch[0].length).trim() };
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
            console.log('[TogStatus:execute] START');
            const senderJid   = m.key.remoteJid;
            const inGroup     = senderJid.endsWith('@g.us');
            const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
            const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            let textAfterCommand = Array.isArray(args) && args.length
                ? args.join(' ').trim()
                : stripCommand(messageText);

            console.log('[TogStatus:execute] inGroup:', inGroup, '| hasQuoted:', !!quotedMessage, '| text:', textAfterCommand);

            let groupJid = null;
            if (inGroup) {
                groupJid = senderJid;
                const parsed = extractGroupJid(textAfterCommand);
                if (parsed && parsed.jid === senderJid) textAfterCommand = parsed.rest;
            } else {
                const parsed = extractGroupJid(textAfterCommand);
                if (!parsed) {
                    return sock.sendMessage(senderJid, {
                        text:
                            `╭─⌈ 💡 *GROUP STATUS (DM mode)* ⌋\n│\n` +
                            `├─⊷ *${PREFIX}togstatus (groupJID) text*\n│  └⊷ Post text to that group\n` +
                            `├─⊷ Reply to media + *${PREFIX}togstatus (groupJID)*\n│  └⊷ Post image/video/audio\n│\n` +
                            `├─⊷ Example:\n│  └⊷ ${PREFIX}togstatus 120363424761834@g.us Hello!\n│\n` +
                            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                    }, { quoted: m });
                }
                groupJid = parsed.jid;
                textAfterCommand = parsed.rest;
            }

            console.log('[TogStatus:execute] groupJid:', groupJid);

            if (!quotedMessage && !textAfterCommand) {
                const hint = inGroup
                    ? `${PREFIX}togstatus Your text  │  or reply to media`
                    : `${PREFIX}togstatus (JID) Your text  │  or reply media`;
                return sock.sendMessage(senderJid, {
                    text: `╭─⌈ 💡 *GROUP STATUS* ⌋\n│\n├─⊷ ${hint}\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: m });
            }

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
                return sock.sendMessage(senderJid, { text: '❌ Could not process message. Unsupported media type?' }, { quoted: m });
            }

            console.log('[TogStatus:execute] payload keys:', Object.keys(payload));
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
            console.error('[TogStatus:execute] ERROR:', error.message);
            console.error('[TogStatus:execute] Stack:', error.stack);
            try {
                await sock.sendMessage(m.key.remoteJid, {
                    text: `❌ *togstatus failed*\n\n*Error:* ${error.message}\n\`\`\`${error.stack?.split('\n').slice(0, 4).join('\n')}\`\`\``
                }, { quoted: m });
            } catch {}
        }
    }
};