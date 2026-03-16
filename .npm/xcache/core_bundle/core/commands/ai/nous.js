import axios from 'axios';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
  name: 'nous',
  description: 'Nous Research AI model',
  category: 'ai',
  aliases: ["nousai","noushermes"],
  usage: 'nous [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 📚 *NOUS AI* ⌋\n├─⊷ *${PREFIX}nous <question>*\n│  └⊷ Nous Research AI model\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.post('https://apis.xwolf.space/api/ai/nous', { prompt: query }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'WolfBot/1.0' }
      });

      const text = res.data?.response || res.data?.result || res.data?.answer || res.data?.text;
      if (!text || !text.trim()) throw new Error('Empty response from nous');

      let reply = text.trim();
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `📚 *NOUS AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by ${getOwnerName().toUpperCase()} TECH_`
      }, { quoted: m });

    } catch (err) {
      console.error('[NOUS] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *nous AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
