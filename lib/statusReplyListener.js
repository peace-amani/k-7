import { downloadMediaMessage, normalizeMessageContent, jidNormalizedUser } from '@whiskeysockets/baileys';

const STATUS_JID = 'status@broadcast';
const statusMessageStore = new Map();
const MAX_STORE_SIZE = 200;
const MAX_STORE_AGE = 3 * 60 * 60 * 1000;

let cleanupInterval = null;

function storeStatusMessage(msg) {
  if (!msg?.key?.id || !msg.message) return;
  if (msg.key.remoteJid !== STATUS_JID) return;
  if (msg.key.fromMe) return;

  statusMessageStore.set(msg.key.id, {
    message: msg,
    timestamp: Date.now()
  });

  if (statusMessageStore.size > MAX_STORE_SIZE) {
    const oldest = statusMessageStore.keys().next().value;
    statusMessageStore.delete(oldest);
  }
}

function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of statusMessageStore.entries()) {
      if (now - entry.timestamp > MAX_STORE_AGE) {
        statusMessageStore.delete(id);
      }
    }
  }, 30 * 60 * 1000);
}

function isEmojiOnly(text) {
  if (!text) return false;
  const emojiPattern = /^[\p{Emoji_Presentation}\p{Emoji}\u200d\uFE0F\u20E3\u{E0020}-\u{E007F}\u{1F1E0}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]+$/u;
  return emojiPattern.test(text.trim());
}

function getRealNumber(jid) {
  if (!jid) return 'Unknown';
  const num = jid.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
  return num.length >= 10 ? `+${num}` : jid.split('@')[0];
}

function getMediaType(msgContent) {
  if (msgContent?.imageMessage) return { type: 'image', media: msgContent.imageMessage, caption: msgContent.imageMessage.caption || '' };
  if (msgContent?.videoMessage) return { type: 'video', media: msgContent.videoMessage, caption: msgContent.videoMessage.caption || '' };
  if (msgContent?.audioMessage) return { type: 'audio', media: msgContent.audioMessage, caption: '' };
  if (msgContent?.stickerMessage) return { type: 'sticker', media: msgContent.stickerMessage, caption: '' };
  if (msgContent?.documentMessage) return { type: 'document', media: msgContent.documentMessage, caption: msgContent.documentMessage.caption || '' };
  return null;
}

function getTextContent(msgContent) {
  if (msgContent?.extendedTextMessage?.text) return msgContent.extendedTextMessage.text;
  if (msgContent?.conversation) return msgContent.conversation;
  return null;
}

