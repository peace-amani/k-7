import { downloadMediaMessage, getContentType, normalizeMessageContent } from "@whiskeysockets/baileys";
import { getBotName } from '../../lib/botname.js';

const silentLogger = {
    level: 'silent', trace: ()=>{}, debug: ()=>{}, info: ()=>{},
    warn: ()=>{}, error: ()=>{}, fatal: ()=>{},
    child: ()=>({ level:'silent', trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child:()=>({}) })
};

function getContextInfo(msg) {
    if (!msg?.message) return null;
    const m = msg.message;
    return m.extendedTextMessage?.contextInfo
        || m.imageMessage?.contextInfo
        || m.videoMessage?.contextInfo
        || m.audioMessage?.contextInfo
        || m.documentMessage?.contextInfo
        || m.stickerMessage?.contextInfo
        || null;
}

function getMediaKind(msgContent) {
    if (!msgContent) return null;
    const normalized = normalizeMessageContent(msgContent) || msgContent;
    if (normalized.imageMessage)    return { key: 'image',    content: normalized.imageMessage,    ext: '.jpg' };
    if (normalized.videoMessage)    return { key: 'video',    content: normalized.videoMessage,    ext: '.mp4' };
    if (normalized.audioMessage)    return { key: 'audio',    content: normalized.audioMessage,    ext: '.ogg' };
    if (normalized.stickerMessage)  return { key: 'sticker',  content: normalized.stickerMessage,  ext: '.webp' };
    if (normalized.documentMessage) return { key: 'document', content: normalized.documentMessage, ext: '.bin' };
    return null;
}

function getTextFromContent(msgContent) {
    if (!msgContent) return null;
    const n = normalizeMessageContent(msgContent) || msgContent;
    return n.extendedTextMessage?.text || n.conversation || null;
}

export default {
    name: "save",
    alias: ["story", "status"],
    desc: "Save and send a WhatsApp status/story to this chat.",
    category: "utility",
    usage: ".save [reply to a status]",

    async execute(sock, m, args, PREFIX) {
        const chatId = m.key.remoteJid;
        const botName = getBotName();

        const contextInfo = getContextInfo(m);
        const quotedMsg   = contextInfo?.quotedMessage;

        if (!quotedMsg) {
            return await sock.sendMessage(chatId, {
                text: `╭─⌈ 💾 *SAVE STATUS* ⌋\n│\n├⊷ Reply to a status/story with *${PREFIX}save*\n│\n╰⊷ *${botName.toUpperCase()}*`
            }, { quoted: m });
        }

        const mediaInfo = getMediaKind(quotedMsg);
        const textContent = getTextFromContent(quotedMsg);

        if (!mediaInfo && !textContent) {
            return await sock.sendMessage(chatId, {
                text: `❌ Cannot read that status format.`
            }, { quoted: m });
        }

        if (textContent && !mediaInfo) {
            return await sock.sendMessage(chatId, {
                text: `╭─⌈ 📝 *TEXT STATUS* ⌋\n│\n├⊷ ${textContent}\n│\n╰⊷ *${botName.toUpperCase()}*`
            }, { quoted: m });
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

        try {
            const senderJid  = contextInfo?.participant || contextInfo?.remoteJid || '';
            const senderNum  = senderJid ? '+' + senderJid.split('@')[0].split(':')[0].replace(/\D/g, '') : 'Unknown';
            const caption    = mediaInfo.content?.caption || '';

            const fakeMsg = {
                key: { remoteJid: 'status@broadcast', id: contextInfo?.stanzaId || m.key.id, participant: senderJid },
                message: quotedMsg
            };

            const buffer = await Promise.race([
                downloadMediaMessage(fakeMsg, 'buffer', {}, { logger: silentLogger, reuploadRequest: sock.updateMediaMessage }),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000))
            ]);

            if (!buffer || buffer.length === 0) {
                throw new Error('Empty buffer — media may have expired');
            }

            const payload = {};
            let statusCaption = `╭─⌈ 💾 *STATUS SAVED* ⌋\n`;
            statusCaption += `│ 👤 *From:* ${senderNum}\n`;
            if (caption) statusCaption += `│ 💬 ${caption}\n`;
            statusCaption += `╰⊷ *${botName.toUpperCase()}*`;

            if (mediaInfo.key === 'sticker') {
                payload.sticker = buffer;
            } else {
                payload[mediaInfo.key] = buffer;
                if (mediaInfo.key !== 'audio') payload.caption = statusCaption;
                if (mediaInfo.key === 'audio') payload.mimetype = 'audio/ogg; codecs=opus';
            }

            await sock.sendMessage(chatId, payload, { quoted: m });
            if (mediaInfo.key === 'sticker' || mediaInfo.key === 'audio') {
                await sock.sendMessage(chatId, { text: statusCaption }, { quoted: m });
            }

            await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });

        } catch (err) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });
            const msg = err.message === 'timeout'
                ? '⏱️ Download timed out — status may have expired.'
                : `❌ ${err.message}`;
            await sock.sendMessage(chatId, { text: msg }, { quoted: m });
        }
    },
};
