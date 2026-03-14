import fs from "fs";
import { getBotName } from '../../lib/botname.js';
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseVcardNumbers(vcard) {
    const numbers = [];
    const lines = vcard.split(/\r?\n/);
    for (const line of lines) {
        if (!line.toUpperCase().startsWith('TEL')) continue;
        const parts = line.split(':');
        if (parts.length < 2) continue;
        const raw = parts[parts.length - 1].trim().replace(/[+\s()\-]/g, '');
        if (/^\d{7,15}$/.test(raw)) numbers.push(raw);
    }
    return numbers;
}

function extractNumbersFromQuotedVcf(m) {
    const msgContent = m.message || {};

    // Unwrap ephemerals / view-once wrappers
    const inner =
        msgContent.ephemeralMessage?.message ||
        msgContent.viewOnceMessage?.message ||
        msgContent.documentWithCaptionMessage?.message ||
        msgContent;

    // Direct contact message (single contact shared)
    if (inner.contactMessage?.vcard) {
        return parseVcardNumbers(inner.contactMessage.vcard);
    }

    // Multiple contacts shared at once
    if (inner.contactsArrayMessage?.contacts?.length) {
        const nums = [];
        for (const c of inner.contactsArrayMessage.contacts) {
            if (c.vcard) nums.push(...parseVcardNumbers(c.vcard));
        }
        return nums;
    }

    // Reply to a contact/VCF — check contextInfo of text message
    const ctxMsg =
        inner.extendedTextMessage?.contextInfo?.quotedMessage ||
        inner.imageMessage?.contextInfo?.quotedMessage ||
        inner.videoMessage?.contextInfo?.quotedMessage;

    if (ctxMsg) {
        if (ctxMsg.contactMessage?.vcard) {
            return parseVcardNumbers(ctxMsg.contactMessage.vcard);
        }
        if (ctxMsg.contactsArrayMessage?.contacts?.length) {
            const nums = [];
            for (const c of ctxMsg.contactsArrayMessage.contacts) {
                if (c.vcard) nums.push(...parseVcardNumbers(c.vcard));
            }
            return nums;
        }
    }

    return [];
}

