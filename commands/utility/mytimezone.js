import { getPhoneInfo } from '../../lib/phoneTimezone.js';

export default {
  name: 'mytimezone',
  aliases: ['mytz', 'mytime', 'myzone'],
  description: 'Shows your timezone detected from your phone number',
  usage: 'mytimezone',

  async execute(sock, m, args) {
    const jid = m.key.remoteJid;

    const senderJid = m.key.participant || m.key.remoteJid || '';
    const isLid = senderJid.includes('@lid');

    const { timezone, country, flag } = getPhoneInfo(senderJid);
    const isUnknown = country === 'Unknown';

    if (isLid && isUnknown) {
      await sock.sendMessage(jid, {
        text:
          `╭─⌈ 🌐 *MY TIMEZONE* ⌋\n` +
          `│\n` +
          `├─⊷ ⚠️ *Could not detect your timezone*\n` +
          `│\n` +
          `├─⊷ Your account uses a privacy ID (LID)\n` +
          `├─⊷ that hides your phone number.\n` +
          `│\n` +
          `├─⊷ 💡 *Try messaging me directly (DM)*\n` +
          `├─⊷    instead of from a group, or send\n` +
          `├─⊷    your number so I can look it up.\n` +
          `│\n` +
          `╰─⊷ _LID:${senderJid.split('@')[0].substring(0, 10)}..._`
      }, { quoted: m });
      return;
    }

    const rawPhone = senderJid.split('@')[0].replace(/\D/g, '');
    const displayPhone = rawPhone ? `+${rawPhone}` : 'Private number';

    const now = new Date();

    const currentTime = now.toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: timezone,
    });

    const currentDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    });

    const utcOffset = (() => {
      try {
        const parts = new Intl.DateTimeFormat('en', {
          timeZone: timezone,
          timeZoneName: 'shortOffset',
        }).formatToParts(now);
        const off = parts.find(p => p.type === 'timeZoneName');
        return off ? off.value : 'UTC';
      } catch {
        return 'UTC';
      }
    })();

    const text =
      `╭─⌈ 🌐 *MY TIMEZONE* ⌋\n` +
      `│\n` +
      `├─⊷ ${flag} *Country:* ${country}\n` +
      `├─⊷ 🕐 *Timezone:* ${timezone}\n` +
      `├─⊷ 🔢 *UTC Offset:* ${utcOffset}\n` +
      `│\n` +
      `├─⊷ 📅 *Date:* ${currentDate}\n` +
      `├─⊷ ⏰ *Time:* ${currentTime}\n` +
      `│\n` +
      `├─⊷ 📱 *Detected from:* ${displayPhone}\n` +
      `│\n` +
      `╰─⊷ _Timezone auto-detected from your number_`;

    await sock.sendMessage(jid, { text }, { quoted: m });
  },
};
