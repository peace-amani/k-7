import { downloadMediaMessage, getContentType } from '@whiskeysockets/baileys';
import db from '../../lib/database.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const publicModeChatCooldowns = new Map();
const PUBLIC_MODE_COOLDOWN_MS = 5000;

function resolveRealNumber(jid, groupMeta) {
    if (!jid) return 'Unknown';
    const raw = jid.split('@')[0].split(':')[0];
    if (!jid.includes('@lid')) return raw;
    const cache = globalThis.lidPhoneCache;
    if (cache) {
        const cached = cache.get(raw) || cache.get(jid.split('@')[0]);
        if (cached) return cached;
    }
    if (groupMeta?.participants) {
        for (const p of groupMeta.participants) {
            const pid = p.id || '';
            const plid = p.lid || '';
            const plidNum = plid.split('@')[0].split(':')[0];
            const pidNum = pid.split('@')[0].split(':')[0];
            if (plidNum === raw || pidNum === raw) {
                if (pid && !pid.includes('@lid')) {
                    const phone = pid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                    if (phone.length >= 7) {
                        if (cache) cache.set(raw, phone);
                        return phone;
                    }
                }
                if (p.phoneNumber) {
                    const phone = String(p.phoneNumber).replace(/[^0-9]/g, '');
                    if (phone.length >= 7) {
                        if (cache) cache.set(raw, phone);
                        return phone;
                    }
                }
            }
        }
    }
    return raw;
}

async function resolveNumberWithGroup(jid, chatJid) {
    if (!jid) return 'Unknown';
    const raw = jid.split('@')[0].split(':')[0];
    if (!jid.includes('@lid')) return raw;
    const cache = globalThis.lidPhoneCache;
    if (cache) {
        const cached = cache.get(raw) || cache.get(jid.split('@')[0]);
        if (cached) return cached;
    }
    if (chatJid?.includes('@g.us') && antieditState.sock) {
        try {
            const meta = await antieditState.sock.groupMetadata(chatJid);
            return resolveRealNumber(jid, meta);
        } catch {}
    }
    return raw;
}

let antieditState = {
    gc: { enabled: true, mode: 'private' },
    pm: { enabled: true, mode: 'private' },
    ownerJid: null,
    sock: null,
    messageHistory: new Map(),
    currentMessages: new Map(),
    mediaCache: new Map(),
    groupConfigs: new Map(),
    stats: {
        totalMessages: 0,
        editsDetected: 0,
        retrieved: 0,
        mediaCaptured: 0,
        sentToDm: 0,
        sentToChat: 0
    }
};

const defaultSettings = {
    gc: { enabled: true, mode: 'private' },
    pm: { enabled: true, mode: 'private' },
    groupConfigs: {},
    stats: {
        totalMessages: 0,
        editsDetected: 0,
        retrieved: 0,
        mediaCaptured: 0,
        sentToDm: 0,
        sentToChat: 0
    }
};

function getEffectiveConfig(chatId) {
    const isGroup = chatId?.endsWith('@g.us');
    if (isGroup) {
        const groupConf = antieditState.groupConfigs.get(chatId);
        if (groupConf && typeof groupConf === 'object' && groupConf.enabled !== undefined) {
            return groupConf;
        }
        return { enabled: antieditState.gc.enabled, mode: antieditState.gc.mode };
    } else {
        return { enabled: antieditState.pm.enabled, mode: antieditState.pm.mode };
    }
}

async function loadData() {
    try {
        const settings = await db.getConfig('antiedit_settings', defaultSettings);
        if (settings) {
            if (settings.gc) antieditState.gc = { ...antieditState.gc, ...settings.gc };
            if (settings.pm) antieditState.pm = { ...antieditState.pm, ...settings.pm };
            if (settings.enabled !== undefined && !settings.gc) {
                antieditState.gc.enabled = settings.enabled;
                antieditState.pm.enabled = settings.enabled;
            }
            if (settings.mode && !settings.gc) {
                antieditState.gc.mode = settings.mode;
                antieditState.pm.mode = settings.mode;
            }
            if (settings.groupConfigs && typeof settings.groupConfigs === 'object') {
                for (const [k, v] of Object.entries(settings.groupConfigs)) {
                    antieditState.groupConfigs.set(k, v);
                }
            }
            if (settings.stats) antieditState.stats = { ...antieditState.stats, ...settings.stats };
        }
        console.log(`✅ Antiedit: Loaded settings from DB (gc: ${antieditState.gc.mode}, pm: ${antieditState.pm.mode})`);
    } catch (error) {
        console.error('❌ Antiedit: Error loading data:', error.message);
    }
}

