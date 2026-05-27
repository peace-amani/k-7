import fs from 'fs';
import path from 'path';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const DATA_DIR = './data/approveall';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(data) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[APPROVEALL] Save error:', err.message);
  }
}

// Replace placeholders in a custom message template.
// Supported placeholders: {count}, {approved}, {failed}, {group}, {bot}
function formatCustomMessage(template, vars) {
  if (!template || typeof template !== 'string') return '';
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`
  );
}

export default {
  name: 'approveall',
  description: 'Approve all pending group join requests.',
  execute: async (sock, msg, args, metadata) => {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    const sub = (args[0] || '').toLowerCase();
    const config = loadConfig();
    const groupConfig = config[jid] || { customMessage: '' };

    // ── Subcommand: set custom message ───────────────────────────────────
    if (sub === 'set' || sub === 'setmsg') {
      const customText = args.slice(1).join(' ').trim();
      if (!customText) {
        return sock.sendMessage(jid, {
          text: `╭─⌈ ✏️ *SET CUSTOM MESSAGE* ⌋\n│\n├─⊷ Usage: *.approveall set <text>*\n│\n├─⊷ Placeholders:\n│  └⊷ {count}    - total requests\n│  └⊷ {approved} - approved count\n│  └⊷ {failed}   - failed count\n│  └⊷ {group}    - group name\n│  └⊷ {bot}      - bot name\n│\n├─⊷ Example:\n│  └⊷ .approveall set Welcome! Approved {approved}/{count} new members.\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
        }, { quoted: msg });
      }
      groupConfig.customMessage = customText;
      config[jid] = groupConfig;
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: `✅ *Custom Approve-All message saved.*\n\n📝 Preview:\n${customText}`
      }, { quoted: msg });
    }

    // ── Subcommand: reset custom message ─────────────────────────────────
    if (sub === 'reset' || sub === 'resetmsg' || sub === 'cleartext') {
      if (!groupConfig.customMessage) {
        return sock.sendMessage(jid, {
          text: 'ℹ️ No custom message is set — already using the default.'
        }, { quoted: msg });
      }
      groupConfig.customMessage = '';
      config[jid] = groupConfig;
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: '✅ Custom message cleared. Default reply will be used.'
      }, { quoted: msg });
    }

    // ── Subcommand: status ───────────────────────────────────────────────
    if (sub === 'status' || sub === 'settings') {
      const customStatus = groupConfig.customMessage
        ? `✅ set\n\n📝 Preview:\n${groupConfig.customMessage}`
        : '❌ default';
      return sock.sendMessage(jid, {
        text: `📊 *APPROVE-ALL STATUS*\n\nCustom Message: ${customStatus}\n\nUse:\n• .approveall set <text>\n• .approveall reset\n• .approveall (run approval)`
      }, { quoted: msg });
    }

    // ── Subcommand: help ─────────────────────────────────────────────────
    if (sub === 'help') {
      return sock.sendMessage(jid, {
        text: `╭─⌈ ✅ *APPROVE-ALL* ⌋\n│\n├─⊷ *.approveall*\n│  └⊷ Approve all pending join requests\n├─⊷ *.approveall set <text>*\n│  └⊷ Custom result text\n│  └⊷ {count} {approved} {failed} {group} {bot}\n├─⊷ *.approveall reset*\n│  └⊷ Restore default text\n├─⊷ *.approveall status*\n│  └⊷ View current settings\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: msg });
    }

    // ── Default behaviour: run the approval ─────────────────────────────
    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
    } catch (e) {}

    let pendingRequests;
    try {
      pendingRequests = await sock.groupRequestParticipantsList(jid);
    } catch (error) {
      console.error('[ApproveAll] Error fetching pending requests:', error);
      try { await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }); } catch (e) {}
      return sock.sendMessage(jid, { text: '❌ Failed to fetch pending join requests. Make sure the bot is an admin.' }, { quoted: msg });
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      try { await sock.sendMessage(jid, { react: { text: 'ℹ️', key: msg.key } }); } catch (e) {}
      return sock.sendMessage(jid, { text: 'ℹ️ No pending join requests found in this group.' }, { quoted: msg });
    }

    const participantJids = pendingRequests.map(p => p.jid || p.id);

    let approvedCount = 0;
    let failedCount = 0;
    const batchSize = 5;

    for (let i = 0; i < participantJids.length; i += batchSize) {
      const batch = participantJids.slice(i, i + batchSize);
      try {
        await sock.groupRequestParticipantsUpdate(jid, batch, 'approve');
        approvedCount += batch.length;
      } catch (error) {
        console.error('[ApproveAll] Batch approval error:', error);
        failedCount += batch.length;
      }
      if (i + batchSize < participantJids.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    try { await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }); } catch (e) {}

    let groupName = 'this group';
    try {
      const meta = await sock.groupMetadata(jid);
      groupName = meta?.subject || groupName;
    } catch {}

    const customMsg = groupConfig.customMessage;
    let resultText;
    if (customMsg) {
      resultText = formatCustomMessage(customMsg, {
        count: participantJids.length,
        approved: approvedCount,
        failed: failedCount,
        group: groupName,
        bot: getBotName()
      });
    } else {
      resultText = `╭━🐺 *APPROVED* 🐺━╮\n`;
      resultText += `┃ 📋 *Total Requests:* ${participantJids.length}\n`;
      resultText += `┃ ✅ *Approved:* ${approvedCount}\n`;
      if (failedCount > 0) {
        resultText += `┃ ❌ *Failed:* ${failedCount}\n`;
      }
      resultText += `╰━━━━━━━━━━━━━╯\n`;
      resultText += `_🐺 _${getBotName()}_`;
    }

    await sock.sendMessage(jid, { text: resultText }, { quoted: msg });
  },
};
