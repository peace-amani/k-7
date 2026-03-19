import { getOwnerName } from '../../lib/menuHelper.js';

const BRAND = () => getOwnerName().toUpperCase();

// WhatsApp's only valid ephemeral durations (seconds)
const DURATIONS = {
  off:    0,
  '24h':  86400,
  day:    86400,
  week:   604800,
  '7d':   604800,
  '90d':  7776000,
  month:  7776000,
  '3m':   7776000,
};

const LABEL = {
  0:       'Off',
  86400:   '24 hours',
  604800:  '7 days',
  7776000: '90 days',
};

export default {
  name: 'disp',
  alias: ['disappear', 'ephemeral'],
  description: 'Set disappearing messages. Usage: .disp [24h|week|90d|off]',

  async execute(sock, msg, args) {
    const chatId  = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    // Groups: only admins can change this
    if (isGroup) {
      const senderId    = (msg.key.participant || msg.key.remoteJid).split(':')[0].split('@')[0];
      let isAdmin = false;
      try {
        const meta = await sock.groupMetadata(chatId);
        isAdmin = meta.participants.some(p => {
          const pId = p.id.split(':')[0].split('@')[0];
          return pId === senderId && (p.admin === 'admin' || p.admin === 'superadmin');
        });
      } catch {}
      if (!isAdmin) {
        return sock.sendMessage(chatId, {
          text: '❌ Only group admins can change disappearing messages.'
        }, { quoted: msg });
      }
    }

    const sub = (args[0] || '').toLowerCase();

    // No argument → show current state + usage
    if (!sub) {
      let current = 'Unknown';
      if (isGroup) {
        try {
          const meta = await sock.groupMetadata(chatId);
          current = LABEL[meta.ephemeralDuration ?? 0] ?? `${meta.ephemeralDuration}s`;
        } catch {}
      }
      return sock.sendMessage(chatId, {
        text:
          `╭─⌈ ⏳ *DISAPPEARING MESSAGES* ⌋\n` +
          (isGroup ? `├─⊷ Current : *${current}*\n` : '') +
          `├─⊷ *.disp 24h*   → 24 hours\n` +
          `├─⊷ *.disp week*  → 7 days\n` +
          `├─⊷ *.disp 90d*   → 90 days\n` +
          `├─⊷ *.disp off*   → Turn off\n` +
          `╰⊷ *Powered by ${BRAND()} TECH*`
      }, { quoted: msg });
    }

    if (!(sub in DURATIONS)) {
      return sock.sendMessage(chatId, {
        text: `❌ Unknown duration *${sub}*. Valid: 24h, week, 90d, off`
      }, { quoted: msg });
    }

    const seconds = DURATIONS[sub];
    const label   = LABEL[seconds] ?? 'Unknown';

    try {
      if (isGroup) {
        // Groups use groupToggleEphemeral — 0 means off, any positive value enables it
        await sock.groupToggleEphemeral(chatId, seconds);
      } else {
        // DMs use disappearingMessagesInChat inside sendMessage
        await sock.sendMessage(chatId, { disappearingMessagesInChat: seconds || false });
      }

      const stateText = seconds === 0
        ? '🔓 Disappearing messages turned *OFF*.'
        : `⏳ Disappearing messages set to *${label}*.`;

      return sock.sendMessage(chatId, {
        text:
          `╭─⌈ ⏳ *DISAPPEARING MESSAGES* ⌋\n` +
          `├─⊷ ${stateText}\n` +
          `╰⊷ *Powered by ${BRAND()} TECH*`
      }, { quoted: msg });

    } catch (err) {
      console.error('[DISP] Error:', err.message);
      return sock.sendMessage(chatId, {
        text: `❌ Failed to set disappearing messages: ${err.message}`
      }, { quoted: msg });
    }
  }
};