async function saveData() {
    try {
        const groupConfigsObj = {};
        for (const [k, v] of antieditState.groupConfigs.entries()) {
            groupConfigsObj[k] = v;
        }
        const settings = {
            gc: antieditState.gc,
            pm: antieditState.pm,
            groupConfigs: groupConfigsObj,
            stats: antieditState.stats
        };
        await db.setConfig('antiedit_settings', settings);
    } catch (error) {
        console.error('❌ Antiedit: Error saving data:', error.message);
    }
}

function getExtensionFromMime(mimetype) {
    const mimeToExt = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/3gpp': '.3gp',
        'audio/mpeg': '.mp3',
        'audio/mp4': '.m4a',
        'audio/ogg': '.ogg',
        'audio/aac': '.aac',
        'application/pdf': '.pdf'
    };
    
    return mimeToExt[mimetype] || '.bin';
}

async function downloadAndSaveMedia(msgId, message, messageType, mimetype, version = 1) {
    try {
        const buffer = await downloadMediaMessage(
            message,
            'buffer',
            {},
            {
                logger: { level: 'silent' },
                reuploadRequest: antieditState.sock.updateMediaMessage
            }
        );
        
        if (!buffer || buffer.length === 0) {
            return null;
        }
        
        const mediaKey = `${msgId}_v${version}`;

        antieditState.mediaCache.set(mediaKey, {
            buffer: buffer,
            type: messageType,
            mimetype: mimetype,
            size: buffer.length,
            version: version
        });

        const dbMediaId = `edit_${mediaKey}`;
        try {
            await db.uploadMedia(dbMediaId, buffer, mimetype, 'edits');
        } catch (dbErr) {
            console.error('⚠️ Antiedit: DB media upload failed:', dbErr.message);
        }
        
        antieditState.stats.mediaCaptured++;
        
        console.log(`📸 Antiedit: Saved ${messageType} media v${version}: ${mediaKey} (${Math.round(buffer.length/1024)}KB)`);
        return { mediaKey };
        
    } catch (error) {
        console.error('❌ Antiedit: Media download error:', error.message);
        return null;
    }
}

function extractMessageContent(message) {
    const msgContent = message.message;
    let type = 'text';
    let text = '';
    let hasMedia = false;
    let mimetype = '';
    
    if (msgContent?.conversation) {
        text = msgContent.conversation;
        type = 'text';
    } else if (msgContent?.extendedTextMessage?.text) {
        text = msgContent.extendedTextMessage.text;
        type = 'text';
    } else if (msgContent?.imageMessage) {
        type = 'image';
        text = msgContent.imageMessage.caption || '';
        hasMedia = true;
        mimetype = msgContent.imageMessage.mimetype || 'image/jpeg';
    } else if (msgContent?.videoMessage) {
        type = 'video';
        text = msgContent.videoMessage.caption || '';
        hasMedia = true;
        mimetype = msgContent.videoMessage.mimetype || 'video/mp4';
    } else if (msgContent?.audioMessage) {
        type = 'audio';
        hasMedia = true;
        mimetype = msgContent.audioMessage.mimetype || 'audio/mpeg';
        if (msgContent.audioMessage.ptt) {
            type = 'voice';
        }
    } else if (msgContent?.documentMessage) {
        type = 'document';
        text = msgContent.documentMessage.fileName || 'Document';
        hasMedia = true;
        mimetype = msgContent.documentMessage.mimetype || 'application/octet-stream';
    } else if (msgContent?.stickerMessage) {
        type = 'sticker';
        hasMedia = true;
        mimetype = msgContent.stickerMessage.mimetype || 'image/webp';
    } else if (msgContent?.contactMessage) {
        type = 'contact';
        text = 'Contact Message';
    } else if (msgContent?.locationMessage) {
        type = 'location';
        text = 'Location Message';
    }
    
    return { type, text, hasMedia, mimetype };
}

