import { delay } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';

async function resolveJidForBlock(sock, rawJid, groupId) {
    if (!rawJid) return null;

    // Already a phone JID — use as-is
    if (rawJid.endsWith('@s.whatsapp.net') || rawJid.endsWith('@c.us')) {
        return rawJid.replace('@c.us', '@s.whatsapp.net');
    }

    // Not a LID — unknown format
    if (!rawJid.endsWith('@lid')) {
        return rawJid;
    }

    const lidNum = rawJid.split('@')[0];

    // 1. Try lidPhoneCache (fastest)
    const cached = globalThis.lidPhoneCache?.get(lidNum);
    if (cached) {
        console.log(`[BLOCK] LID ${lidNum} → phone cache: ${cached}`);
        return `${cached}@s.whatsapp.net`;
    }

    // 2. Try the full resolvePhoneFromLid (uses signalRepository)
    const resolved = globalThis.resolvePhoneFromLid?.(rawJid);
    if (resolved) {
        console.log(`[BLOCK] LID ${lidNum} → resolvePhoneFromLid: ${resolved}`);
        return `${resolved}@s.whatsapp.net`;
    }

    // 3. Try group metadata if in a group
    if (groupId) {
        try {
            const metadata = await sock.groupMetadata(groupId);
            const match = metadata.participants.find(p => p.id === rawJid || p.lid === rawJid);
            if (match?.id && !match.id.endsWith('@lid')) {
                console.log(`[BLOCK] LID ${lidNum} → group metadata: ${match.id}`);
                return match.id;
            }
        } catch {}
    }

    return null;
}

export default {
  name: 'block',
  description: 'Block a user (tag/reply in group or auto-block the DM contact)',
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
      // In a DM — block whoever this chat is with
      rawTarget = key.remoteJid;
    }

    if (!rawTarget || rawTarget.endsWith('@g.us') || rawTarget.endsWith('@newsletter')) {
      return await sock.sendMessage(key.remoteJid, {
        text: '⚠️ Cannot block a group or newsletter.',
      }, { quoted: msg });
    }

    console.log(`[BLOCK] rawTarget: ${rawTarget}`);

    const target = await resolveJidForBlock(sock, rawTarget, isGroup ? key.remoteJid : null);

    console.log(`[BLOCK] resolved target: ${target}`);

    if (!target) {
      return await sock.sendMessage(key.remoteJid, {
        text: `⚠️ Could not resolve this contact's phone number.\n\n_Their ID: ${rawTarget}_\n_Ask them to send a message to the bot first, then try again._`,
      }, { quoted: msg });
    }

    // Try phone JID first, then fall back to raw LID (newer WhatsApp protocol)
    const jidsToTry = [target];
    if (rawTarget !== target) jidsToTry.push(rawTarget);

    let blocked = false;
    let lastErr = null;

    for (const jid of jidsToTry) {
      try {
        console.log(`[BLOCK] Trying updateBlockStatus with: ${jid}`);
        await sock.updateBlockStatus(jid, 'block');
        blocked = true;
        console.log(`[BLOCK] Success with: ${jid}`);
        break;
      } catch (err) {
        console.error(`[BLOCK] Failed with ${jid}:`, err?.message || err);
        lastErr = err;
      }
    }

    if (blocked) {
      await delay(500);
      const num = target.split('@')[0];
      await sock.sendMessage(key.remoteJid, {
        text: `🕸️ *Blocked successfully.*\n\n❌ +${num} has been blocked.`,
      }, { quoted: msg });
    } else {
      await sock.sendMessage(key.remoteJid, {
        text: `⚠️ Block failed.\n\n_Target: ${target}_\n_Error: ${lastErr?.message || 'Unknown'}_`,
      }, { quoted: msg });
    }
  },
};
