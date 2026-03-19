import { getOwnerName } from '../../lib/menuHelper.js';

const BRAND = () => getOwnerName().toUpperCase();

// ─── Bot detection ────────────────────────────────────────────────────────────
// These are the key signals that reliably identify automated/bot messages.

// BAE5 is the Baileys-library-specific outgoing message ID prefix.
// 3EB0 is WhatsApp Web (normal users) — excluded to avoid false positives.
const BOT_KEY_PREFIXES = ['BAE5'];

// Message types that are never bot content — always skip these
const SKIP_MSG_TYPES = [
  'reactionMessage',
  'protocolMessage',
  'senderKeyDistributionMessage',
  'messageContextInfo',
  'ephemeralMessage',
];

export function isBotMessage(msg) {
  const m = msg?.message;
  if (!m) return false;

  // Skip reactions, protocol and other system message types
  if (SKIP_MSG_TYPES.some(t => m[t] !== undefined)) return false;

  // 1. Baileys message ID prefix
  const id = msg?.key?.id || '';
  if (BOT_KEY_PREFIXES.some(p => id.startsWith(p))) return true;

  // 2. Interactive message types only bots/apps send
  if (m.buttonsMessage)             return true;
  if (m.listMessage)                return true;
  if (m.templateMessage)            return true;
  if (m.interactiveMessage)         return true;
  if (m.botInvokeMessage)           return true;
  if (m.interactiveResponseMessage) return true;

  // 3. Very high forwarding score (automated chain messages)
  const fwdScore = m.extendedTextMessage?.contextInfo?.forwardingScore ||
                   m.imageMessage?.contextInfo?.forwardingScore ||
                   m.videoMessage?.contextInfo?.forwardingScore || 0;
  if (fwdScore >= 999) return true;

  return false;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function loadConfig() {
  if (typeof globalThis._antibotConfig === 'object' && globalThis._antibotConfig !== null) {
    return globalThis._antibotConfig;
  }
  return {};
}

function saveConfig(data) {
  globalThis._antibotConfig = data;
  if (typeof globalThis._saveAntibotConfig === 'function') {
    globalThis._saveAntibotConfig(data);
  }
}

export function isEnabled(chatJid) {
  const config = loadConfig();
  return config[chatJid]?.enabled === true;
}

export function getMode(chatJid) {
  const config = loadConfig();
  return config[chatJid]?.mode || 'delete';
}

// ─── Command ──────────────────────────────────────────────────────────────────

export default {
  name: 'antibot',
  alias: ['antibots', 'nobot', 'botguard'],
  description: 'Block bot messages in groups. Modes: warn / delete / kick',
  category: 'group',

  isBotMessage,
  isEnabled,
  getMode,

  async execute(sock, msg, args, PREFIX, extra) {
    const chatId = msg.key.remoteJid;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, {
        text: '❌ This command only works in groups.'
      }, { quoted: msg });
    }

    let groupMeta;
    try {
      groupMeta = await sock.groupMetadata(chatId);
    } catch {
      return sock.sendMessage(chatId, { text: '❌ Failed to fetch group info.' }, { quoted: msg });
    }

    const senderJid   = msg.key.participant || chatId;
    const senderClean = senderJid.split(':')[0].split('@')[0];
    const senderP     = groupMeta.participants.find(
      p => p.id.split(':')[0].split('@')[0] === senderClean
    );
    const isAdmin = senderP?.admin === 'admin' || senderP?.admin === 'superadmin';
    const isOwner = typeof extra?.isOwner === 'function' ? extra.isOwner() : !!extra?.isOwner;
    const isSudo  = typeof extra?.isSudo  === 'function' ? extra.isSudo()  : !!extra?.isSudo;

    if (!isAdmin && !isOwner && !isSudo) {
      return sock.sendMessage(chatId, {
        text: '❌ Only group admins can change anti-bot settings.'
      }, { quoted: msg });
    }

    const config = loadConfig();
    const gc     = config[chatId] || {};
    const sub    = (args[0] || '').toLowerCase();
    const modeArg = (args[1] || '').toLowerCase();

    // ── Status / no arg ──────────────────────────────────────────────────────
    if (!sub || sub === 'status') {
      const enabled    = gc.enabled === true;
      const mode       = gc.mode || 'delete';
      const statusIcon = enabled ? `✅ ON [${mode.toUpperCase()}]` : '❌ OFF';
      return sock.sendMessage(chatId, {
        text:
          `╭─⌈ 🤖 *ANTI-BOT* ⌋\n` +
          `├─⊷ *Status:* ${statusIcon}\n` +
          `│\n` +
          `├─⊷ *${PREFIX}antibot on warn*\n` +
          `│  └⊷ Warn sender & delete msg\n` +
          `├─⊷ *${PREFIX}antibot on delete*\n` +
          `│  └⊷ Silently delete bot msgs\n` +
          `├─⊷ *${PREFIX}antibot on kick*\n` +
          `│  └⊷ Delete msg & kick sender\n` +
          `├─⊷ *${PREFIX}antibot off*\n` +
          `│  └⊷ Disable protection\n` +
          `╰⊷ *Powered by ${BRAND()} TECH*`
      }, { quoted: msg });
    }

    // ── Enable ───────────────────────────────────────────────────────────────
    if (sub === 'on') {
      const validModes = ['warn', 'delete', 'kick'];
      const mode = validModes.includes(modeArg) ? modeArg : 'delete';

      config[chatId] = { ...gc, enabled: true, mode };
      saveConfig(config);

      return sock.sendMessage(chatId, {
        text:
          `╭─⌈ 🤖 *ANTI-BOT ENABLED* ⌋\n` +
          `├─⊷ *Mode:* ${mode.toUpperCase()}\n` +
          `╰⊷ *Powered by ${BRAND()} TECH*`
      }, { quoted: msg });
    }

    // ── Disable ──────────────────────────────────────────────────────────────
    if (sub === 'off') {
      config[chatId] = { ...gc, enabled: false };
      saveConfig(config);
      return sock.sendMessage(chatId, {
        text: `╭─⌈ 🤖 *ANTI-BOT DISABLED* ⌋\n╰⊷ *Powered by ${BRAND()} TECH*`
      }, { quoted: msg });
    }

    return sock.sendMessage(chatId, {
      text:
        `╭─⌈ 🤖 *ANTI-BOT* ⌋\n` +
        `│\n` +
        `├─⊷ *${PREFIX}antibot on warn*\n` +
        `│  └⊷ Warn sender & delete msg\n` +
        `├─⊷ *${PREFIX}antibot on delete*\n` +
        `│  └⊷ Silently delete bot msgs\n` +
        `├─⊷ *${PREFIX}antibot on kick*\n` +
        `│  └⊷ Delete msg & kick sender\n` +
        `├─⊷ *${PREFIX}antibot off*\n` +
        `│  └⊷ Disable protection\n` +
        `├─⊷ *${PREFIX}antibot status*\n` +
        `│  └⊷ View current settings\n` +
        `╰⊷ *Powered by ${BRAND()} TECH*`
    }, { quoted: msg });
  }
};

