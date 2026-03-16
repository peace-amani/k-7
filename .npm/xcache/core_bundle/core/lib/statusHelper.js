import { downloadContentFromMessage, jidNormalizedUser } from '@whiskeysockets/baileys';
import { getPhoneFromLid } from './sudo-store.js';

// ─── Core poster ──────────────────────────────────────────────────────────────
export async function postPersonalStatus(sock, content, statusJidList, extraOpts = {}) {
    return sock.sendMessage('status@broadcast', content, {
        ...extraOpts,
        statusJidList
    });
}

// ─── Media downloader ─────────────────────────────────────────────────────────
export async function downloadStatusMedia(message, type) {
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

// ─── Quoted message → status content ─────────────────────────────────────────
export async function processQuotedForStatus(quoted, captionOverride) {
    if (quoted.imageMessage) {
        const m = await downloadStatusMedia(quoted.imageMessage, 'image');
        return {
            content: { image: m.buffer, mimetype: m.mimetype, caption: captionOverride || quoted.imageMessage.caption || '' },
            mediaType: 'Image'
        };
    }
    if (quoted.videoMessage) {
        const m = await downloadStatusMedia(quoted.videoMessage, 'video');
        return {
            content: { video: m.buffer, mimetype: m.mimetype, caption: captionOverride || quoted.videoMessage.caption || '' },
            mediaType: 'Video'
        };
    }
    if (quoted.audioMessage) {
        const m = await downloadStatusMedia(quoted.audioMessage, 'audio');
        return {
            content: { audio: m.buffer, mimetype: m.mimetype || 'audio/mp4', ptt: quoted.audioMessage.ptt || false },
            mediaType: 'Audio'
        };
    }
    if (quoted.stickerMessage) {
        const m = await downloadStatusMedia(quoted.stickerMessage, 'sticker');
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

// ─── Contact list cache ───────────────────────────────────────────────────────
let _statusContactsCache = null;
let _statusContactsCacheTs = 0;
const STATUS_CONTACTS_TTL = 60 * 60 * 1000; // 1 hour

// Normalize JID — strips device suffix (e.g. 254xxx:0@s.whatsapp.net → 254xxx@s.whatsapp.net)
const normalizePnJid = (jid) => {
    if (!jid || typeof jid !== 'string') return null;
    if (jid.endsWith('@s.whatsapp.net')) {
        try { return jidNormalizedUser(jid); } catch { return jid.replace(/:\d+@/, '@'); }
    }
    return null;
};

const isValidPnJid = (jid) => {
    const n = normalizePnJid(jid);
    return !!n && n.endsWith('@s.whatsapp.net');
};

function resolveLidJid(jid, sock) {
    if (!jid || !jid.endsWith('@lid')) return null;
    const lidNum = jid.split('@')[0].split(':')[0];

    const cached = globalThis.lidPhoneCache?.get(lidNum);
    if (cached) return `${cached}@s.whatsapp.net`;

    const stored = getPhoneFromLid(lidNum);
    if (stored) return `${stored}@s.whatsapp.net`;

    try {
        const sig = sock?.signalRepository?.lidMapping;
        if (sig?.getPNForLID) {
            for (const fmt of [jid, `${lidNum}:0@lid`, `${lidNum}@lid`]) {
                try {
                    const pn = sig.getPNForLID(fmt);
                    if (pn) {
                        const num = String(pn).split('@')[0].replace(/[^0-9]/g, '');
                        if (num.length >= 7 && num !== lidNum) return `${num}@s.whatsapp.net`;
                    }
                } catch {}
            }
        }
    } catch {}

    return null;
}

function addParticipant(jid, jidSet, sock) {
    if (!jid) return;
    if (isValidPnJid(jid)) {
        // Always store the normalized (no-colon) form
        jidSet.add(normalizePnJid(jid));
        return;
    }
    if (jid.endsWith('@lid')) {
        const resolved = resolveLidJid(jid, sock);
        if (resolved) jidSet.add(resolved);
    }
}

export async function buildStatusJidList(sock) {
    const rawId   = globalThis.OWNER_JID || sock.user?.id || '';
    const numPart = rawId.split('@')[0].split(':')[0];
    const ownerJid = numPart ? `${numPart}@s.whatsapp.net` : null;

    const now = Date.now();
    if (_statusContactsCache && (now - _statusContactsCacheTs) < STATUS_CONTACTS_TTL) {
        const cached = new Set(_statusContactsCache);
        if (ownerJid) cached.add(ownerJid);
        return Array.from(cached);
    }

    const jidSet = new Set();

    for (const [jid] of (global.contactNames || new Map())) addParticipant(jid, jidSet, sock);

    for (const [, entry] of (globalThis.groupMetadataCache || new Map())) {
        for (const p of (entry?.data?.participants || [])) addParticipant(p.id, jidSet, sock);
    }

    let lidCount = 0, resolvedCount = 0;
    try {
        const groups = await Promise.race([
            sock.groupFetchAllParticipating(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
        ]);
        for (const [, group] of Object.entries(groups)) {
            for (const p of (group.participants || [])) {
                const before = jidSet.size;
                if (p.id?.endsWith('@lid')) lidCount++;
                addParticipant(p.id, jidSet, sock);
                if (p.id?.endsWith('@lid') && jidSet.size > before) resolvedCount++;
            }
        }
        console.log(`📱 [statusHelper] Fetched ${Object.keys(groups).length} groups — ${lidCount} LIDs, resolved ${resolvedCount}`);
    } catch (e) {
        console.log(`📱 [statusHelper] groupFetchAllParticipating skipped: ${e.message}`);
    }

    if (ownerJid) jidSet.add(ownerJid);

    const list = Array.from(jidSet);
    _statusContactsCache  = list;
    _statusContactsCacheTs = now;

    console.log(`📱 [statusHelper] statusJidList: ${list.length} contacts — cached 1h`);
    return list.length > 0 ? list : (ownerJid ? [ownerJid] : ['0@s.whatsapp.net']);
}

// Invalidate the cache (call after posting if you want a fresh list next time)
export function invalidateStatusCache() {
    _statusContactsCache  = null;
    _statusContactsCacheTs = 0;
}
