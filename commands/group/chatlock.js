import { getOwnerName } from '../../lib/menuHelper.js';
import { isChatLocked, lockChat, unlockChat, toggleChatLock } from '../../lib/chatlockStore.js';

const BRAND = () => getOwnerName().toUpperCase();

export default {
  name: 'chatlock',
  alias: ['lockchat', 'lockchat'],
  description: 'Lock or unlock a chat. Groups: silences non-admins via WhatsApp setting + bot lock. DMs: bot ignores all commands from that chat.',

  execute: async (sock, msg, args, PREFIX, extra) => {
    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    const isOwner = typeof extra?.isOwner === 'function' ? extra.isOwner() : !!extra?.isOwner;
    const isSudo  = typeof extra?.isSudo  === 'function' ? extra.isSudo()  : !!extra?.isSudo;

    // For groups, also allow group admins to use this
    let isGroupAdmin = false;
    let groupMeta = null;
    if (isGroup) {
      try {
        groupMeta = await sock.groupMetadata(chatId);
        const senderJid = msg.key.participant || chatId;
        const senderClean = senderJid.split(':')[0].split('@')[0];
        const senderP = groupMeta.participants.find(p => p.id.split(':')[0].split('@')[0] === senderClean);
        isGroupAdmin = senderP?.admin === 'admin' || senderP?.admin === 'superadmin';
      } catch {}
    }

    if (!isOwner && !isSudo && !isGroupAdmin) {
      return sock.sendMessage(chatId, {
        text: '❌ Only admins or the bot owner can lock/unlock this chat.'
      }, { quoted: msg });
    }

    const sub = (args[0] || '').toLowerCase();

    // Status check
    if (sub === 'status') {
      const status = isChatLocked(chatId);
      return sock.sendMessage(chatId, {
        text:
          `╭─⌈ 🔐 *CHAT LOCK STATUS* ⌋\n` +
          `├─⊷ Chat  : ${isGroup ? '👥 Group' : '💬 DM'}\n` +
          `├─⊷ Status: *${status ? '🔒 LOCKED' : '🔓 UNLOCKED'}*\n` +
          `╰⊷ *Powered by ${BRAND()} TECH*`
      }, { quoted: msg });
    }

    // Explicit lock
    if (sub === 'on' || sub === 'lock') {
      await applyLock(sock, msg, chatId, isGroup, groupMeta, true, PREFIX, BRAND);
      return;
    }

    // Explicit unlock
    if (sub === 'off' || sub === 'unlock') {
      await applyLock(sock, msg, chatId, isGroup, groupMeta, false, PREFIX, BRAND);
      return;
    }

    // No subcommand — toggle
    const nowLocked = toggleChatLock(chatId);

    if (isGroup) {
      try {
        await sock.groupSettingUpdate(chatId, nowLocked ? 'announcement' : 'not_announcement');
      } catch {}
    }

    const icon  = nowLocked ? '🔒' : '🔓';
    const state = nowLocked ? 'LOCKED' : 'UNLOCKED';
    const desc  = nowLocked
      ? (isGroup
          ? 'Only admins can send messages. Bot ignores non-admin commands.'
          : 'Bot will ignore all commands from this chat.')
      : (isGroup
          ? 'Everyone can send messages again.'
          : 'Bot will respond to commands again.');

    return sock.sendMessage(chatId, {
      text:
        `╭─⌈ ${icon} *CHAT ${state}* ⌋\n` +
        `├─⊷ Chat : ${isGroup ? '👥 Group' : '💬 DM'}\n` +
        `├─⊷ ${desc}\n` +
        `╰⊷ *Powered by ${BRAND()} TECH*`
    }, { quoted: msg });
  },
};

async function applyLock(sock, msg, chatId, isGroup, groupMeta, lock, PREFIX, BRAND) {
  const already = isChatLocked(chatId) === lock;
  if (already) {
    const state = lock ? 'already locked' : 'already unlocked';
    return sock.sendMessage(chatId, {
      text: `ℹ️ This chat is ${state}.`
    }, { quoted: msg });
  }

  if (lock) lockChat(chatId); else unlockChat(chatId);

  if (isGroup) {
    try {
      await sock.groupSettingUpdate(chatId, lock ? 'announcement' : 'not_announcement');
    } catch {}
  }

  const icon  = lock ? '🔒' : '🔓';
  const state = lock ? 'LOCKED' : 'UNLOCKED';
  const desc  = lock
    ? (isGroup
        ? 'Only admins can send messages. Bot ignores non-admin commands.'
        : 'Bot will ignore all commands from this chat.')
    : (isGroup
        ? 'Everyone can send messages again.'
        : 'Bot will respond to commands again.');

  return sock.sendMessage(chatId, {
    text:
      `╭─⌈ ${icon} *CHAT ${state}* ⌋\n` +
      `├─⊷ Chat : ${isGroup ? '👥 Group' : '💬 DM'}\n` +
      `├─⊷ ${desc}\n` +
      `╰⊷ *Powered by ${BRAND()} TECH*`
  }, { quoted: msg });
}
