import {
    downloadMediaMessage,
    generateWAMessageContent,
    generateWAMessageFromContent
} from '@whiskeysockets/baileys';
import crypto from 'crypto';
import { PassThrough } from 'stream';
import { getOwnerName } from '../../lib/menuHelper.js';

// ─── Audio → voice note converter ────────────────────────────────────────────
async function toVN(inputBuffer) {
    return new Promise((resolve) => {
        try {
            import('fluent-ffmpeg').then(ffmpeg => {
                const inStream  = new PassThrough();
                const outStream = new PassThrough();
                const chunks    = [];
                inStream.end(inputBuffer);
                ffmpeg.default(inStream)
                    .noVideo().audioCodec('libopus').format('ogg')
                    .audioBitrate('48k').audioChannels(1).audioFrequency(48000)
                    .on('error', () => resolve(inputBuffer))
                    .on('end',   () => resolve(Buffer.concat(chunks)))
                    .pipe(outStream, { end: true });
                outStream.on('data', chunk => chunks.push(chunk));
            }).catch(() => resolve(inputBuffer));
        } catch { resolve(inputBuffer); }
    });
}

// ─── Quoted message → payload (uses downloadMediaMessage for reliable re-upload) ──
async function buildPayloadFromQuoted(quotedMessage, sock, m) {
    const dlOpts = { reuploadRequest: sock.updateMediaMessage, logger: console };

    if (quotedMessage.videoMessage) {
        const buf = await downloadMediaMessage(
            { key: m.key, message: quotedMessage }, 'buffer', {}, dlOpts
        );
        console.log(`[TogStatus] Downloaded video: ${buf.length} bytes`);
        return {
            video:       buf,
            caption:     quotedMessage.videoMessage.caption || '',
            gifPlayback: quotedMessage.videoMessage.gifPlayback || false,
            mimetype:    quotedMessage.videoMessage.mimetype   || 'video/mp4'
        };
    }
    if (quotedMessage.imageMessage) {
        const buf = await downloadMediaMessage(
            { key: m.key, message: quotedMessage }, 'buffer', {}, dlOpts
        );
        console.log(`[TogStatus] Downloaded image: ${buf.length} bytes`);
        return {
            image:    buf,
            caption:  quotedMessage.imageMessage.caption || '',
            mimetype: quotedMessage.imageMessage.mimetype || 'image/jpeg'
        };
    }
    if (quotedMessage.audioMessage) {
        const buf = await downloadMediaMessage(
            { key: m.key, message: quotedMessage }, 'buffer', {}, dlOpts
        );
        console.log(`[TogStatus] Downloaded audio: ${buf.length} bytes`);
        if (quotedMessage.audioMessage.ptt) {
            try {
                const vn = await toVN(buf);
                return { audio: vn, mimetype: 'audio/ogg; codecs=opus', ptt: true };
            } catch {
                return { audio: buf, mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg', ptt: true };
            }
        }
        return { audio: buf, mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg', ptt: false };
    }
    if (quotedMessage.stickerMessage) {
        const buf = await downloadMediaMessage(
            { key: m.key, message: quotedMessage }, 'buffer', {}, dlOpts
        );
        console.log(`[TogStatus] Downloaded sticker: ${buf.length} bytes`);
        return { sticker: buf, mimetype: quotedMessage.stickerMessage.mimetype || 'image/webp' };
    }
    const text = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '';
    if (text) return { text };
    return null;
}

function detectMediaType(quotedMessage) {
    if (!quotedMessage)                     return 'Text';
    if (quotedMessage.videoMessage)         return 'Video';
    if (quotedMessage.imageMessage)         return 'Image';
    if (quotedMessage.audioMessage)         return 'Audio';
    if (quotedMessage.stickerMessage)       return 'Sticker';
    return 'Text';
}

// ─── Core group status sender ─────────────────────────────────────────────────
async function sendGroupStatus(sock, groupJid, payload) {
    console.log('[TogStatus] Sending to:', groupJid, '| keys:', Object.keys(payload));

    const messageSecret = crypto.randomBytes(32);

    // Step 1: Upload media and get the inner message proto
    const inside = await generateWAMessageContent(payload, {
        upload: sock.waUploadToServer
    });
    console.log('[TogStatus] generateWAMessageContent done — keys:', Object.keys(inside));

    // Step 2: Wrap in groupStatusMessageV2
    // IMPORTANT: pass `inside` directly as `message` — do NOT spread it.
    // Spreading destroys the proto structure and causes media to be silently dropped.
    const wrapped = generateWAMessageFromContent(groupJid, {
        messageContextInfo: { messageSecret },
        groupStatusMessageV2: {
            message: inside
        }
    }, {});

    // Step 3: Relay
    await sock.relayMessage(groupJid, wrapped.message, { messageId: wrapped.key.id });
    console.log('[TogStatus] relayMessage done ✅ msgId:', wrapped.key.id);
    return wrapped;
}

// ─── Fallback: plain sendMessage ──────────────────────────────────────────────
// If groupStatusMessageV2 relay succeeds but nothing appears in the group,
// WhatsApp may have silently dropped it. This fallback sends it as a normal
// group message so the content at least reaches the group.
async function sendGroupStatusFallback(sock, groupJid, payload) {
    console.log('[TogStatus] Trying plain sendMessage fallback...');
    if (payload.image) {
        return sock.sendMessage(groupJid, {
            image:    payload.image,
            caption:  payload.caption || '',
            mimetype: payload.mimetype || 'image/jpeg'
        });
    }
    if (payload.video) {
        return sock.sendMessage(groupJid, {
            video:    payload.video,
            caption:  payload.caption || '',
            mimetype: payload.mimetype || 'video/mp4'
        });
    }
    if (payload.audio) {
        return sock.sendMessage(groupJid, {
            audio:    payload.audio,
            mimetype: payload.mimetype || 'audio/mpeg',
            ptt:      payload.ptt || false
        });
    }
    if (payload.sticker) {
        return sock.sendMessage(groupJid, {
            sticker:  payload.sticker,
            mimetype: payload.mimetype || 'image/webp'
        });
    }
    if (payload.text) {
        return sock.sendMessage(groupJid, { text: payload.text });
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stripCommand(messageText) {
    return messageText
        .replace(/^.*?(togroupstatus|groupstatus|gstatus|togstatus|tosgroup|swgc|gs)\b\s*/i, '')
        .trim();
}

function extractGroupJid(text) {
    const match = text.match(/^\(?([\d][\d-]+@g\.us)\)?/);
    if (match) return { jid: match[1], rest: text.slice(match[0].length).trim() };
    const numMatch = text.match(/^\(?(\d{10,}(?:-\d+)?)\)?/);
    if (numMatch) {
        const bare = numMatch[1];
        return { jid: bare.includes('@') ? bare : `${bare}@g.us`, rest: text.slice(numMatch[0].length).trim() };
    }
    return null;
}

// ─── Command ──────────────────────────────────────────────────────────────────
export default {
    name: 'togstatus',
    aliases: ['swgc', 'groupstatus', 'tosgroup', 'gs', 'gstatus', 'togroupstatus'],
    description: 'Send group status updates (text, images, videos, audio, stickers)',
    category: 'group',
    adminOnly: false,

    async execute(sock, m, args, PREFIX, extra) {
        const senderJid = m.key.remoteJid;
        const inGroup   = senderJid.endsWith('@g.us');

        const messageText   = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        // Also handle direct image/video/audio (not quoted)
        const directImage   = m.message?.imageMessage;
        const directVideo   = m.message?.videoMessage;
        const directAudio   = m.message?.audioMessage;

        let textAfterCommand = Array.isArray(args) && args.length
            ? args.join(' ').trim()
            : stripCommand(messageText);

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
            groupJid          = parsed.jid;
            textAfterCommand  = parsed.rest;
        }

        if (!quotedMessage && !textAfterCommand && !directImage && !directVideo && !directAudio) {
            const hint = inGroup
                ? `${PREFIX}togstatus Your text  │  or reply to media`
                : `${PREFIX}togstatus (JID) Your text  │  or reply to media`;
            return sock.sendMessage(senderJid, {
                text: `╭─⌈ 💡 *GROUP STATUS* ⌋\n│\n├─⊷ ${hint}\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });
        }

        try {
            await sock.sendMessage(senderJid, { react: { text: '⏳', key: m.key } });

            let payload   = null;
            let mediaType = 'Text';

            const dlOpts = { reuploadRequest: sock.updateMediaMessage, logger: console };

            if (directImage && !quotedMessage) {
                const buf = await downloadMediaMessage(m, 'buffer', {}, dlOpts);
                console.log(`[TogStatus] Downloaded direct image: ${buf.length} bytes`);
                const cap = textAfterCommand || directImage.caption?.replace(/^.*?(togroupstatus|togstatus|gstatus|gs)\b\s*/i, '').trim() || '';
                payload   = { image: buf, caption: cap, mimetype: directImage.mimetype || 'image/jpeg' };
                mediaType = 'Image';
            } else if (directVideo && !quotedMessage) {
                const buf = await downloadMediaMessage(m, 'buffer', {}, dlOpts);
                console.log(`[TogStatus] Downloaded direct video: ${buf.length} bytes`);
                const cap = textAfterCommand || directVideo.caption?.replace(/^.*?(togroupstatus|togstatus|gstatus|gs)\b\s*/i, '').trim() || '';
                payload   = { video: buf, caption: cap, mimetype: directVideo.mimetype || 'video/mp4' };
                mediaType = 'Video';
            } else if (directAudio && !quotedMessage) {
                const buf = await downloadMediaMessage(m, 'buffer', {}, dlOpts);
                console.log(`[TogStatus] Downloaded direct audio: ${buf.length} bytes`);
                payload   = { audio: buf, mimetype: directAudio.mimetype || 'audio/mpeg', ptt: directAudio.ptt || false };
                mediaType = 'Audio';
            } else if (quotedMessage) {
                mediaType = detectMediaType(quotedMessage);
                payload   = await buildPayloadFromQuoted(quotedMessage, sock, m);
                if (payload && (payload.video || payload.image) && textAfterCommand) {
                    payload.caption = textAfterCommand;
                }
            } else if (textAfterCommand) {
                payload   = { text: textAfterCommand };
                mediaType = 'Text';
            }

            if (!payload) {
                return sock.sendMessage(senderJid, {
                    text: '❌ Could not process message. Unsupported media type?'
                }, { quoted: m });
            }

            console.log('[TogStatus] payload ready — mediaType:', mediaType, '| groupJid:', groupJid);

            // Try groupStatusMessageV2 first, fall back to plain sendMessage
            try {
                await sendGroupStatus(sock, groupJid, payload);
            } catch (relayErr) {
                console.error('[TogStatus] relayMessage failed:', relayErr.message, '— trying fallback');
                await sendGroupStatusFallback(sock, groupJid, payload);
            }

            await sock.sendMessage(senderJid, { react: { text: '✅', key: m.key } });

            let successMsg = `✅ *${mediaType} status posted* to group!\n`;
            if (!inGroup) successMsg += `📍 Group: \`${groupJid}\`\n`;
            if (payload.caption) successMsg += `📝 Caption: "${payload.caption.substring(0, 80)}"\n`;
            if (payload.text)    successMsg += `📄 "${payload.text.substring(0, 80)}"\n`;
            successMsg += `\n👥 Visible to all group members`;

            await sock.sendMessage(senderJid, { text: successMsg }, { quoted: m });

        } catch (error) {
            console.error('[TogStatus] ERROR:', error.message);
            await sock.sendMessage(senderJid, { react: { text: '❌', key: m.key } }).catch(() => {});
            await sock.sendMessage(senderJid, {
                text: `❌ *togstatus failed*\n\n*Error:* ${error.message}`
            }, { quoted: m });
        }
    }
};