import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';

// ─── Core poster ─────────────────────────────────────────────────────────────
// Uses sock.sendMessage (routed to Baileys' originalSendMessage for
// status@broadcast by the index.js bypass) so that:
//  • backgroundColor is correctly converted to ARGB int via Baileys' assertColor
//  • font is correctly assigned as an enum number
//  • messageContextInfo.messageSecret is NOT injected (only valid for events/polls)
//  • media upload goes through sock.waUploadToServer as normal
async function postPersonalStatus(sock, content, statusJidList, extraOpts = {}) {
    return sock.sendMessage('status@broadcast', content, {
        ...extraOpts,
        statusJidList
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function downloadMedia(message, type) {
    const stream = await downloadContentFromMessage(message, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return {
        buffer: Buffer.concat(chunks),
        mimetype: message.mimetype || (
            type === 'image'   ? 'image/jpeg'  :
            type === 'video'   ? 'video/mp4'   :
            type === 'audio'   ? 'audio/mp4'   :
            type === 'sticker' ? 'image/webp'  :
            'application/octet-stream'
        )
    };
}

async function processQuoted(quoted, captionOverride) {
    if (quoted.imageMessage) {
        const m = await downloadMedia(quoted.imageMessage, 'image');
        return {
            content: { image: m.buffer, mimetype: m.mimetype, caption: captionOverride || quoted.imageMessage.caption || '' },
            mediaType: 'Image'
        };
    }
    if (quoted.videoMessage) {
        const m = await downloadMedia(quoted.videoMessage, 'video');
        return {
            content: { video: m.buffer, mimetype: m.mimetype, caption: captionOverride || quoted.videoMessage.caption || '' },
            mediaType: 'Video'
        };
    }
    if (quoted.audioMessage) {
        const m = await downloadMedia(quoted.audioMessage, 'audio');
        return {
            content: { audio: m.buffer, mimetype: m.mimetype || 'audio/mp4', ptt: quoted.audioMessage.ptt || false },
            mediaType: 'Audio'
        };
    }
    if (quoted.stickerMessage) {
        const m = await downloadMedia(quoted.stickerMessage, 'sticker');
        return {
            content: { image: m.buffer, caption: captionOverride || '' },
            mediaType: 'Sticker'
        };
    }
    const text = quoted.conversation || quoted.extendedTextMessage?.text || '';
    const finalText = captionOverride ? `${text}\n\n${captionOverride}` : text;
    return {
        content: { text: finalText },
        mediaType: 'Text'
    };
}

// Build the statusJidList from all known contacts so every contact
// receives the sender key and can actually see/decrypt the posted status.
function buildStatusJidList(sock) {
    const rawId = globalThis.OWNER_JID || sock.user?.id || '';
    const numPart = rawId.split('@')[0].split(':')[0];
    const ownerJid = numPart ? `${numPart}@s.whatsapp.net` : null;

    const jidSet = new Set();

    // Pull from global.contactNames (populated via contacts.upsert events)
    const contactMap = global.contactNames || new Map();
    for (const [jid] of contactMap) {
        // Only individual @s.whatsapp.net JIDs (no groups, no lid, no device suffix)
        if (typeof jid === 'string' && jid.endsWith('@s.whatsapp.net') && !jid.includes(':')) {
            jidSet.add(jid);
        }
    }

    // Always include the owner's own JID
    if (ownerJid) jidSet.add(ownerJid);

    const list = Array.from(jidSet);
    console.log(`📱 [toStatus] statusJidList built: ${list.length} contacts`);
    return list.length > 0 ? list : (ownerJid ? [ownerJid] : ['0@s.whatsapp.net']);
}

// Force-refresh the Signal session with device 0 before posting.
// If the cached session is stale the phone silently drops the sender-key
// distribution (no retry mechanism for <participants> nodes).
async function refreshSessionForDevice0(sock, numPart) {
    const device0Jid = `${numPart}:0@s.whatsapp.net`;
    try {
        if (sock.assertSessions) {
            await sock.assertSessions([device0Jid], true);
            console.log(`[toStatus] Refreshed Signal session for ${device0Jid}`);
        }
    } catch (e) {
        console.warn(`[toStatus] assertSessions warning (non-fatal): ${e.message}`);
    }
}

// ─── Command ──────────────────────────────────────────────────────────────────
export default {
    name: 'tostatus',
    alias: ['status', 'setstatus', 'updatestatus', 'mystatus', 'poststatus'],
    category: 'owner',
    description: 'Post content to your WhatsApp Status (Stories)',
    ownerOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager } = extra;

        const isSudoUser = extra?.isSudo ? extra.isSudo() : false;
        if (!jidManager.isOwner(msg) && !isSudoUser) {
            return sock.sendMessage(chatId, { text: '❌ *Owner Only Command!*' }, { quoted: msg });
        }

        const rawText =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            '';

        const textAfterCmd = rawText
            .replace(/^[=!#?/.]?(tostatus|status|setstatus|updatestatus|mystatus|poststatus)\s*/i, '')
            .trim();

        const directImage  = msg.message?.imageMessage;
        const directVideo  = msg.message?.videoMessage;
        const directAudio  = msg.message?.audioMessage;
        const quotedMsg    = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMsg && !textAfterCmd && !directImage && !directVideo && !directAudio) {
            return sock.sendMessage(chatId, {
                text:
                    `╭─⌈ 📱 *POST TO STATUS* ⌋\n│\n` +
                    `├─⊷ *${PREFIX}tostatus <text>*\n│  └⊷ Post a text status\n` +
                    `├─⊷ Reply to image + *${PREFIX}tostatus [caption]*\n│  └⊷ Post an image\n` +
                    `├─⊷ Reply to video + *${PREFIX}tostatus [caption]*\n│  └⊷ Post a video\n` +
                    `├─⊷ Reply to audio + *${PREFIX}tostatus*\n│  └⊷ Post an audio note\n` +
                    `├─⊷ Send image with caption *${PREFIX}tostatus [caption]*\n│  └⊷ Post that image\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        }

        try {
            let content   = null;
            let mediaType = 'Text';
            const bgColor = '#1b5e20';
            const font    = 0;

            if (directImage && !quotedMsg) {
                const m = await downloadMedia(directImage, 'image');
                const cap = textAfterCmd ||
                    directImage.caption?.replace(/^[=!#?/.]?(tostatus|status|setstatus|updatestatus|mystatus|poststatus)\s*/i, '').trim() || '';
                content   = { image: m.buffer, mimetype: m.mimetype, caption: cap };
                mediaType = 'Image';
            } else if (directVideo && !quotedMsg) {
                const m = await downloadMedia(directVideo, 'video');
                const cap = textAfterCmd ||
                    directVideo.caption?.replace(/^[=!#?/.]?(tostatus|status|setstatus|updatestatus|mystatus|poststatus)\s*/i, '').trim() || '';
                content   = { video: m.buffer, mimetype: m.mimetype, caption: cap };
                mediaType = 'Video';
            } else if (directAudio && !quotedMsg) {
                const m = await downloadMedia(directAudio, 'audio');
                content   = { audio: m.buffer, mimetype: m.mimetype || 'audio/mp4', ptt: directAudio.ptt || false };
                mediaType = 'Audio';
            } else if (quotedMsg) {
                const r   = await processQuoted(quotedMsg, textAfterCmd);
                content   = r.content;
                mediaType = r.mediaType;
            } else if (textAfterCmd) {
                content   = { text: textAfterCmd };
                mediaType = 'Text';
            }

            if (!content) {
                return sock.sendMessage(chatId, { text: '❌ No valid content to post!' }, { quoted: msg });
            }

            await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

            const statusJidList = buildStatusJidList(sock);
            console.log(`📱 [toStatus] Posting ${mediaType} to ${statusJidList.length} contacts`);

            const extraOpts = mediaType === 'Text' ? { backgroundColor: bgColor, font } : {};
            const result = await postPersonalStatus(sock, content, statusJidList, extraOpts);

            await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

            let confirmMsg = `✅ *Status Posted!*\n\n📊 Type: ${mediaType}\n`;
            if (content.caption) confirmMsg += `📝 Caption: ${content.caption.substring(0, 60)}${content.caption.length > 60 ? '...' : ''}\n`;
            if (content.text)    confirmMsg += `📄 Text: ${content.text.substring(0, 60)}${content.text.length > 60 ? '...' : ''}\n`;
            confirmMsg += `👥 Recipients: ${statusJidList.length}\n⏰ Visible for 24 hours`;

            if (globalThis._debugStatusMode) {
                confirmMsg += `\n\n🔬 *Debug:* msgId=${result?.key?.id}\nstatusJidList=${JSON.stringify(statusJidList)}`;
            }

            await sock.sendMessage(chatId, { text: confirmMsg }, { quoted: msg });
            console.log(`✅ [toStatus] ${mediaType} posted — msgId: ${result?.key?.id}`);

        } catch (err) {
            console.error('❌ [toStatus] Error:', err.message);
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }).catch(() => {});

            let errMsg = `❌ Failed to post status: ${err.message}`;
            if (/connection closed/i.test(err.message))  errMsg = '❌ Connection dropped. Wait a moment and try again.';
            else if (/timed?[\s-]?out/i.test(err.message)) errMsg = '❌ Request timed out. Try a smaller file.';
            else if (/media/i.test(err.message))          errMsg = '❌ Media upload failed. File may be too large (max ~16 MB for video, 30 s max).';

            await sock.sendMessage(chatId, { text: errMsg }, { quoted: msg });
        }
    }
};