export default {
  name: "creategroup",
  description: "Create WhatsApp groups automatically",
  category: "owner",
  ownerOnly: true,
  aliases: ["cg", "makegroup", "newgroup"],
  usage: "<GroupName>  (reply to VCF)  or  <number(s)> <GroupName>",

  async execute(sock, m, args, PREFIX, extra) {
    const jid = m.key.remoteJid;
    const { jidManager } = extra;
    const senderJid = m.key.participant || jid;

    const reply = (text) => sock.sendMessage(jid, { text }, { quoted: m });

    const isOwner = jidManager.isOwner(m);
    if (!isOwner) return reply(`❌ *Owner only command.*`);

    if (args.length === 0 || args[0].toLowerCase() === "help") {
      return reply(
        `╭─⌈ 👥 *CREATE GROUP* ⌋\n│\n` +
        `├─⊷ *Reply to a VCF/contact:*\n│  └⊷ ${PREFIX}creategroup GroupName\n` +
        `├─⊷ *Manual numbers:*\n│  └⊷ ${PREFIX}creategroup 254xxx GroupName\n` +
        `├─⊷ *Multiple numbers:*\n│  └⊷ ${PREFIX}creategroup 254xxx 254yyy GroupName\n` +
        `│\n` +
        `├─⊷ *-d "description"*\n│  └⊷ Set group description\n` +
        `├─⊷ *-a*\n│  └⊷ Announce-only mode\n` +
        `├─⊷ *-r*\n│  └⊷ Admin-only settings\n` +
        `╰⊷ *Powered by ${getBotName().toUpperCase()}*`
      );
    }

    try {
      // ====== PARSE ARGUMENTS ======
      const phoneRegex = /^\+?[\d]{7,15}$/;
      const rawNumbers = [];
      const nameWords = [];
      let description = "";
      let announcementsOnly = false;
      let restrict = false;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '-d' && args[i + 1]) {
          description = args[i + 1].replace(/"/g, '').trim();
          i++;
          continue;
        }
        if (arg === '-a') { announcementsOnly = true; continue; }
        if (arg === '-r') { restrict = true; continue; }

        const stripped = arg.replace(/[+\s()\-]/g, '');
        if (phoneRegex.test(stripped) && stripped.length >= 7) {
          rawNumbers.push(stripped);
        } else {
          nameWords.push(arg.replace(/"/g, ''));
        }
      }

      const groupName = nameWords.join(' ').trim() || `${getBotName()} Group`;

      // ====== VCF EXTRACTION ======
      // Try to pull numbers from a quoted/attached VCF if no manual numbers given
      const vcfNumbers = extractNumbersFromQuotedVcf(m);
      if (vcfNumbers.length > 0) {
        for (const n of vcfNumbers) {
          if (!rawNumbers.includes(n)) rawNumbers.push(n);
        }
      }

      // ====== VALIDATION ======
      if (groupName.length > 25) {
        return reply(
          `❌ *Group name too long!*\n\n` +
          `Maximum 25 characters — yours has ${groupName.length}.\n` +
          `💡 Shorten: \`${PREFIX}cg ${groupName.slice(0, 20)} ${rawNumbers.join(' ')}\``
        );
      }

      if (rawNumbers.length === 0) {
        return reply(
          `❌ *No phone numbers found!*\n\n` +
          `*Option 1:* Reply to a VCF contact and run:\n` +
          `\`${PREFIX}creategroup GroupName\`\n\n` +
          `*Option 2:* Provide numbers manually:\n` +
          `\`${PREFIX}creategroup 254703397679 Wolf Group\``
        );
      }

      // ====== PREPARE PARTICIPANTS ======
      const processingMsg = await reply(
        `⏳ *Creating "${groupName}"…*\n` +
        (vcfNumbers.length > 0 ? `📋 Loaded ${vcfNumbers.length} number(s) from VCF` : '')
      );

      const validParticipants = [];

      // Always include the owner
      const ownerJid = senderJid.includes('@') ? senderJid : senderJid + '@s.whatsapp.net';
      validParticipants.push(ownerJid);

      for (const num of rawNumbers) {
        const participantJid = num + '@s.whatsapp.net';
        if (!validParticipants.includes(participantJid)) {
          validParticipants.push(participantJid);
        }
      }

      // ====== CREATE GROUP ======
      const group = await sock.groupCreate(groupName, validParticipants);

      if (!group || !group.gid) throw new Error("No group ID returned — creation may have failed.");

      const groupJid = group.gid;

      // ====== CONFIGURE GROUP ======
      const botJid = sock.user?.id || sock.userID;

      try {
        if (botJid) await sock.groupParticipantsUpdate(groupJid, [botJid], "promote");
      } catch {}

      if (description) {
        try { await sock.groupUpdateDescription(groupJid, description); } catch {}
      }

      try {
        await sock.groupSettingUpdate(groupJid, announcementsOnly ? 'announcement' : 'not_announcement');
        await sock.groupSettingUpdate(groupJid, restrict ? 'locked' : 'unlocked');
      } catch {}

      await sock.sendMessage(groupJid, {
        text: `👋 *Welcome to ${groupName}!*\n\nCreated with ${getBotName()}.\n🤖 Prefix: ${PREFIX}`
      });

      let inviteLink = "Unavailable";
      try {
        const code = await sock.groupInviteCode(groupJid);
        if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
      } catch {}

      // ====== SUCCESS REPORT ======
      let successMsg =
        `╭─⌈ ✅ *GROUP CREATED* ⌋\n│\n` +
        `├─⊷ *Name:* ${groupName}\n` +
        `├─⊷ *Members:* ${validParticipants.length}\n`;

      if (vcfNumbers.length > 0) {
        successMsg += `├─⊷ *Source:* 📋 VCF (${vcfNumbers.length} contacts)\n`;
      }

      if (description) successMsg += `├─⊷ *Description:* ${description}\n`;

      successMsg += `├─⊷ *Members added:*\n`;
      validParticipants.forEach(p => {
        const num = p.split('@')[0];
        const tag = p === ownerJid ? ' 👤 (you)' : '';
        successMsg += `│  └⊷ +${num}${tag}\n`;
      });

      successMsg +=
        `├─⊷ *Link:* ${inviteLink}\n│\n` +
        `╰⊷ *Powered by ${getBotName().toUpperCase()}*`;

      await reply(successMsg);

      // ====== LOG ======
      try {
        const logDir = path.join(__dirname, "../../logs");
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, "groups.json");
        const groups = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : [];
        groups.push({
          id: groupJid, name: groupName,
          createdBy: senderJid.split('@')[0],
          created: new Date().toISOString(),
          members: validParticipants.length,
          vcfSource: vcfNumbers.length > 0,
          invite: inviteLink
        });
        fs.writeFileSync(logFile, JSON.stringify(groups, null, 2));
      } catch {}

    } catch (error) {
      console.error("❌ [CREATEGROUP]", error.message);

      let msg = `❌ *Failed to create group*\n\n`;
      if (error.message?.includes("bad-request") || error.message?.includes("400")) {
        msg += `WhatsApp rejected the request.\n\n*Common fixes:*\n• Make sure numbers are registered on WhatsApp\n• Include country code (e.g. 254703397679)\n• Try with fewer members first`;
      } else if (error.message?.includes("rate") || error.message?.includes("429")) {
        msg += `Rate limited — wait 1–2 minutes and retry.`;
      } else if (error.message?.includes("participant")) {
        msg += `One or more numbers are invalid or not on WhatsApp.`;
      } else {
        msg += error.message;
      }

      msg += `\n\n💡 *Example:*\n\`${PREFIX}creategroup 254703397679 Wolf Group\``;
      await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
  },
};