async function storeIncomingMessage(message, isEdit = false, originalMessageData = null) {
    try {
        if (!antieditState.sock) return null;
        
        const chatJidCheck = message.key?.remoteJid;
        const effectiveConf = getEffectiveConfig(chatJidCheck);
        if (!effectiveConf.enabled) return null;
        
        const msgKey = message.key;
        if (!msgKey || !msgKey.id || msgKey.fromMe) return null;
        
        const msgId = msgKey.id;
        const chatJid = msgKey.remoteJid;
        const senderJid = msgKey.participant || chatJid;
        const pushName = message.pushName || 'Unknown';
        const timestamp = message.messageTimestamp ? message.messageTimestamp * 1000 : Date.now();
        
        if (chatJid === 'status@broadcast') return null;
        
        let { type, text, hasMedia, mimetype } = extractMessageContent(message);

        let version = 1;
        let history = antieditState.messageHistory.get(msgId) || [];

        if (isEdit) {
            version = history.length + 1;
        } else {
            const existing = antieditState.currentMessages.get(msgId);
            if (existing) {
                isEdit = true;
                originalMessageData = existing;
                version = history.length + 1;
            }
        }

        if (isEdit) {
            // For edits we track text/caption only — skip pure media-only edits
            hasMedia = false;
            mimetype = '';
            // Allow empty text through — we still need to fire the notification
            // (original message might have had text even if new version is blank)
        } else {
            if (!text && !hasMedia) return null;
        }
        
        const messageData = {
            id: msgId,
            chatJid,
            senderJid,
            pushName,
            timestamp,
            type,
            text: text || '',
            hasMedia,
            mimetype,
            version: version,
            isEdit: isEdit,
            editTime: Date.now(),
            originalVersion: originalMessageData?.version || 1
        };
        
        antieditState.currentMessages.set(msgId, messageData);
        
        history.push({...messageData});
        antieditState.messageHistory.set(msgId, history);

        try {
            await db.storeAntideleteMessage(`edit_${msgId}`, messageData);
        } catch (dbErr) {
            console.error('⚠️ Antiedit: DB store failed:', dbErr.message);
        }
        
        if (!isEdit) {
            antieditState.stats.totalMessages++;
        } else {
            antieditState.stats.editsDetected++;
            
            setTimeout(async () => {
                const conf = getEffectiveConfig(chatJid);
                const notifyMode = conf.mode || 'private';

                if (notifyMode === 'private' || notifyMode === 'both') {
                    if (antieditState.ownerJid) {
                        await sendEditAlertToOwnerDM(originalMessageData, messageData, history);
                        antieditState.stats.sentToDm++;
                    }
                }
                if (notifyMode === 'chat' || notifyMode === 'both') {
                    const lastSend = publicModeChatCooldowns.get(chatJid) || 0;
                    if (Date.now() - lastSend >= PUBLIC_MODE_COOLDOWN_MS) {
                        publicModeChatCooldowns.set(chatJid, Date.now());
                        if (publicModeChatCooldowns.size > 200) {
                            const oldest = [...publicModeChatCooldowns.entries()].sort((a, b) => a[1] - b[1]).slice(0, 50);
                            oldest.forEach(([k]) => publicModeChatCooldowns.delete(k));
                        }
                        await sendEditAlertToChat(originalMessageData, messageData, history, chatJid);
                        antieditState.stats.sentToChat++;
                    }
                }
                antieditState.stats.retrieved++;
            }, 1000);
        }
        
        if (hasMedia) {
            setTimeout(async () => {
                try {
                    await downloadAndSaveMedia(msgId, message, type, mimetype, version);
                } catch (error) {
                    console.error('❌ Antiedit: Async media download failed:', error.message);
                }
            }, 1500);
        }
        
        if (antieditState.stats.totalMessages % 20 === 0) {
            await saveData();
        }
        
        return { messageData, isEdit, history };
        
    } catch (error) {
        console.error('❌ Antiedit: Error storing message:', error.message);
        return null;
    }
}

