import { delay } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';

async function resolveJid(sock, jid, groupId) {
    if (!jid) return null;
    if (!jid.endsWith('@lid')) return jid;
    try {
        const metadata = await sock.groupMetadata(groupId);
        const match = metadata.participants.find(p => p.id === jid || p.lid === jid);
        if (match?.id && !match.id.endsWith('@lid')) return match.id;
        if (match?.phoneNumber) return match.phoneNumber + '@s.whatsapp.net';
    } catch {}
    return jid;
}

export default {
  name: 'block',
  description: 'Block a user (tag in group or auto-block in DM)',
  category: 'owner',
  async execute(sock, msg, args) {
    const { key, message, pushName } = msg;
    const isGroup = key.remoteJid.endsWith('@g.us');
    let target;

    if (isGroup) {
      const mentioned = message?.extendedTextMessage?.contextInfo?.mentionedJid;
      const quoted = message?.extendedTextMessage?.contextInfo?.participant;
      const rawTarget = (mentioned && mentioned.length > 0) ? mentioned[0] : quoted;

      if (!rawTarget) {
        return await sock.sendMessage(key.remoteJid, {
          text: `╭─⌈ 🐺 *BLOCK* ⌋\n│\n├─⊷ *Tag a user to block them*\n│  └⊷ Or reply to their message\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
        }, { quoted: msg });
      }
      target = await resolveJid(sock, rawTarget, key.remoteJid);
    } else {
      target = key.remoteJid;
    }

    if (!target || target.endsWith('@g.us')) {
      return await sock.sendMessage(key.remoteJid, {
        text: '⚠️ Cannot block a group.',
      }, { quoted: msg });
    }

    try {
      await sock.updateBlockStatus(target, 'block');
      await delay(1000);
      const num = target.split('@')[0];
      await sock.sendMessage(key.remoteJid, {
        text: `🕸️ *Blocked successfully.*\n\n❌ +${num} has been blocked.`,
      }, { quoted: msg });
    } catch (err) {
      console.error('[BLOCK] Error:', err?.message || err);
      await sock.sendMessage(key.remoteJid, {
        text: `⚠️ Failed to block. Make sure I have the right permissions.\n\n_Error: ${err?.message || 'Unknown'}_`,
      }, { quoted: msg });
    }
  },
};
