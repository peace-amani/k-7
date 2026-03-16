import { isMuted, setMuted } from '../../lib/chat-state.js';
import { safeModify } from '../../lib/safe-modify.js';

export default {
  name: 'notifications',
  alias: ['mutegroup', 'togglenotif', 'togglemute', 'togglenotifications'],
  description: 'Toggle mute/unmute notifications for this group',
  category: 'group',

  async execute(sock, msg, args, from, isGroup, sender) {
    const jid = msg.key.remoteJid;

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

      const currently = isMuted(jid);
      const shouldMute = !currently;

      if (shouldMute) {
        const muteUntil = Date.now() + (100 * 365 * 24 * 60 * 60 * 1000);
        setMuted(jid, muteUntil);
        await safeModify(sock, { mute: muteUntil }, jid);
      } else {
        setMuted(jid, null);
        await safeModify(sock, { mute: null }, jid);
      }

      await sock.sendMessage(jid, { react: { text: shouldMute ? '🔕' : '🔔', key: msg.key } });
      await sock.sendMessage(jid, {
        text: shouldMute
          ? '🔕 *Notifications muted!*\nYou will no longer receive notifications from this group.'
          : '🔔 *Notifications unmuted!*\nNotifications for this group are now active.'
      }, { quoted: msg });

    } catch (err) {
      console.error('[notifications]', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` }, { quoted: msg });
    }
  }
};
