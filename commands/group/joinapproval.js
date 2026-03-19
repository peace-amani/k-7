import { getOwnerName } from '../../lib/menuHelper.js';

const BRAND = () => getOwnerName().toUpperCase();

export default {
  name: 'joinapproval',
  alias: ['approvalmode', 'joinmode', 'setapproval'],
  description: 'Toggle join-approval mode and member-add mode for the group.',

  execute: async (sock, msg, args, PREFIX, extra) => {
    const chatId = msg.key.remoteJid;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    let groupMeta;
    try {
      groupMeta = await sock.groupMetadata(chatId);
    } catch {
      return sock.sendMessage(chatId, { text: '❌ Failed to fetch group info.' }, { quoted: msg });
    }

    const senderJid = msg.key.participant || chatId;
    const senderClean = senderJid.split(':')[0].split('@')[0];
    const senderP = groupMeta.participants.find(p => p.id.split(':')[0].split('@')[0] === senderClean);
    const isAdmin = senderP?.admin === 'admin' || senderP?.admin === 'superadmin';
    const isOwner = typeof extra?.isOwner === 'function' ? extra.isOwner() : !!extra?.isOwner;
    const isSudo  = typeof extra?.isSudo  === 'function' ? extra.isSudo()  : !!extra?.isSudo;

    if (!isAdmin && !isOwner && !isSudo) {
      return sock.sendMessage(chatId, { text: '❌ Only group admins can change join-approval settings.' }, { quoted: msg });
    }

    const sub = (args[0] || '').toLowerCase();

    // Show status if no subcommand
    if (!sub || sub === 'status') {
      const approvalIcon = groupMeta.joinApprovalMode ? '🔒 ON' : '🔓 OFF';
      const addModeIcon  = groupMeta.memberAddMode     ? '👥 All members' : '👑 Admins only';
      return sock.sendMessage(chatId, {
        text:
          `╭─⌈ 🛡️ *JOIN SETTINGS* ⌋\n` +
          `├─⊷ Join Approval : *${approvalIcon}*\n` +
          `├─⊷ Who Can Add   : *${addModeIcon}*\n` +
          `├─⊷ Use *${PREFIX}joinapproval on/off* to toggle approval\n` +
          `├─⊷ Use *${PREFIX}joinapproval addmode admin/all* to set add mode\n` +
          `╰⊷ *Powered by ${BRAND()} TECH*`
      }, { quoted: msg });
    }

    // Toggle join approval
    if (sub === 'on' || sub === 'off') {
      const enable = sub === 'on';
      try {
        await sock.groupJoinApprovalMode(chatId, enable ? 'on' : 'off');
        const icon = enable ? '🔒' : '🔓';
        const statusLine = enable
          ? 'New members via link must be approved by an admin.'
          : 'Members can join via link without approval.';
        return sock.sendMessage(chatId, {
          text:
            `╭─⌈ ${icon} *JOIN APPROVAL* ⌋\n` +
            `├─⊷ Status : *${enable ? 'ON' : 'OFF'}*\n` +
            `├─⊷ ${statusLine}\n` +
            `╰⊷ *Powered by ${BRAND()} TECH*`
        }, { quoted: msg });
      } catch (err) {
        return sock.sendMessage(chatId, {
          text: `❌ Failed to update join approval: ${err.message}`
        }, { quoted: msg });
      }
    }

    // Set member-add mode
    if (sub === 'addmode') {
      const mode = (args[1] || '').toLowerCase();
      if (mode !== 'admin' && mode !== 'all') {
        return sock.sendMessage(chatId, {
          text: `❌ Usage: *${PREFIX}joinapproval addmode admin* or *${PREFIX}joinapproval addmode all*`
        }, { quoted: msg });
      }
      const baileysMode = mode === 'admin' ? 'admin_add' : 'all_member_add';
      try {
        await sock.groupMemberAddMode(chatId, baileysMode);
        const desc = mode === 'admin' ? 'Only admins can add new members.' : 'All members can add others.';
        return sock.sendMessage(chatId, {
          text:
            `╭─⌈ 👥 *MEMBER ADD MODE* ⌋\n` +
            `├─⊷ Mode : *${mode === 'admin' ? 'Admins only' : 'All members'}*\n` +
            `├─⊷ ${desc}\n` +
            `╰⊷ *Powered by ${BRAND()} TECH*`
        }, { quoted: msg });
      } catch (err) {
        return sock.sendMessage(chatId, {
          text: `❌ Failed to update add mode: ${err.message}`
        }, { quoted: msg });
      }
    }

    // Unknown subcommand — show help
    return sock.sendMessage(chatId, {
      text:
        `╭─⌈ 🛡️ *JOIN APPROVAL HELP* ⌋\n` +
        `├─⊷ *${PREFIX}joinapproval*            — show current settings\n` +
        `├─⊷ *${PREFIX}joinapproval on*         — require approval to join\n` +
        `├─⊷ *${PREFIX}joinapproval off*        — allow free joining\n` +
        `├─⊷ *${PREFIX}joinapproval addmode admin* — only admins can add\n` +
        `├─⊷ *${PREFIX}joinapproval addmode all*   — all members can add\n` +
        `╰⊷ *Powered by ${BRAND()} TECH*`
    }, { quoted: msg });
  },
};