export function initStatusReplyListener(sock, ownerJid) {
  if (!sock) return;

  let resolvedOwner = ownerJid;

  function getOwnerJid() {
    if (resolvedOwner) return resolvedOwner;
    resolvedOwner = global.OWNER_CLEAN_JID || ownerJid;
    return resolvedOwner;
  }

  startCleanup();

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key?.remoteJid === STATUS_JID && !msg.key.fromMe) {
        storeStatusMessage(msg);
      }

      if (!msg.key?.fromMe) continue;
      if (msg.key.remoteJid !== STATUS_JID) continue;

      const rawContent = normalizeMessageContent(msg.message) || msg.message;
      if (!rawContent) continue;

      const replyContext = rawContent?.extendedTextMessage?.contextInfo ||
                           rawContent?.imageMessage?.contextInfo ||
                           rawContent?.videoMessage?.contextInfo;

      if (!replyContext?.stanzaId) continue;

      const replyText = getTextContent(rawContent);
      if (!replyText) continue;

      const repliedMsgId = replyContext.stanzaId;
      const repliedParticipant = replyContext.participant;

      let cachedEntry = statusMessageStore.get(repliedMsgId);
      let statusMsg = cachedEntry?.message;

      if (!statusMsg && replyContext.quotedMessage) {
        statusMsg = {
          key: { remoteJid: STATUS_JID, id: repliedMsgId, participant: repliedParticipant },
          message: replyContext.quotedMessage,
          pushName: ''
        };
      }

      if (!statusMsg) continue;

      const statusContent = normalizeMessageContent(statusMsg.message) || statusMsg.message;
      if (!statusContent) continue;

      const senderJid = statusMsg.key?.participant || repliedParticipant || 'unknown';
      const senderNumber = getRealNumber(senderJid);
      const pushName = statusMsg.pushName || '';
      const currentOwner = getOwnerJid();
      if (!currentOwner) continue;
      const normalizedOwner = jidNormalizedUser(currentOwner);

      const mediaInfo = getMediaType(statusContent);
      const textContent = getTextContent(statusContent);

      try {
        if (mediaInfo) {
          const silentLogger = { level: 'silent', trace: ()=>{}, debug: ()=>{}, info: ()=>{}, warn: ()=>{}, error: ()=>{}, fatal: ()=>{}, child: ()=>({ level:'silent', trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child:()=>({}) }) };

          const dlMsg = statusMsg.message ? statusMsg : {
            key: { remoteJid: STATUS_JID, id: repliedMsgId, participant: senderJid },
            message: statusMsg.message || replyContext.quotedMessage
          };

          const buffer = await Promise.race([
            downloadMediaMessage(dlMsg, 'buffer', {}, { logger: silentLogger, reuploadRequest: sock.updateMediaMessage }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('dl_timeout')), 20000))
          ]);

          if (buffer && buffer.length > 0) {
            let caption = `╭─⌈ 📲 *STATUS CAPTURED* ⌋\n`;
            caption += `│ 👤 *From:* ${pushName ? pushName + ' ' : ''}(${senderNumber})\n`;
            if (mediaInfo.caption) caption += `│ 💬 *Caption:* ${mediaInfo.caption}\n`;
            caption += `│ ⏰ *Time:* ${new Date().toLocaleTimeString()}\n`;
            caption += `│ 🔄 *Via:* ${isEmojiOnly(replyText) ? `Emoji (${replyText})` : `Reply: "${replyText}"`}\n`;
            caption += `╰───`;

            const payload = {};
            if (mediaInfo.type === 'sticker') {
              payload.sticker = buffer;
            } else {
              payload[mediaInfo.type] = buffer;
              payload.caption = caption;
            }

            await sock.sendMessage(normalizedOwner, payload);

            if (mediaInfo.type === 'sticker') {
              await sock.sendMessage(normalizedOwner, { text: caption });
            }

            console.log(`[StatusReply] ✅ Forwarded ${mediaInfo.type} status from ${senderNumber} to owner DM`);
          }
        } else if (textContent) {
          let caption = `╭─⌈ 📲 *STATUS CAPTURED* ⌋\n`;
          caption += `│ 👤 *From:* ${pushName ? pushName + ' ' : ''}(${senderNumber})\n`;
          caption += `│ 📝 *Text:* ${textContent}\n`;
          caption += `│ ⏰ *Time:* ${new Date().toLocaleTimeString()}\n`;
          caption += `│ 🔄 *Via:* ${isEmojiOnly(replyText) ? `Emoji (${replyText})` : `Reply: "${replyText}"`}\n`;
          caption += `╰───`;

          await sock.sendMessage(normalizedOwner, { text: caption });
          console.log(`[StatusReply] ✅ Forwarded text status from ${senderNumber} to owner DM`);
        }
      } catch (err) {
        if (err.message !== 'dl_timeout') {
          console.log(`[StatusReply] ❌ Failed to forward status: ${err.message}`);
        }
      }
    }
  });

  sock.ev.on('messages.reaction', async (reactions) => {
    for (const reaction of reactions) {
      try {
        if (!reaction.reaction?.text || !reaction.key) continue;

        const reactedChatId = reaction.key.remoteJid;
        if (reactedChatId !== STATUS_JID) continue;

        const reactorJid = reaction.reaction.key?.participant || reaction.reaction.key?.remoteJid;
        const currentOwner = getOwnerJid();
        if (!currentOwner) continue;

        const normalizedOwner = jidNormalizedUser(currentOwner);
        const botJid = jidNormalizedUser(sock.user?.id || '');
        const normalizedReactor = reactorJid ? jidNormalizedUser(reactorJid) : '';
        if (normalizedReactor !== normalizedOwner && normalizedReactor !== botJid) continue;

        const reactedMsgId = reaction.key.id;
        const reactionEmoji = reaction.reaction.text;

        let cachedEntry = statusMessageStore.get(reactedMsgId);
        let statusMsg = cachedEntry?.message;

        if (!statusMsg) {
          try {
            statusMsg = store?.getMessage?.(reactedChatId, reactedMsgId);
          } catch {}
        }
        if (!statusMsg || !statusMsg.message) continue;

        const statusContent = normalizeMessageContent(statusMsg.message) || statusMsg.message;
        if (!statusContent) continue;

        const senderJid = statusMsg.key?.participant || reaction.key.participant || 'unknown';
        const senderNumber = getRealNumber(senderJid);
        const pushName = statusMsg.pushName || '';

        const mediaInfo = getMediaType(statusContent);
        const textContent = getTextContent(statusContent);

        const silentLogger = { level: 'silent', trace: ()=>{}, debug: ()=>{}, info: ()=>{}, warn: ()=>{}, error: ()=>{}, fatal: ()=>{}, child: ()=>({ level:'silent', trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child:()=>({}) }) };

        if (mediaInfo) {
          const buffer = await Promise.race([
            downloadMediaMessage(statusMsg, 'buffer', {}, { logger: silentLogger, reuploadRequest: sock.updateMediaMessage }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('dl_timeout')), 20000))
          ]);

          if (buffer && buffer.length > 0) {
            let caption = `╭─⌈ 📲 *STATUS CAPTURED* ⌋\n`;
            caption += `│ 👤 *From:* ${pushName ? pushName + ' ' : ''}(${senderNumber})\n`;
            if (mediaInfo.caption) caption += `│ 💬 *Caption:* ${mediaInfo.caption}\n`;
            caption += `│ ⏰ *Time:* ${new Date().toLocaleTimeString()}\n`;
            caption += `│ 🔄 *Via:* Reaction (${reactionEmoji})\n`;
            caption += `╰───`;

            const payload = {};
            if (mediaInfo.type === 'sticker') {
              payload.sticker = buffer;
            } else {
              payload[mediaInfo.type] = buffer;
              payload.caption = caption;
            }

            await sock.sendMessage(normalizedOwner, payload);
            if (mediaInfo.type === 'sticker') {
              await sock.sendMessage(normalizedOwner, { text: caption });
            }
            console.log(`[StatusReply] ✅ Forwarded ${mediaInfo.type} status via reaction from ${senderNumber}`);
          }
        } else if (textContent) {
          let caption = `╭─⌈ 📲 *STATUS CAPTURED* ⌋\n`;
          caption += `│ 👤 *From:* ${pushName ? pushName + ' ' : ''}(${senderNumber})\n`;
          caption += `│ 📝 *Text:* ${textContent}\n`;
          caption += `│ ⏰ *Time:* ${new Date().toLocaleTimeString()}\n`;
          caption += `│ 🔄 *Via:* Reaction (${reactionEmoji})\n`;
          caption += `╰───`;

          await sock.sendMessage(normalizedOwner, { text: caption });
          console.log(`[StatusReply] ✅ Forwarded text status via reaction from ${senderNumber}`);
        }
      } catch (err) {
        if (err.message !== 'dl_timeout') {
          console.log(`[StatusReply] ❌ Reaction capture failed: ${err.message}`);
        }
      }
    }
  });

  console.log('[StatusReply] ✅ Status emoji reply listener initialized');
}
