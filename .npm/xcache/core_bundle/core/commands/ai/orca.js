import axios from 'axios';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
  name: 'orca',
  description: 'Microsoft Orca AI',
  category: 'ai',
  aliases: ["orcaai","orca2"],
  usage: 'orca [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🐋 *ORCA AI* ⌋\n├─⊷ *${PREFIX}orca <question>*\n│  └⊷ Microsoft Orca AI\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.post('https://apis.xwolf.space/api/ai/orca', { prompt: query }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'WolfBot/1.0' }
      });

      const text = res.data?.response || res.data?.result || res.data?.answer || res.data?.text;
      if (!text || !text.trim()) throw new Error('Empty response from orca');

      let reply = text.trim();
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `🐋 *ORCA AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by ${getOwnerName().toUpperCase()} TECH_`
      }, { quoted: m });

    } catch (err) {
      console.error('[ORCA] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *orca AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
