import { getPhoneInfo } from '../../lib/phoneTimezone.js';

export default {
  name: 'mytimezone',
  aliases: ['mytz', 'mytime', 'myzone'],
  description: 'Shows your timezone detected from your phone number',
  usage: 'mytimezone',

  async execute(sock, m, args) {
    const jid = m.key.remoteJid;
    const senderJid = m.key.participant || m.key.remoteJid || '';
    const phone = senderJid.split('@')[0];

    const { timezone, country, flag } = getPhoneInfo(senderJid);

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
        const formatter = new Intl.DateTimeFormat('en', {
          timeZone: timezone,
          timeZoneName: 'shortOffset',
        });
        const parts = formatter.formatToParts(now);
        const offsetPart = parts.find(p => p.type === 'timeZoneName');
        return offsetPart ? offsetPart.value : 'UTC';
      } catch {
        return 'UTC';
      }
    })();

    const prefix = global.prefix || '.';

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
      `├─⊷ 📱 *Detected from:* +${phone}\n` +
      `│\n` +
      `╰─⊷ _Timezone auto-detected from your number_`;

    await sock.sendMessage(jid, { text }, { quoted: m });
  },
};
