import { createRequire } from 'module';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setActionSession } from '../../lib/actionSession.js';
import { getOwnerName } from '../../lib/menuHelper.js';

// Resolve a participant's actual phone JID — LIDs cannot be kicked directly
function resolvePhoneJid(targetP, fallbackJid) {
  if (!targetP) return fallbackJid;
  const id = targetP.id || fallbackJid;
  if (!id.includes('@lid')) return id;
  const pn = targetP.phoneNumber ? String(targetP.phoneNumber).replace(/[^0-9]/g, '') : null;
  if (pn) return `${pn}@s.whatsapp.net`;
  const lidNum = id.split(':')[0].split('@')[0];
  const cached = globalThis.lidPhoneCache?.get(lidNum);
  if (cached) return `${cached}@s.whatsapp.net`;
  return id;
}

const _requireKick = createRequire(import.meta.url);
let giftedBtnsKick;
try { giftedBtnsKick = _requireKick('gifted-btns'); } catch (e) {}

export default {
  name: 'kick',
  description: 'Removes mentioned members or specified numbers from the group.',
  execute: async (sock, msg, args, PREFIX, extra) => {
    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    if (!isGroup) {
      return sock.sendMessage(chatId, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                        msg.message?.imageMessage?.contextInfo ||
                        msg.message?.videoMessage?.contextInfo ||
                        msg.message?.documentMessage?.contextInfo ||
                        msg.message?.stickerMessage?.contextInfo || {};

    const mentionedUsers = contextInfo.mentionedJid || [];
    const numbersFromArgs = args.filter(arg => /^\d{7,15}$/.test(arg)).map(num => `${num}@s.whatsapp.net`);

    let participants = [];
    if (mentionedUsers.length > 0) {
      participants = mentionedUsers;
    } else if (numbersFromArgs.length > 0) {
      participants = numbersFromArgs;
    } else if (contextInfo.quotedMessage && contextInfo.participant) {
      participants = [contextInfo.participant];
    }

    if (!participants.length) {
      return sock.sendMessage(chatId, {
        text: `╭─⌈ 👢 *KICK* ⌋\n│\n├─⊷ *${PREFIX}kick @user*\n│  └⊷ Kick mentioned user\n├─⊷ *${PREFIX}kick* (reply to msg)\n│  └⊷ Kick replied user\n├─⊷ *${PREFIX}kick 1234567890*\n│  └⊷ Kick by phone number\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: msg });
    }

    const senderJid = msg.key.participant || chatId;

    let groupMeta;
    try {
      groupMeta = await sock.groupMetadata(chatId);
    } catch {
      return sock.sendMessage(chatId, { text: '❌ Failed to fetch group info.' }, { quoted: msg });
    }

    const senderClean = senderJid.split(':')[0].split('@')[0];
    const senderParticipant = groupMeta.participants.find(p => {
      const pClean = p.id.split(':')[0].split('@')[0];
      return pClean === senderClean;
    });
    const senderIsAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';
    const isOwner = extra?.isOwner ? extra.isOwner() : false;
    const isSudo = extra?.isSudo ? extra.isSudo() : false;

    if (!senderIsAdmin && !isOwner && !isSudo) {
      return sock.sendMessage(chatId, { text: '❌ Only group admins can use this command.' }, { quoted: msg });
    }

    const skipped = [];
    const toKick = [];

    for (const jid of participants) {
      const jidClean = jid.split(':')[0].split('@')[0];
      const targetP = groupMeta.participants.find(p => {
        const pClean = p.id.split(':')[0].split('@')[0];
        return pClean === jidClean;
      });

      if (targetP && (targetP.admin === 'admin' || targetP.admin === 'superadmin')) {
        if (!isOwner && !isSudo) {
          skipped.push(jid);
          continue;
        }
      }

      toKick.push(resolvePhoneJid(targetP, jid));
    }

    if (toKick.length === 0) {
      const reason = skipped.length > 0 ? 'Cannot kick admins.' : 'No valid users to kick.';
      return sock.sendMessage(chatId, { text: `❌ ${reason}` }, { quoted: msg });
    }

    const targetNames = toKick.map(j => `@${j.split('@')[0].split(':')[0]}`).join(', ');

    // BUTTON MODE: show confirm button, kickconfirm does the actual kick
    if (isButtonModeEnabled() && giftedBtnsKick?.sendInteractiveMessage) {
      const sessionKey = `kick:${senderClean}:${chatId.split('@')[0]}`;
      setActionSession(sessionKey, { action: 'remove', targets: toKick, chatId });
      const confirmText = `╭─⌈ 👢 *KICK CONFIRM* ⌋\n├─⊷ About to kick ${toKick.length} user(s):\n├─⊷ ${targetNames}\n├─⊷ Tap *Confirm Kick* to proceed.\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
      try {
        await giftedBtnsKick.sendInteractiveMessage(sock, chatId, {
          text: confirmText,
          footer: '⏳ Session expires in 5 minutes',
          interactiveButtons: [
            { type: 'quick_reply', display_text: '✅ Confirm Kick', id: `${PREFIX}kickconfirm` },
            { type: 'quick_reply', display_text: '❌ Cancel', id: `${PREFIX}kickcancel` }
          ]
        });
        return;
      } catch (e) {
        // Button send failed — fall through to direct kick
      }
    }

    // DEFAULT MODE (or button send failed): kick immediately
    try {
      await sock.groupParticipantsUpdate(chatId, toKick, 'remove');
      await sock.sendMessage(chatId, {
        text: `👢 Kicked ${toKick.length} user(s): ${targetNames}`,
        mentions: toKick
      }, { quoted: msg });
    } catch (err) {
      const skippedMsg = skipped.length ? `\n⚠️ Skipped ${skipped.length} admin(s).` : '';
      await sock.sendMessage(chatId, {
        text: `❌ Failed to kick user(s). Check my admin permissions.${skippedMsg}`
      }, { quoted: msg });
    }
  },
};
