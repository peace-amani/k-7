import { normalizeMessageContent } from '@whiskeysockets/baileys';

function detectViewOnceMedia(rawMessage) {
    if (!rawMessage) return null;
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage'];
    const typeMap = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio' };

    for (const mt of mediaTypes) {
        if (rawMessage[mt]?.viewOnce) {
            return { method: 'direct-flag', mt };
        }
    }

    const voMsg = rawMessage.viewOnceMessage?.message
        || rawMessage.viewOnceMessageV2?.message
        || rawMessage.viewOnceMessageV2Extension?.message;
    if (voMsg) {
        for (const mt of mediaTypes) {
            if (voMsg[mt]) return { method: 'wrapper', mt };
        }
    }

    const ephMsg = rawMessage.ephemeralMessage?.message;
    if (ephMsg) {
        const r = detectViewOnceMedia(ephMsg);
        if (r) return { method: 'ephemeral>' + r.method, mt: r.mt };
    }

    const normalized = normalizeMessageContent(rawMessage);
    if (normalized && normalized !== rawMessage) {
        for (const mt of mediaTypes) {
            if (normalized[mt]?.viewOnce) return { method: 'normalize-flag', mt };
        }
    }

    const hasVoWrapper = !!(rawMessage.viewOnceMessage || rawMessage.viewOnceMessageV2 || rawMessage.viewOnceMessageV2Extension);
    if (hasVoWrapper && normalized) {
        for (const mt of mediaTypes) {
            if (normalized[mt]) return { method: 'wrapper+normalize', mt };
        }
    }

    return null;
}

export default {
    name: 'messagetype',
    aliases: ['msgtype', 'mtype'],
    category: 'owner',
    description: 'Debug: dump message type structure of the replied-to message',
    ownerOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager } = extra;

        if (!jidManager.isOwner(msg)) {
            return sock.sendMessage(chatId, { text: '❌ *Owner Only Command!*' }, { quoted: msg });
        }

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
            || msg.message?.imageMessage?.contextInfo?.quotedMessage
            || msg.message?.videoMessage?.contextInfo?.quotedMessage
            || msg.message?.audioMessage?.contextInfo?.quotedMessage
            || msg.message?.documentMessage?.contextInfo?.quotedMessage
            || msg.message?.buttonsResponseMessage?.contextInfo?.quotedMessage
            || msg.message?.listResponseMessage?.contextInfo?.quotedMessage;

        if (!quoted) {
            return sock.sendMessage(chatId, {
                text: '↩️ *Reply to any message* with `.messagetype` to inspect its structure.'
            }, { quoted: msg });
        }

        // Top-level keys
        const topKeys = Object.keys(quoted);

        // Normalised content
        const normalized = normalizeMessageContent(quoted);
        const normalKeys = normalized ? Object.keys(normalized) : [];

        // viewOnce wrapper check
        const wrappers = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'ephemeralMessage'];
        const foundWrappers = wrappers.filter(w => quoted[w]);

        // Inner message keys (if any wrapper found)
        let innerKeys = [];
        for (const w of foundWrappers) {
            const inner = quoted[w]?.message;
            if (inner) innerKeys.push(...Object.keys(inner).map(k => `${w}.message.${k}`));
        }

        // viewOnce flag on direct media
        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage'];
        const directViewOnce = mediaTypes.filter(mt => quoted[mt]?.viewOnce === true);
        const normalViewOnce = mediaTypes.filter(mt => normalized?.[mt]?.viewOnce === true);

        // Run full detection
        const detected = detectViewOnceMedia(quoted);

        // Build report
        let report = `*🔍 MESSAGE TYPE INSPECTOR*\n\n`;
        report += `*📦 Top-level keys:*\n${topKeys.map(k => `  • ${k}`).join('\n') || '  (none)'}\n\n`;

        if (foundWrappers.length > 0) {
            report += `*🔐 ViewOnce/Ephemeral wrappers:*\n${foundWrappers.map(w => `  • ${w}`).join('\n')}\n\n`;
        }
        if (innerKeys.length > 0) {
            report += `*📂 Inner message keys:*\n${innerKeys.map(k => `  • ${k}`).join('\n')}\n\n`;
        }

        report += `*🔄 Normalized keys:*\n${normalKeys.map(k => `  • ${k}`).join('\n') || '  (same as top-level)'}\n\n`;

        if (directViewOnce.length > 0) {
            report += `*👁 Direct viewOnce=true:* ${directViewOnce.join(', ')}\n\n`;
        }
        if (normalViewOnce.length > 0) {
            report += `*👁 Normalized viewOnce=true:* ${normalViewOnce.join(', ')}\n\n`;
        }

        if (detected) {
            report += `*✅ VIEW-ONCE DETECTED*\n  Method: ${detected.method}\n  Media type: ${detected.mt}\n`;
        } else {
            report += `*❌ NOT detected as view-once*\n`;
        }

        return sock.sendMessage(chatId, { text: report }, { quoted: msg });
    }
};