async function handleMessageUpdates(updates) {
    try {
        if (!antieditState.sock) return;

        for (const update of updates) {
            const msgKey = update.key;
            if (!msgKey?.id || msgKey.fromMe) continue;

            const msgId   = msgKey.id;
            const chatJid = msgKey.remoteJid;
            if (chatJid === 'status@broadcast') continue;

            const updMsg = update.update?.message;
            if (!updMsg) continue;

            // Try every known WhatsApp edit envelope structure
            let editedContent =
                updMsg.editedMessage?.message ||
                updMsg.protocolMessage?.editedMessage?.message ||
                (updMsg.protocolMessage?.type === 14 ? updMsg.protocolMessage?.editedMessage?.message : null) ||
                (updMsg.editedMessage && !updMsg.editedMessage.message ? updMsg.editedMessage : null) ||
                null;

            // Some clients send the content directly in updMsg without a wrapper
            if (!editedContent) {
                if (updMsg.conversation || updMsg.extendedTextMessage ||
                    updMsg.imageMessage || updMsg.videoMessage) {
                    editedContent = updMsg;
                }
            }

            if (!editedContent) continue;

            const editedText =
                editedContent.conversation ||
                editedContent.extendedTextMessage?.text ||
                editedContent.imageMessage?.caption ||
                editedContent.videoMessage?.caption || '';
            // Don't skip empty text — original may have had content; still alert

            // Look up original message — memory first, then DB
            let existingMessage = antieditState.currentMessages.get(msgId);
            if (!existingMessage) {
                try {
                    const dbMsg = await db.getAntideleteMessage(`edit_${msgId}`);
                    if (dbMsg) {
                        existingMessage = dbMsg;
                        antieditState.currentMessages.set(msgId, existingMessage);
                    }
                } catch {}
            }

            // If we never saw the original, create a placeholder so alerts don't crash
            if (!existingMessage) {
                existingMessage = {
                    id: msgId,
                    chatJid,
                    senderJid: msgKey.participant || chatJid,
                    pushName: update.pushName || 'Unknown',
                    timestamp: Date.now(),
                    type: 'unknown',
                    text: '[Original not captured]',
                    hasMedia: false,
                    version: 1,
                    isEdit: false,
                    editTime: Date.now()
                };
                antieditState.currentMessages.set(msgId, existingMessage);
            }

            console.log(`🔍 Antiedit: Detected edit for message ${msgId} in ${chatJid}`);

            const syntheticMsg = {
                key: msgKey,
                message: editedContent,
                pushName: existingMessage.pushName || update.pushName || '',
                messageTimestamp: Math.floor(Date.now() / 1000)
            };

            await storeIncomingMessage(syntheticMsg, true, existingMessage);
        }
    } catch (error) {
        console.error('❌ Antiedit: Error handling message updates:', error.message);
    }
}

async function getMediaBuffer(mediaKey) {
    const cached = antieditState.mediaCache.get(mediaKey);
    if (cached?.buffer) return cached.buffer;

    try {
        const dbMediaId = `edit_${mediaKey}`;
        const ext = cached?.mimetype?.split('/')[1]?.split(';')[0] || 'bin';
        const storagePath = `edits/${dbMediaId}.${ext}`;
        const buffer = await db.downloadMedia(storagePath);
        if (buffer) return buffer;
    } catch {}

    return null;
}

function cleanJid(jid) {
    if (!jid) return jid;
    // Strip device suffix (:12) so DM delivery works
    return jid.replace(/:\d+@/, '@');
}

