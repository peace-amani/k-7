import { getOwnerName } from '../../lib/menuHelper.js';
import { isChatLocked, lockChat, unlockChat, toggleChatLock } from '../../lib/chatlockStore.js';

const BRAND = () => getOwnerName().toUpperCase();

// Mute for ~68 years (effectively forever)
const MUTE_FOREVER = Math.floor(Date.now() / 1000) + 68 * 365 * 24 * 3600;

export default {
  name: 'chatlock',
  alias: ['lockchat'],
  description: 'Lock a chat: archives it (hides from main list) + mutes notifications across all linked devices. Groups also get silenced so only admins can send.',

  execute: async (sock, msg, args, PREFIX, extra) => {
    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    const isOwner = typeof extra?.isOwner === 'function' ? extra.isOwner() : !!extra?.isOwner;
    const isSudo  = typeof extra?.isSudo  === 'function' ? extra.isSudo()  : !!extra?.isSudo;

    let isGroupAdmin = false;
    let groupMeta = null;
    if (isGroup) {
      try {
        groupMeta = await sock.groupMetadata(chatId);
        const senderJid = msg.key.participant || chatId;
        const senderClean = senderJid.split(':')[0].split('@')[0];
        const senderP = groupMeta.participants.find(
          p => p.id.split(':')[0].split('@')[0] === senderClean
        );
        isGroupAdmin = senderP?.admin === 'admin' || senderP?.admin === 'superadmin';
      } catch {}
    }

    if (!isOwner && !isSudo && !isGroupAdmin) {
      return sock.sendMessage(chatId, {
        text: '❌ Only admins or the bot owner can lock/unlock this chat.'
      }, { quoted: msg });
    }

    const sub = (args[0] || '').toLowerCase();

    if (sub === 'status') {
      const locked = isChatLocked(chatId);
      return sock.sendMessage(chatId, {
        text:
          `╭─⌈ 🔐 *CHAT LOCK STATUS* ⌋\n` +
          `├─⊷ Chat  : ${isGroup ? '👥 Group' : '💬 DM'}\n` +
          `├─⊷ Status: *${locked ? '🔒 LOCKED' : '🔓 UNLOCKED'}*\n` +
          `╰⊷ *Powered by ${BRAND()} TECH*`
      }, { quoted: msg });
    }

    if (sub === 'on' || sub === 'lock') {
      await applyLock(sock, msg, chatId, isGroup, true, BRAND);
      return;
    }

    if (sub === 'off' || sub === 'unlock') {
      await applyLock(sock, msg, chatId, isGroup, false, BRAND);
      return;
    }

    // No subcommand → toggle
    const nowLocked = !isChatLocked(chatId);
    await applyLock(sock, msg, chatId, isGroup, nowLocked, BRAND);
  },
};

async function applyLock(sock, msg, chatId, isGroup, lock, BRAND) {
  if (isChatLocked(chatId) === lock) {
    const state = lock ? 'already locked' : 'already unlocked';
    return sock.sendMessage(chatId, { text: `ℹ️ This chat is ${state}.` }, { quoted: msg });
  }

  if (lock) lockChat(chatId); else unlockChat(chatId);

  const errors = [];

  // 1. Archive (lock) or Unarchive (unlock) — hides/shows in main chat list across linked devices
  try {
    await sock.chatModify({ archive: lock }, chatId);
  } catch (e) {
    errors.push('archive');
  }

  // 2. Mute forever (lock) or Unmute (unlock) — hides notification content
  try {
    if (lock) {
      await sock.chatModify({ mute: MUTE_FOREVER }, chatId);
    } else {
      await sock.chatModify({ mute: null }, chatId);
    }
  } catch (e) {
    errors.push('mute');
  }

  // 3. Groups: announcement mode so only admins can send (lock) or reopen (unlock)
  if (isGroup) {
    try {
      await sock.groupSettingUpdate(chatId, lock ? 'announcement' : 'not_announcement');
    } catch (e) {
      errors.push('group-setting');
    }
  }

  const icon  = lock ? '🔒' : '🔓';
  const state = lock ? 'LOCKED' : 'UNLOCKED';

  const effects = lock
    ? [
        '├─⊷ 📂 Archived — hidden from main chat list',
        '├─⊷ 🔕 Muted — notifications suppressed',
        isGroup ? '├─⊷ 🚫 Only admins can send messages' : '├─⊷ 🤫 Bot ignores non-owner commands',
      ]
    : [
        '├─⊷ 📂 Unarchived — visible in main chat list',
        '├─⊷ 🔔 Notifications restored',
        isGroup ? '├─⊷ ✅ Everyone can send messages again' : '├─⊷ ✅ Bot responds to commands again',
      ];

  const note = errors.length
    ? `├─⊷ ⚠️ Partial: ${errors.join(', ')} step(s) failed\n`
    : '';

  return sock.sendMessage(chatId, {
    text:
      `╭─⌈ ${icon} *CHAT ${state}* ⌋\n` +
      effects.join('\n') + '\n' +
      note +
      `╰⊷ *Powered by ${BRAND()} TECH*`
  }, { quoted: msg });
}
