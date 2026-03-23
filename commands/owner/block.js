import { delay } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';
import { getPhoneFromLid } from '../../lib/sudo-store.js';

function resolveToPhoneJid(jid) {
    if (!jid) return null;
    if (!jid.endsWith('@lid')) return jid;
    const lidNum = jid.replace('@lid', '');
    const phone = (globalThis.lidPhoneCache?.get(lidNum))
        || getPhoneFromLid(lidNum)
        || getPhoneFromLid(jid);
    if (phone) return `${phone}@s.whatsapp.net`;
    return null;
}

async function resolveTarget(sock, rawJid, groupId) {
    if (!rawJid) return null;
    if (!rawJid.endsWith('@lid')) return rawJid;

    const fromCache = resolveToPhoneJid(rawJid);
    if (fromCache) return fromCache;

    if (groupId) {
        try {
            const metadata = await sock.groupMetadata(groupId);
            const match = metadata.participants.find(p => p.id === rawJid || p.lid === rawJid);
            if (match?.id && !match.id.endsWith('@lid')) return match.id;
        } catch {}
    }

    return null;
}

export default {
  name: 'block',
  description: 'Block a user (tag/reply in group or auto-block in DM)',
  category: 'owner',
  async execute(sock, msg, args) {
    const { key, message } = msg;
    const isGroup = key.remoteJid.endsWith('@g.us');
    let rawTarget;

    if (isGroup) {
      const mentioned = message?.extendedTextMessage?.contextInfo?.mentionedJid;
      const quoted   = message?.extendedTextMessage?.contextInfo?.participant;
      rawTarget = (mentioned && mentioned.length > 0) ? mentioned[0] : quoted;

      if (!rawTarget) {
        return await sock.sendMessage(key.remoteJid, {
          text: `╭─⌈ 🐺 *BLOCK* ⌋\n│\n├─⊷ *Tag a user or reply to their message*\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
        }, { quoted: msg });
      }
    } else {
      rawTarget = key.remoteJid;
    }

    if (!rawTarget || rawTarget.endsWith('@g.us')) {
      return await sock.sendMessage(key.remoteJid, {
        text: '⚠️ Cannot block a group.',
      }, { quoted: msg });
    }

    const target = await resolveTarget(sock, rawTarget, isGroup ? key.remoteJid : null);

    if (!target) {
      return await sock.sendMessage(key.remoteJid, {
        text: `⚠️ Could not resolve this user's phone number.\n\n_The user's LID is not yet mapped. Ask them to send a message first, then try again._`,
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
        text: `⚠️ Failed to block.\n\n_Error: ${err?.message || 'Unknown'}_`,
      }, { quoted: msg });
    }
  },
};
