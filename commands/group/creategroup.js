import fs from "fs";
import { getBotName } from '../../lib/botname.js';
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: "creategroup",
  description: "Create WhatsApp groups automatically",
  category: "owner",
  ownerOnly: true,
  aliases: ["cg", "makegroup", "newgroup"],
  usage: "<number(s)> <GroupName>  or  <GroupName> <number(s)>",

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
        `├─⊷ *${PREFIX}creategroup 254xxx GroupName*\n│  └⊷ Create with one member\n` +
        `├─⊷ *${PREFIX}creategroup 254xxx 254yyy GroupName*\n│  └⊷ Create with multiple members\n` +
        `├─⊷ *${PREFIX}creategroup GroupName 254xxx*\n│  └⊷ Name first also works\n` +
        `│\n` +
        `├─⊷ *-d "description"*\n│  └⊷ Set group description\n` +
        `├─⊷ *-a*\n│  └⊷ Announce-only mode\n` +
        `├─⊷ *-r*\n│  └⊷ Admin-only settings\n` +
        `╰⊷ *Powered by ${getBotName().toUpperCase()}*`
      );
    }

    try {
      // ====== PARSE ARGUMENTS ======
      // Strategy: scan all args — phone numbers (8-15 digits) are participants,
      // everything else (after stripping flags) is joined as the group name.
      // This works regardless of order: number-first OR name-first.

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
          `❌ *No phone number provided!*\n\n` +
          `Usage: \`${PREFIX}creategroup 254703397679 Wolf Group\`\n` +
          `Include the country code (no + needed).`
        );
      }

      // ====== PREPARE PARTICIPANTS ======
      const processingMsg = await reply(`⏳ *Creating "${groupName}"…*`);

      const validParticipants = [];
      const invalidParticipants = [];

      // Always include the owner who sent the command
      const ownerJid = senderJid.includes('@') ? senderJid : senderJid + '@s.whatsapp.net';
      validParticipants.push(ownerJid);

      // Process provided numbers
      for (const num of rawNumbers) {
        const participantJid = num + '@s.whatsapp.net';
        if (!validParticipants.includes(participantJid)) {
          validParticipants.push(participantJid);
        }
      }

      // ====== CREATE GROUP ======
      // Baileys adds the bot as creator automatically — pass everyone else
      const group = await sock.groupCreate(groupName, validParticipants);

      if (!group || !group.gid) throw new Error("No group ID returned — creation may have failed.");

      const groupJid = group.gid;

      // ====== CONFIGURE GROUP ======
      const botJid = sock.user?.id || sock.userID;

      // Promote bot to admin
      try {
        if (botJid) await sock.groupParticipantsUpdate(groupJid, [botJid], "promote");
      } catch {}

      // Set description
      if (description) {
        try { await sock.groupUpdateDescription(groupJid, description); } catch {}
      }

      // Group settings
      try {
        await sock.groupSettingUpdate(groupJid, announcementsOnly ? 'announcement' : 'not_announcement');
        await sock.groupSettingUpdate(groupJid, restrict ? 'locked' : 'unlocked');
      } catch {}

      // Welcome message in the new group
      await sock.sendMessage(groupJid, {
        text: `👋 *Welcome to ${groupName}!*\n\nCreated with ${getBotName()}.\n🤖 Prefix: ${PREFIX}`
      });

      // Get invite link
      let inviteLink = "Unavailable";
      try {
        const code = await sock.groupInviteCode(groupJid);
        if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
      } catch {}

      // ====== SUCCESS REPORT ======
      let successMsg =
        `╭─⌈ ✅ *GROUP CREATED* ⌋\n│\n` +
        `├─⊷ *Name:* ${groupName}\n` +
        `├─⊷ *Members:* ${validParticipants.length + 1}\n`;

      if (description) successMsg += `├─⊷ *Description:* ${description}\n`;

      successMsg += `├─⊷ *Members added:*\n`;
      validParticipants.forEach(p => {
        const num = p.split('@')[0];
        const tag = p === ownerJid ? ' 👤 you' : '';
        successMsg += `│  └⊷ ${num}${tag}\n`;
      });

      if (invalidParticipants.length > 0) {
        successMsg += `├─⊷ *Not added (invalid):*\n`;
        invalidParticipants.forEach(p => { successMsg += `│  └⊷ ${p}\n`; });
      }

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
          members: validParticipants.length + 1,
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
