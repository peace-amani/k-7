import {
    normalizeMessageContent,
    downloadContentFromMessage,
    downloadMediaMessage,
    extractMessageContent,
    getContentType
} from '@whiskeysockets/baileys';

// ─── safe JSON serialiser ────────────────────────────────────────────────────

function safeJson(obj) {
    return JSON.stringify(obj, (k, v) => {
        if (v instanceof Uint8Array || Buffer.isBuffer(v)) {
            return `<Buffer ${v.length}B: 0x${Buffer.from(v).toString('hex').slice(0, 16)}${v.length > 8 ? '...' : ''}>`;
        }
        if (typeof v === 'bigint') return v.toString() + 'n';
        return v;
    }, 2);
}

// ─── view-once detection (mirrors index.js detectViewOnceMedia exactly) ──────

const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage'];
const TYPE_MAP = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio' };

function detectVo(raw) {
    if (!raw) return null;
    // Method 1: direct viewOnce flag
    for (const mt of MEDIA_TYPES) {
        if (raw[mt]?.viewOnce) return { method: 'M1-direct-flag', mt, media: raw[mt] };
    }
    // Method 2: viewOnce wrapper
    const voMsg = raw.viewOnceMessage?.message
        || raw.viewOnceMessageV2?.message
        || raw.viewOnceMessageV2Extension?.message;
    if (voMsg) {
        for (const mt of MEDIA_TYPES) {
            if (voMsg[mt]) return { method: 'M2-wrapper', mt, media: voMsg[mt] };
        }
    }
    // Method 3: ephemeral wrapping viewOnce
    if (raw.ephemeralMessage?.message) {
        const r = detectVo(raw.ephemeralMessage.message);
        if (r) return { method: `M3-ephemeral→${r.method}`, mt: r.mt, media: r.media };
    }
    // Method 4: normalizeMessageContent flag
    const norm = normalizeMessageContent(raw);
    if (norm && norm !== raw) {
        for (const mt of MEDIA_TYPES) {
            if (norm[mt]?.viewOnce) return { method: 'M4-normalize-flag', mt, media: norm[mt] };
        }
    }
    // Method 5: wrapper + normalize (flag stripped by normalize)
    if ((raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension) && norm) {
        for (const mt of MEDIA_TYPES) {
            if (norm[mt]) return { method: 'M5-wrapper+normalize', mt, media: norm[mt] };
        }
    }
    return null;
}

// ─── download readiness check ────────────────────────────────────────────────

function dlReadiness(media) {
    if (!media) return { ok: false, missing: ['media is null'], urlValid: false };
    const missing = ['url', 'mediaKey', 'directPath', 'fileEncSha256'].filter(f => !media[f]);
    const urlValid = typeof media.url === 'string' && media.url.startsWith('https://mmg.whatsapp.net/');
    const mediaKeyType = media.mediaKey ? (Buffer.isBuffer(media.mediaKey) ? 'Buffer' : media.mediaKey instanceof Uint8Array ? 'Uint8Array' : typeof media.mediaKey) : 'missing';
    return { ok: missing.length === 0, missing, urlValid, mediaKeyType };
}

// ─── Baileys chain analysis ──────────────────────────────────────────────────

function analyzeBaileysChain(raw) {
    const lines = [];
    if (!raw) return ['(no raw message)'];

    // What extractMessageContent sees
    const extracted = extractMessageContent(raw);
    lines.push(`extractMessageContent() → ${extracted ? Object.keys(extracted).join(', ') : 'null'}`);

    // What getContentType returns
    const ct = extracted ? getContentType(extracted) : null;
    lines.push(`getContentType()         → ${ct || 'null'}`);

    // What mediaType downloadMediaMessage would derive
    const mediaType = ct ? ct.replace('Message', '') : null;
    lines.push(`derived mediaType        → ${mediaType || 'null'}`);

    // HKDF key mapping
    const HKDF = { audio: 'Audio', document: 'Document', gif: 'Video', image: 'Image', ppic: '', product: 'Image', ptt: 'Audio', sticker: 'Image', video: 'Video' };
    const hkdfInfo = mediaType ? (HKDF[mediaType] ? `"WhatsApp ${HKDF[mediaType]} Keys"` : `UNKNOWN (type="${mediaType}" not in map)`) : 'N/A';
    lines.push(`HKDF info key            → ${hkdfInfo}`);

    // URL validity as downloadContentFromMessage sees it
    const media = extracted && ct ? extracted[ct] : null;
    if (media) {
        const urlOk = typeof media.url === 'string' && media.url.startsWith('https://mmg.whatsapp.net/');
        lines.push(`URL valid for CDN DL     → ${urlOk ? '✅ YES' : '❌ NO (will use directPath fallback)'}`);
        if (!urlOk && media.directPath) {
            lines.push(`directPath fallback URL  → https://mmg.whatsapp.net${media.directPath.substring(0, 60)}...`);
        }
    }
    return lines;
}

