import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

export default {
  name: 'tennis',
  description: 'Get live tennis scores and results',
  category: 'sports',
  aliases: ['atp', 'wta'],
  usage: 'tennis [scores|rankings]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;

    if (args.length === 0 || args[0].toLowerCase() === 'help') {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎾 *TENNIS* ⌋\n├─⊷ *${PREFIX}tennis scores*\n│  └⊷ Live tennis scores\n├─⊷ *${PREFIX}tennis rankings*\n│  └⊷ ATP/WTA rankings\n├─⊷ *${PREFIX}atp scores*\n│  └⊷ Alias for tennis\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.get(`${ESPN_BASE}/tennis/atp/scoreboard`, { timeout: 15000 });
      const events = res.data?.events || [];
      if (events.length === 0) throw new Error('No tennis matches found today');

      let text = `╭─⌈ 🎾 *TENNIS SCORES* ⌋\n│\n`;
      events.slice(0, 15).forEach(ev => {
        const comp = ev.competitions?.[0];
        const players = comp?.competitors || [];
        const status = ev.status?.type?.shortDetail || '';
        const tourney = ev.season?.slug || '';

        if (players.length >= 2) {
          const p1 = players[0]?.athlete?.displayName || players[0]?.team?.displayName || '???';
          const p2 = players[1]?.athlete?.displayName || players[1]?.team?.displayName || '???';
          const s1 = players[0]?.score || '-';
          const s2 = players[1]?.score || '-';
          const w1 = players[0]?.winner ? '🏆' : '';
          const w2 = players[1]?.winner ? '🏆' : '';
          text += `├─⊷ ${w1}${p1.length > 18 ? p1.substring(0, 16) + '..' : p1} *${s1}*\n`;
          text += `│  ⊷ ${w2}${p2.length > 18 ? p2.substring(0, 16) + '..' : p2} *${s2}*\n`;
          text += `│  └⊷ ${status}\n`;
        }
      });
      text += `╰───\n\n⚡ *Powered by ${getOwnerName().toUpperCase()} TECH*`;

      await sock.sendMessage(jid, { text }, { quoted: m });
      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
    } catch (error) {
      console.error('❌ [TENNIS]', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `╭─⌈ ❌ *TENNIS ERROR* ⌋\n├─⊷ ${error.message}\n├─⊷ Try again later\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }
  }
};
