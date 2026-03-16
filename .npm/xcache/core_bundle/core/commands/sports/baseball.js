import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

export default {
  name: 'baseball',
  description: 'Get MLB baseball scores and standings',
  category: 'sports',
  aliases: ['mlb'],
  usage: 'baseball [scores|standings]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;

    if (args.length === 0 || args[0].toLowerCase() === 'help') {
      return sock.sendMessage(jid, {
        text: `╭─⌈ ⚾ *MLB BASEBALL* ⌋\n├─⊷ *${PREFIX}baseball scores*\n│  └⊷ Today's MLB scores\n├─⊷ *${PREFIX}baseball standings*\n│  └⊷ MLB standings\n├─⊷ *${PREFIX}mlb scores*\n│  └⊷ Alias for baseball\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });
      const sub = args[0].toLowerCase();

      if (sub === 'standings') {
        const res = await axios.get(`${ESPN_BASE}/baseball/mlb/standings`, { timeout: 15000 });
        const groups = res.data?.children || [];
        let text = `╭─⌈ ⚾ *MLB STANDINGS* ⌋\n│\n`;

        for (const group of groups.slice(0, 2)) {
          const league = group.name || 'League';
          text += `├─⊷ 📋 *${league}*\n`;
          const divs = group.children || [];
          for (const div of divs.slice(0, 3)) {
            text += `├─⊷ *${div.name || 'Division'}*\n`;
            const entries = div.standings?.entries || [];
            entries.slice(0, 5).forEach((team, i) => {
              const s = team.stats || [];
              const w = s.find(x => x.name === 'wins')?.value || 0;
              const l = s.find(x => x.name === 'losses')?.value || 0;
              const name = team.team?.abbreviation || '???';
              text += `│  └⊷ *${i + 1}.* ${name} │ ${w}W-${l}L\n`;
            });
          }
        }
        text += `╰───\n\n⚡ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
        await sock.sendMessage(jid, { text }, { quoted: m });
      } else {
        const res = await axios.get(`${ESPN_BASE}/baseball/mlb/scoreboard`, { timeout: 15000 });
        const events = res.data?.events || [];
        if (events.length === 0) throw new Error('No MLB games found today');

        let text = `╭─⌈ ⚾ *MLB SCORES* ⌋\n│\n`;
        events.slice(0, 15).forEach(ev => {
          const comp = ev.competitions?.[0];
          const teams = comp?.competitors || [];
          const home = teams.find(t => t.homeAway === 'home');
          const away = teams.find(t => t.homeAway === 'away');
          const status = ev.status?.type?.shortDetail || '';
          text += `├─⊷ ${away?.team?.abbreviation || '???'} *${away?.score || '0'}* @ ${home?.team?.abbreviation || '???'} *${home?.score || '0'}*\n`;
          text += `│  └⊷ ${status}\n`;
        });
        text += `╰───\n\n⚡ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
        await sock.sendMessage(jid, { text }, { quoted: m });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
    } catch (error) {
      console.error('❌ [BASEBALL]', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `╭─⌈ ❌ *BASEBALL ERROR* ⌋\n├─⊷ ${error.message}\n├─⊷ Try again later\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }
  }
};
