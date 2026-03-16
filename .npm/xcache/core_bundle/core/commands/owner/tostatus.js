import { getOwnerName } from '../../lib/menuHelper.js';
import {
    postPersonalStatus,
    downloadStatusMedia,
    processQuotedForStatus,
    buildStatusJidList
} from '../../lib/statusHelper.js';

// ─── Command ──────────────────────────────────────────────────────────────────
export default {
    name: 'tostatus',
    alias: ['setstatus', 'updatestatus', 'mystatus', 'poststatus'],
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
            .replace(/^[=!#?/.]?(tostatus|setstatus|updatestatus|mystatus|poststatus)\s*/i, '')
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
                const m = await downloadStatusMedia(directImage, 'image');
                const cap = textAfterCmd ||
                    directImage.caption?.replace(/^[=!#?/.]?(tostatus|setstatus|updatestatus|mystatus|poststatus)\s*/i, '').trim() || '';
                content   = { image: m.buffer, mimetype: m.mimetype, caption: cap };
                mediaType = 'Image';
            } else if (directVideo && !quotedMsg) {
                const m = await downloadStatusMedia(directVideo, 'video');
                const cap = textAfterCmd ||
                    directVideo.caption?.replace(/^[=!#?/.]?(tostatus|setstatus|updatestatus|mystatus|poststatus)\s*/i, '').trim() || '';
                content   = { video: m.buffer, mimetype: m.mimetype, caption: cap };
                mediaType = 'Video';
            } else if (directAudio && !quotedMsg) {
                const m = await downloadStatusMedia(directAudio, 'audio');
                content   = { audio: m.buffer, mimetype: m.mimetype || 'audio/mp4', ptt: directAudio.ptt || false };
                mediaType = 'Audio';
            } else if (quotedMsg) {
                const r   = await processQuotedForStatus(quotedMsg, textAfterCmd);
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

            const statusJidList = await buildStatusJidList(sock);
            console.log(`📱 [toStatus] Posting ${mediaType} to ${statusJidList.length} contacts`);

            const extraOpts = mediaType === 'Text' ? { backgroundColor: bgColor, font } : {};
            const result = await postPersonalStatus(sock, content, statusJidList, extraOpts);

            await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

            let confirmMsg = `✅ *Status Posted!*\n\n📊 Type: ${mediaType}\n`;
            if (content.caption) confirmMsg += `📝 Caption: ${content.caption.substring(0, 60)}${content.caption.length > 60 ? '...' : ''}\n`;
            if (content.text)    confirmMsg += `📄 Text: ${content.text.substring(0, 60)}${content.text.length > 60 ? '...' : ''}\n`;
            confirmMsg += `👥 Recipients: ${statusJidList.length}\n⏰ Visible for 24 hours`;

            await sock.sendMessage(chatId, { text: confirmMsg }, { quoted: msg });
            console.log(`✅ [toStatus] ${mediaType} posted — msgId: ${result?.key?.id}`);

        } catch (err) {
            console.error('❌ [toStatus] Error:', err.message);
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }).catch(() => {});

            let errMsg = `❌ Failed to post status: ${err.message}`;
            if (/connection closed/i.test(err.message))     errMsg = '❌ Connection dropped. Wait a moment and try again.';
            else if (/timed?[\s-]?out/i.test(err.message))  errMsg = '❌ Request timed out. Try a smaller file.';
            else if (/media/i.test(err.message))             errMsg = '❌ Media upload failed. File may be too large.';

            await sock.sendMessage(chatId, { text: errMsg }, { quoted: msg });
        }
    }
};
