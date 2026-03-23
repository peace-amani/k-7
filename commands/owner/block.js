import { delay } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';

async function resolveJidForBlock(sock, rawJid, groupId) {
    if (!rawJid) return null;
    if (rawJid.endsWith('@s.whatsapp.net') || rawJid.endsWith('@c.us')) {
        return rawJid.replace('@c.us', '@s.whatsapp.net');
    }
    if (!rawJid.endsWith('@lid')) return rawJid;

    const lidNum = rawJid.split('@')[0];
    const cached = globalThis.lidPhoneCache?.get(lidNum);
    if (cached) return `${cached}@s.whatsapp.net`;

    const resolved = globalThis.resolvePhoneFromLid?.(rawJid);
    if (resolved) return `${resolved}@s.whatsapp.net`;

    if (groupId) {
        try {
            const metadata = await sock.groupMetadata(groupId);
            const match = metadata.participants.find(p => p.id === rawJid || p.lid === rawJid);
            if (match?.id && !match.id.endsWith('@lid')) return match.id;
        } catch {}
    }
    return null;
}

async function tryBlock(sock, jid) {
    // Method 1: standard Baileys call
    try {
        await sock.updateBlockStatus(jid, 'block');
        return;
    } catch (e1) {
        console.log(`[BLOCK] updateBlockStatus failed (${e1?.message}), trying custom IQ...`);
    }

    // Method 2: custom IQ with <list> wrapper (newer WhatsApp protocol)
    await sock.query({
        tag: 'iq',
        attrs: { xmlns: 'blocklist', to: 's.whatsapp.net', type: 'set' },
        content: [{
            tag: 'list',
            attrs: {},
            content: [{
                tag: 'item',
                attrs: { action: 'block', jid },
            }],
        }],
    });
}

export default {
  name: 'block',
  description: 'Block a user by number, mention, reply, or DM contact',
  category: 'owner',
  async execute(sock, msg, args) {
    const { key, message } = msg;
    const isGroup = key.remoteJid.endsWith('@g.us');
    let rawTarget = null;

    // 1. Argument: /block 254712345678
    if (args[0]) {
      const num = args[0].replace(/[^0-9]/g, '');
      if (num.length >= 7) {
        rawTarget = `${num}@s.whatsapp.net`;
      }
    }

    // 2. Mention or quoted reply
    if (!rawTarget) {
      const mentioned = message?.extendedTextMessage?.contextInfo?.mentionedJid;
      const quoted   = message?.extendedTextMessage?.contextInfo?.participant;
      if (mentioned && mentioned.length > 0) rawTarget = mentioned[0];
      else if (quoted) rawTarget = quoted;
    }

    // 3. In a group with no target — show usage
    if (!rawTarget && isGroup) {
      return await sock.sendMessage(key.remoteJid, {
        text: `╭─⌈ 🐺 *BLOCK* ⌋\n│\n├─⊷ */block <number>* — e.g. /block 254712345678\n├─⊷ *Tag a user* or *reply* to their message\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
      }, { quoted: msg });
    }

    // 4. DM with no target — block the DM contact (only if remoteJid is not the sender themselves)
    if (!rawTarget && !isGroup) {
      rawTarget = key.remoteJid;
    }

    if (!rawTarget || rawTarget.endsWith('@g.us') || rawTarget.endsWith('@newsletter')) {
      return await sock.sendMessage(key.remoteJid, {
        text: '⚠️ Cannot block a group or newsletter. Provide a number: */block 254712345678*',
      }, { quoted: msg });
    }

    const target = await resolveJidForBlock(sock, rawTarget, isGroup ? key.remoteJid : null);
    console.log(`[BLOCK] rawTarget=${rawTarget} → target=${target}`);

    if (!target) {
      return await sock.sendMessage(key.remoteJid, {
        text: `⚠️ Could not resolve contact.\n\nTry using a phone number directly:\n*/block 254712345678*`,
      }, { quoted: msg });
    }

    // Try phone JID first, then raw LID as fallback
    const attempts = [target];
    if (rawTarget !== target && rawTarget.endsWith('@lid')) attempts.push(rawTarget);

    let blocked = false;
    let lastErr = null;

    for (const jid of attempts) {
      try {
        console.log(`[BLOCK] Trying: ${jid}`);
        await tryBlock(sock, jid);
        blocked = true;
        console.log(`[BLOCK] Success: ${jid}`);
        break;
      } catch (err) {
        console.error(`[BLOCK] Failed (${jid}):`, err?.message || err);
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
        text: `⚠️ Block failed.\n\n_Error: ${lastErr?.message || 'Unknown'}_\n\nMake sure the number exists on WhatsApp.`,
      }, { quoted: msg });
    }
  },
};