// ─── command ─────────────────────────────────────────────────────────────────

export default {
    name: 'messagetype',
    aliases: ['msgtype', 'mtype'],
    category: 'owner',
    description: 'Deep debug: full structure + Baileys chain + live download test for any replied message',
    ownerOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager, store } = extra;

        if (!jidManager.isOwner(msg)) {
            return sock.sendMessage(chatId, { text: '❌ *Owner Only Command!*' }, { quoted: msg });
        }

        // ── Step 1: Get the quoted message ───────────────────────────────────
        const ctxInfo = (() => {
            if (!msg.message) return null;
            for (const key of Object.keys(msg.message)) {
                const ctx = msg.message[key]?.contextInfo;
                if (ctx) return ctx;
            }
            return null;
        })();

        const quotedPartial = ctxInfo?.quotedMessage || null;
        const quotedId = ctxInfo?.stanzaId || null;
        const quotedParticipant = ctxInfo?.participant || msg.key.remoteJid;

        if (!quotedPartial && !quotedId) {
            return sock.sendMessage(chatId, {
                text: '↩️ *Reply to any message* with `.mtype` to inspect it.\n\nWorks in DMs and Groups.\nFor view-once: reply to the view-once message before it expires.'
            }, { quoted: msg });
        }

        // ── Step 2: Try to get full message from store ───────────────────────
        let rawFull = null;
        if (store && quotedId) {
            try {
                // Try the current chat first, then the quoted participant's chat
                const candidates = [chatId, quotedParticipant];
                for (const jid of candidates) {
                    const found = store.getMessage(jid, quotedId);
                    if (found?.message) { rawFull = found.message; break; }
                }
            } catch {}
        }

        const source = rawFull ? 'store (full)' : 'contextInfo (partial)';
        const raw = rawFull || quotedPartial;

        // ── Step 3: Structural analysis ──────────────────────────────────────
        const topKeys = raw ? Object.keys(raw) : [];
        const norm = raw ? normalizeMessageContent(raw) : null;
        const normKeys = norm ? Object.keys(norm) : [];

        const wrappers = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'ephemeralMessage'];
        const foundWrappers = raw ? wrappers.filter(w => raw[w]) : [];

        const innerKeys = [];
        for (const w of foundWrappers) {
            const inner = raw[w]?.message;
            if (inner) Object.keys(inner).forEach(k => innerKeys.push(`${w}.message.${k}`));
        }

        const directVo = raw ? MEDIA_TYPES.filter(mt => raw[mt]?.viewOnce === true) : [];
        const normVo = norm ? MEDIA_TYPES.filter(mt => norm[mt]?.viewOnce === true) : [];
        const det = raw ? detectVo(raw) : null;
        const dlInfo = det ? dlReadiness(det.media) : null;
        const baileyChain = raw ? analyzeBaileysChain(raw) : [];

        // ── Step 4: Build summary ─────────────────────────────────────────────
        const isGroup = chatId.endsWith('@g.us');
        const senderNum = quotedParticipant.split('@')[0].split(':')[0];

        let out = `*🔬 DEEP MESSAGE INSPECTOR*\n`;
        out += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
        out += `*Chat:*    ${isGroup ? '👥 Group' : '💬 DM'}\n`;
        out += `*From:*    +${senderNum}\n`;
        if (quotedId) out += `*MsgID:*   ${quotedId}\n`;
        out += `*Source:*  ${source}\n`;
        out += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Structure
        out += `*📦 Top-level keys (${topKeys.length}):*\n`;
        out += topKeys.map(k => `  \`${k}\``).join('  ') + '\n\n';

        if (normKeys.join(',') !== topKeys.join(',')) {
            out += `*🔄 After normalizeMessageContent (${normKeys.length}):*\n`;
            out += normKeys.map(k => `  \`${k}\``).join('  ') + '\n\n';
        }

        if (foundWrappers.length) {
            out += `*🔐 Wrappers found:*  ${foundWrappers.map(w => `\`${w}\``).join(', ')}\n`;
        }
        if (innerKeys.length) {
            out += `*📂 Inner keys:*  ${innerKeys.map(k => `\`${k}\``).join(', ')}\n`;
        }
        if (foundWrappers.length || innerKeys.length) out += '\n';

        if (directVo.length) out += `*👁 viewOnce=true (direct):*  ${directVo.join(', ')}\n`;
        if (normVo.length && normVo.join(',') !== directVo.join(',')) {
            out += `*👁 viewOnce=true (after normalize):*  ${normVo.join(', ')}\n`;
        }
        if (directVo.length || normVo.length) out += '\n';

        // View-once detection result
        if (det) {
            out += `*✅ VIEW-ONCE DETECTED*\n`;
            out += `  Detection method: \`${det.method}\`\n`;
            out += `  Media type key:   \`${det.mt}\`\n`;
            out += `  Media type:       \`${TYPE_MAP[det.mt] || det.mt}\`\n\n`;

            out += `*📥 Download readiness:*\n`;
            if (dlInfo.ok) {
                out += `  ✅ All required fields present\n`;
            } else {
                out += `  ❌ Missing: ${dlInfo.missing.join(', ')}\n`;
            }
            out += `  URL valid (mmg.whatsapp.net): ${dlInfo.urlValid ? '✅' : '❌'}\n`;
            out += `  mediaKey type: \`${dlInfo.mediaKeyType}\`\n`;
            out += `  fileLength: ${det.media.fileLength || 'N/A'} bytes\n\n`;
        } else {
            out += `*❌ NOT view-once*\n`;
            if (topKeys.some(k => MEDIA_TYPES.includes(k))) {
                out += `  (has media but no viewOnce flag or wrapper)\n`;
            }
            out += '\n';
        }

        // Baileys chain analysis
        out += `*🔗 Baileys download chain:*\n`;
        for (const line of baileyChain) {
            out += `  ${line}\n`;
        }

        await sock.sendMessage(chatId, { text: out }, { quoted: msg });

        // ── Step 5: Live download test ────────────────────────────────────────
        if (det && dlInfo.ok) {
            await sock.sendMessage(chatId, { text: `*⏳ Running live download test...*\n(attempting 2 methods, timeout 20s each)` });

            let dlResult = null;
            const mediaType = TYPE_MAP[det.mt];
            const cleanMedia = { ...det.media };
            delete cleanMedia.viewOnce;

            // Method A: downloadMediaMessage (Baileys high-level, with reupload)
            const t1 = Date.now();
            try {
                const reconstructedMsg = {
                    key: { remoteJid: chatId, id: quotedId || 'unknown', fromMe: false, participant: quotedParticipant },
                    message: { [det.mt]: cleanMedia }
                };
                const silentLogger = { level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => silentLogger };
                const buf = await Promise.race([
                    downloadMediaMessage(reconstructedMsg, 'buffer', {}, { logger: silentLogger, reuploadRequest: sock.updateMediaMessage }),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_20s')), 20000))
                ]);
                const ms = Date.now() - t1;
                dlResult = { method: 'A-downloadMediaMessage', ok: true, bytes: buf.length, ms, buf };
            } catch (eA) {
                const ms = Date.now() - t1;
                dlResult = { method: 'A-downloadMediaMessage', ok: false, err: eA.message, ms };
            }

            let dlResult2 = null;
            // Method B: downloadContentFromMessage (low-level, direct)
            if (!dlResult.ok) {
                const t2 = Date.now();
                try {
                    const stream = await Promise.race([
                        downloadContentFromMessage(cleanMedia, mediaType),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_20s')), 20000))
                    ]);
                    const chunks = [];
                    for await (const chunk of stream) {
                        chunks.push(chunk);
                        if (Buffer.concat(chunks).length > 15 * 1024 * 1024) break; // 15MB cap
                    }
                    const buf2 = Buffer.concat(chunks);
                    const ms = Date.now() - t2;
                    dlResult2 = { method: 'B-downloadContentFromMessage', ok: true, bytes: buf2.length, ms, buf: buf2 };
                } catch (eB) {
                    const ms = Date.now() - t2;
                    dlResult2 = { method: 'B-downloadContentFromMessage', ok: false, err: eB.message, ms };
                }
            }

            // Method C: with original media (viewOnce still on)
            let dlResult3 = null;
            if (!dlResult.ok && (!dlResult2 || !dlResult2.ok)) {
                const t3 = Date.now();
                try {
                    const stream3 = await Promise.race([
                        downloadContentFromMessage(det.media, mediaType),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_20s')), 20000))
                    ]);
                    const chunks3 = [];
                    for await (const chunk of stream3) {
                        chunks3.push(chunk);
                        if (Buffer.concat(chunks3).length > 15 * 1024 * 1024) break;
                    }
                    const buf3 = Buffer.concat(chunks3);
                    const ms = Date.now() - t3;
                    dlResult3 = { method: 'C-directMedia+viewOnce', ok: true, bytes: buf3.length, ms, buf: buf3 };
                } catch (eC) {
                    const ms = Date.now() - t3;
                    dlResult3 = { method: 'C-directMedia+viewOnce', ok: false, err: eC.message, ms };
                }
            }

            const successful = [dlResult, dlResult2, dlResult3].find(r => r?.ok);
            const all = [dlResult, dlResult2, dlResult3].filter(Boolean);

            let dlReport = `*📥 DOWNLOAD TEST RESULTS*\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
            for (const r of all) {
                if (r.ok) {
                    dlReport += `✅ *${r.method}*\n`;
                    dlReport += `   Bytes: ${r.bytes} (${Math.round(r.bytes / 1024)}KB)\n`;
                    dlReport += `   Time:  ${r.ms}ms\n`;
                } else {
                    dlReport += `❌ *${r.method}*\n`;
                    dlReport += `   Error: ${r.err}\n`;
                    dlReport += `   Time:  ${r.ms}ms\n`;
                }
            }

            if (successful) {
                dlReport += `\n*🎉 DOWNLOAD SUCCEEDED via ${successful.method}*\n`;
                dlReport += `   → This is the method antiviewonce should use\n`;
                await sock.sendMessage(chatId, { text: dlReport });

                // Send the actual media back as proof
                const buf = successful.buf;
                if (buf && buf.length > 0 && buf.length < 50 * 1024 * 1024) {
                    const mime = det.media.mimetype || (mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'audio/mpeg');
                    try {
                        if (mediaType === 'image') {
                            await sock.sendMessage(chatId, {
                                image: buf,
                                caption: `*✅ Live download proof* — ${Math.round(buf.length / 1024)}KB\nMethod: ${successful.method}`
                            });
                        } else if (mediaType === 'video') {
                            await sock.sendMessage(chatId, {
                                video: buf,
                                caption: `*✅ Live download proof* — ${Math.round(buf.length / 1024)}KB\nMethod: ${successful.method}`
                            });
                        } else if (mediaType === 'audio') {
                            await sock.sendMessage(chatId, {
                                audio: buf,
                                mimetype: mime,
                                caption: `*✅ Live download proof* — ${Math.round(buf.length / 1024)}KB`
                            });
                        }
                    } catch (sendErr) {
                        await sock.sendMessage(chatId, { text: `⚠️ Download OK but send failed: ${sendErr.message}` });
                    }
                }
            } else {
                dlReport += `\n*💥 ALL METHODS FAILED*\n`;
                dlReport += `   → The URL may have expired. Try again with a fresher view-once.\n`;
                dlReport += `   → If all views on the phone's WhatsApp opened it, the key may be invalidated.\n`;
                await sock.sendMessage(chatId, { text: dlReport });
            }
        } else if (det && !dlInfo.ok) {
            await sock.sendMessage(chatId, {
                text: `*⚠️ SKIPPED download test*\nMissing required fields: ${dlInfo.missing.join(', ')}\nCannot attempt download without them.`
            });
        }

        // ── Step 6: Raw JSON dump ─────────────────────────────────────────────
        if (raw) {
            const jsonText = safeJson(raw);
            const label = source;
            // Split into 3800-char chunks to avoid message size limits
            const MAX = 3800;
            const prefix = `*📋 Raw JSON* _(${label})_\n\`\`\`json\n`;
            const suffix = '\n```';
            const body = jsonText;
            const chunks = [];
            for (let i = 0; i < body.length; i += MAX) {
                chunks.push(body.slice(i, i + MAX));
            }
            for (let i = 0; i < chunks.length; i++) {
                const header = i === 0 ? prefix : `*📋 Raw JSON cont. (${i + 1}/${chunks.length})*\n\`\`\`json\n`;
                await sock.sendMessage(chatId, { text: header + chunks[i] + suffix });
            }
        }

        // ── Step 7: contextInfo partial (if different from store) ─────────────
        if (rawFull && quotedPartial && JSON.stringify(rawFull) !== JSON.stringify(quotedPartial)) {
            const qText = safeJson(quotedPartial);
            await sock.sendMessage(chatId, {
                text: `*📋 contextInfo quotedMessage* _(partial — may differ from original)_\n\`\`\`json\n${qText.slice(0, 3800)}\n\`\`\``
            });
        }
    }
};