function buildAlertText(originalMsg, editedMsg, forChat = false) {
    const orig = originalMsg.text?.trim()
        ? originalMsg.text.substring(0, forChat ? 200 : 400) + (originalMsg.text.length > (forChat ? 200 : 400) ? '…' : '')
        : originalMsg.hasMedia ? `[${originalMsg.type.toUpperCase()}]` : '[empty]';

    const edited = editedMsg.text?.trim()
        ? editedMsg.text.substring(0, forChat ? 200 : 400) + (editedMsg.text.length > (forChat ? 200 : 400) ? '…' : '')
        : editedMsg.hasMedia ? `[${editedMsg.type.toUpperCase()}]` : '[empty]';

    return (
        `✏️ *MESSAGE EDITED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📜 *Original:*\n${orig}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `✏️ *Edited to:*\n${edited}\n` +
        `━━━━━━━━━━━━━━━━━━━━━`
    );
}

async function sendEditAlertToOwnerDM(originalMsg, editedMsg, history) {
    try {
        if (!antieditState.sock || !antieditState.ownerJid) {
            console.error('❌ Antiedit: Socket or owner JID not set');
            return false;
        }

        const ownerJid     = cleanJid(antieditState.ownerJid);
        const senderNumber = await resolveNumberWithGroup(originalMsg.senderJid, originalMsg.chatJid);
        const chatLabel    = originalMsg.chatJid?.includes('@g.us')
            ? 'Group'
            : `+${await resolveNumberWithGroup(originalMsg.chatJid, null)}`;
        const editTime     = new Date(editedMsg.editTime || Date.now()).toLocaleTimeString();

        const header =
            `👤 *${originalMsg.pushName || 'Unknown'}* (+${senderNumber})\n` +
            `💬 ${chatLabel}  •  🕒 ${editTime}  •  v${originalMsg.version || 1}→v${editedMsg.version || 2}\n`;

        const body = buildAlertText(originalMsg, editedMsg, false);

        await antieditState.sock.sendMessage(ownerJid, { text: `${header}\n${body}` });

        console.log(`📤 Antiedit: DM alert sent to owner (${ownerJid})`);
        return true;

    } catch (error) {
        console.error('❌ Antiedit: Error sending edit alert to owner DM:', error.message);
        return false;
    }
}

async function sendEditAlertToChat(originalMsg, editedMsg, history, chatJid) {
    try {
        if (!antieditState.sock) return false;

        const senderNumber = await resolveNumberWithGroup(originalMsg.senderJid, chatJid);
        const editTime     = new Date(editedMsg.editTime || Date.now()).toLocaleTimeString();

        const header =
            `👤 *${originalMsg.pushName || 'Unknown'}* (+${senderNumber})  •  🕒 ${editTime}\n`;

        const body = buildAlertText(originalMsg, editedMsg, true);

        await antieditState.sock.sendMessage(chatJid, { text: `${header}\n${body}` });

        console.log(`📤 Antiedit: Chat alert sent to ${chatJid}`);
        return true;

    } catch (error) {
        console.error('❌ Antiedit: Error sending edit alert to chat:', error.message);
        return false;
    }
}

async function showMessageHistory(msgId, chatJid) {
    try {
        if (!antieditState.sock) return false;
        
        let history = antieditState.messageHistory.get(msgId);

        if (!history || history.length < 1) {
            try {
                const dbMsg = await db.getAntideleteMessage(`edit_${msgId}`);
                if (dbMsg) {
                    history = [dbMsg];
                }
            } catch {}
        }

        if (!history || history.length < 1) {
            await antieditState.sock.sendMessage(chatJid, { 
                text: `❌ No history found for this message.` 
            });
            return false;
        }
        
        const firstMessage = history[0];
        const latestMessage = history[history.length - 1];
        const senderNum = await resolveNumberWithGroup(firstMessage.senderJid, firstMessage.chatJid || chatJid);
        
        let historyText = `📜 *MESSAGE HISTORY*\n\n`;
        historyText += `👤 From: +${senderNum} (${firstMessage.pushName})\n`;
        historyText += `📅 Total versions: ${history.length}\n`;
        historyText += `🕒 First sent: ${new Date(firstMessage.timestamp).toLocaleString()}\n`;
        historyText += `✏️ Last edit: ${new Date(latestMessage.editTime || latestMessage.timestamp).toLocaleString()}\n`;
        
        historyText += `\n─────────────────\n`;
        
        history.forEach((msg, index) => {
            const version = index + 1;
            const time = new Date(msg.editTime || msg.timestamp).toLocaleTimeString();
            const prefix = msg.isEdit ? '✏️' : '📝';
            
            historyText += `\n${prefix} v${version} [${time}]: `;
            if (msg.text && msg.text.trim()) {
                historyText += `${msg.text.substring(0, 80)}`;
                if (msg.text.length > 80) historyText += '...';
            } else if (msg.hasMedia) {
                historyText += `[${msg.type.toUpperCase()} MEDIA]`;
            } else {
                historyText += `[Empty]`;
            }
        });
        
        historyText += `\n\n────────────\n`;
        historyText += `🔍 *History retrieved by antiedit*`;
        
        await antieditState.sock.sendMessage(chatJid, { text: historyText });
        return true;
        
    } catch (error) {
        console.error('❌ Antiedit: Error showing message history:', error.message);
        return false;
    }
}

function setupListeners(sock) {
    if (!sock) {
        console.error('❌ Antiedit: No socket provided');
        return;
    }
    
    antieditState.sock = sock;
    
    console.log('🚀 Antiedit: Setting up listeners...');
    
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
            // Accept both 'notify' (new) and 'append' (sometimes used for edits)
            if (type !== 'notify' && type !== 'append') return;

            for (const message of messages) {
                await storeIncomingMessage(message, false);
            }
        } catch (error) {
            console.error('❌ Antiedit: Message storage error:', error.message);
        }
    });
    
    sock.ev.on('messages.update', async (updates) => {
        try {
            
            await handleMessageUpdates(updates);
        } catch (error) {
            console.error('❌ Antiedit: Edit detection error:', error.message);
        }
    });
    
    sock.ev.on('connection.update', (update) => {
        if (update.connection === 'open') {
            console.log('✅ Antiedit: Connected and ready');
        }
    });
    
    console.log('✅ Antiedit: Listeners active');
}

async function initializeSystem(sock, ownerJid) {
    try {
        await loadData();

        // Prefer the explicitly passed owner JID (from OWNER_CLEAN_JID in index.js)
        // Fall back to sock.user.id only if nothing is provided
        if (ownerJid) {
            antieditState.ownerJid = ownerJid;
        } else if (sock.user?.id) {
            antieditState.ownerJid = sock.user.id;
        }
        console.log(`👑 Antiedit: Owner set to ${antieditState.ownerJid}`);

        setupListeners(sock);
        
        console.log(`🎯 Antiedit: System initialized`);
        console.log(`   Groups: ${antieditState.gc.enabled ? '✅' : '❌'} (${antieditState.gc.mode})`);
        console.log(`   PMs: ${antieditState.pm.enabled ? '✅' : '❌'} (${antieditState.pm.mode})`);
        console.log(`   Tracking: ${antieditState.currentMessages.size} messages`);
        console.log(`   History: ${antieditState.messageHistory.size} entries`);
        
        setInterval(async () => {
            if (antieditState.stats.totalMessages > 0) {
                await saveData();
            }
        }, 5 * 60 * 1000);
        
    } catch (error) {
        console.error('❌ Antiedit: Initialization error:', error.message);
    }
}

export async function initAntiedit(sock, ownerJid) {
    await initializeSystem(sock, ownerJid);
}

export function updateAntieditSock(sock) {
    if (!sock) return;
    antieditState.sock = sock;
    console.log('🔄 Antiedit: Socket updated after reconnect');
}

export function getAntieditInfo() {
    return {
        gc: { enabled: antieditState.gc.enabled, mode: antieditState.gc.mode },
        pm: { enabled: antieditState.pm.enabled, mode: antieditState.pm.mode }
    };
}

export default {
    name: 'antiedit',
    alias: ['editdetect', 'edited', 'ae'],
    description: 'Capture edited messages - public/private/off modes',
    category: 'utility',
    
    async execute(sock, msg, args, prefix, metadata = {}) {
        const chatId = msg.key.remoteJid;
        const command = args[0]?.toLowerCase() || 'status';
        
        if (!antieditState.sock) {
            antieditState.sock = sock;
            setupListeners(sock);
        }
        
        if (!antieditState.ownerJid && metadata.OWNER_JID) {
            antieditState.ownerJid = metadata.OWNER_JID;
        }
        if (!antieditState.ownerJid && sock.user?.id) {
            antieditState.ownerJid = sock.user.id;
        }
        
        const parts = args.map(a => a.toLowerCase());
        const scope = parts[0] || 'status';
        const action = parts[1] || '';

        if (scope === 'gc' || scope === 'group' || scope === 'groups') {
            if (action === 'off' || action === 'disable') {
                antieditState.gc.enabled = false;
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ❌ *ANTIEDIT GC: OFF* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            } else if (['private', 'prvt', 'priv', 'pm'].includes(action)) {
                antieditState.gc.enabled = true;
                antieditState.gc.mode = 'private';
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *ANTIEDIT GC: PRIVATE* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            } else if (['chat', 'cht', 'public'].includes(action)) {
                antieditState.gc.enabled = true;
                antieditState.gc.mode = 'chat';
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *ANTIEDIT GC: PUBLIC* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            } else if (['both', 'all'].includes(action)) {
                antieditState.gc.enabled = true;
                antieditState.gc.mode = 'both';
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *ANTIEDIT GC: BOTH* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            } else {
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✏️ *ANTIEDIT GC* ⌋\n├─⊷ *${prefix}antiedit gc private/public/both*\n├─⊷ *${prefix}antiedit gc off*\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            }
        } else if (scope === 'pm' || scope === 'dm' || scope === 'pms' || scope === 'dms') {
            if (action === 'off' || action === 'disable') {
                antieditState.pm.enabled = false;
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ❌ *ANTIEDIT PM: OFF* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            } else if (['private', 'prvt', 'priv'].includes(action)) {
                antieditState.pm.enabled = true;
                antieditState.pm.mode = 'private';
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *ANTIEDIT PM: PRIVATE* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            } else if (['chat', 'cht', 'public'].includes(action)) {
                antieditState.pm.enabled = true;
                antieditState.pm.mode = 'chat';
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *ANTIEDIT PM: PUBLIC* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            } else if (['both', 'all'].includes(action)) {
                antieditState.pm.enabled = true;
                antieditState.pm.mode = 'both';
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *ANTIEDIT PM: BOTH* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            } else {
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✏️ *ANTIEDIT PM* ⌋\n├─⊷ *${prefix}antiedit pm private/public/both*\n├─⊷ *${prefix}antiedit pm off*\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            }
        } else if (scope === 'off' || scope === 'disable') {
            antieditState.gc.enabled = false;
            antieditState.pm.enabled = false;
            await sock.sendMessage(chatId, {
                text: `╭─⌈ ❌ *ANTIEDIT: OFF* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        } else if (['private', 'prvt', 'priv'].includes(scope)) {
            antieditState.gc.enabled = true;
            antieditState.gc.mode = 'private';
            antieditState.pm.enabled = true;
            antieditState.pm.mode = 'private';
            await sock.sendMessage(chatId, {
                text: `╭─⌈ ✅ *ANTIEDIT: PRIVATE* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        } else if (['chat', 'cht', 'public'].includes(scope)) {
            antieditState.gc.enabled = true;
            antieditState.gc.mode = 'chat';
            antieditState.pm.enabled = true;
            antieditState.pm.mode = 'chat';
            await sock.sendMessage(chatId, {
                text: `╭─⌈ ✅ *ANTIEDIT: PUBLIC* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        } else if (['both', 'all'].includes(scope)) {
            antieditState.gc.enabled = true;
            antieditState.gc.mode = 'both';
            antieditState.pm.enabled = true;
            antieditState.pm.mode = 'both';
            await sock.sendMessage(chatId, {
                text: `╭─⌈ ✅ *ANTIEDIT: BOTH* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        } else if (scope === 'status' || scope === 'stats') {
            const isGroup = chatId.endsWith('@g.us');
            let groupLine = '';
            if (isGroup) {
                const gc = getEffectiveConfig(chatId);
                groupLine = `├─⊷ This Group: ${gc.enabled ? 'ON' : 'OFF'} (${gc.mode})\n`;
            }
            const statsText = `╭─⌈ 📊 *ANTIEDIT STATUS* ⌋\n` +
                `├─⊷ GC: ${antieditState.gc.enabled ? 'ON' : 'OFF'} (${antieditState.gc.mode})\n` +
                `├─⊷ PM: ${antieditState.pm.enabled ? 'ON' : 'OFF'} (${antieditState.pm.mode})\n` +
                `${groupLine}` +
                `├─⊷ Tracked: ${antieditState.currentMessages.size}\n` +
                `├─⊷ Edits: ${antieditState.stats.editsDetected} | Media: ${antieditState.stats.mediaCaptured}\n` +
                `├─⊷ DM: ${antieditState.stats.sentToDm} | Chat: ${antieditState.stats.sentToChat}\n╰───`;

            await sock.sendMessage(chatId, { text: statsText }, { quoted: msg });
        } else if (scope === 'history') {
            const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
            
            let targetMsgId;
            if (quotedId) {
                targetMsgId = quotedId;
            } else if (args[1]) {
                targetMsgId = args[1];
            }
            
            if (!targetMsgId) {
                return await sock.sendMessage(chatId, {
                    text: `╭─⌈ ❌ *ANTIEDIT HISTORY* ⌋\n├─⊷ Reply to a message with *${prefix}antiedit history*\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            }
            
            await showMessageHistory(targetMsgId, chatId);
        } else if (scope === 'test') {
            const testText = `╭─⌈ 🧪 *ANTIEDIT TEST* ⌋\n├─⊷ GC: ${antieditState.gc.enabled ? 'ON' : 'OFF'} | PM: ${antieditState.pm.enabled ? 'ON' : 'OFF'}\n├─⊷ Edit this message to test\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
            
            const testMsg = await sock.sendMessage(chatId, { 
                text: testText 
            });
            
            if (testMsg?.key) {
                const testData = {
                    id: testMsg.key.id,
                    chatJid: testMsg.key.remoteJid,
                    senderJid: antieditState.ownerJid || sock.user.id,
                    pushName: 'Antiedit Test',
                    timestamp: Date.now(),
                    type: 'text',
                    text: testText,
                    hasMedia: false,
                    version: 1,
                    isEdit: false
                };
                
                antieditState.currentMessages.set(testMsg.key.id, testData);
                antieditState.messageHistory.set(testMsg.key.id, [{...testData}]);

                try {
                    await db.storeAntideleteMessage(`edit_${testMsg.key.id}`, testData);
                } catch {}
                
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *TEST STORED* ⌋\n├─⊷ Now edit the previous message\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                });
            }
        } else if (scope === 'clear' || scope === 'clean' || scope === 'reset') {
            const historySize = antieditState.messageHistory.size;
            const currentSize = antieditState.currentMessages.size;
            const mediaSize = antieditState.mediaCache.size;
            
            antieditState.messageHistory.clear();
            antieditState.currentMessages.clear();
            antieditState.mediaCache.clear();
            antieditState.stats.totalMessages = 0;
            antieditState.stats.editsDetected = 0;
            antieditState.stats.retrieved = 0;
            antieditState.stats.mediaCaptured = 0;
            antieditState.stats.sentToDm = 0;
            antieditState.stats.sentToChat = 0;

            try {
                await db.cleanOlderThan('antidelete_messages', 'timestamp', 0);
            } catch {}

            await saveData();
            
            await sock.sendMessage(chatId, {
                text: `╭─⌈ 🧹 *ANTIEDIT CLEARED* ⌋\n├─⊷ ${historySize} history | ${currentSize} messages | ${mediaSize} media\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        } else if (scope === 'debug') {
            const debugText = `╭─⌈ 🔧 *ANTIEDIT DEBUG* ⌋\n` +
                `├─⊷ GC: ${antieditState.gc.enabled ? '✅' : '❌'} (${antieditState.gc.mode})\n` +
                `├─⊷ PM: ${antieditState.pm.enabled ? '✅' : '❌'} (${antieditState.pm.mode})\n` +
                `├─⊷ Socket: ${antieditState.sock ? '✅' : '❌'} | DB: ${db.isAvailable() ? '✅' : '❌'}\n` +
                `├─⊷ Msgs: ${antieditState.currentMessages.size} | History: ${antieditState.messageHistory.size}\n` +
                `├─⊷ Media: ${antieditState.mediaCache.size} | Groups: ${antieditState.groupConfigs.size}\n╰───`;
            await sock.sendMessage(chatId, { text: debugText }, { quoted: msg });
        } else if (scope === 'help' || scope === 'menu') {
            const helpText = `╭─⌈ ✏️ *ANTIEDIT* ⌋\n` +
                `├─⊷ *${prefix}antiedit private/public/both*\n` +
                `├─⊷ *${prefix}antiedit off*\n` +
                `├─⊷ *${prefix}antiedit gc private/public/both/off*\n` +
                `├─⊷ *${prefix}antiedit pm private/public/both/off*\n` +
                `├─⊷ *${prefix}antiedit status*\n` +
                `├─⊷ *${prefix}antiedit history* (reply)\n` +
                `├─⊷ *${prefix}antiedit test*\n` +
                `├─⊷ *${prefix}antiedit clear*\n` +
                `├─⊷ *${prefix}antiedit debug*\n╰───`;
            
            await sock.sendMessage(chatId, { text: helpText }, { quoted: msg });
        } else {
            await sock.sendMessage(chatId, {
                text: `╭─⌈ ✏️ *ANTIEDIT* ⌋\n├─⊷ *${prefix}antiedit help*\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        }
        
        await saveData();
    }
};
