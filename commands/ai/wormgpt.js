import axios from 'axios';
import { getOwnerName } from '../../lib/menuHelper.js';

const WORMGPT_API = 'https://apis.xwolf.space/api/ai/wormgpt';
const WORMGPT_KEY = 'wxa_u_xwk7sch6xj';

export default {
  name: 'wormgpt',
  description: 'WormGPT AI assistant',
  category: 'ai',
  aliases: ['worm', 'wgpt', 'evilgpt', 'darkai'],
  usage: 'wormgpt [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ ☠️ *WORMGPT AI* ⌋\n├─⊷ *${PREFIX}wormgpt <question>*\n│  └⊷ WormGPT AI assistant\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const { data } = await axios.get(WORMGPT_API, {
        params: { q: query, key: WORMGPT_KEY },
        timeout: 30000
      });

      let reply = data?.result || data?.response || data?.answer || data?.text || JSON.stringify(data);
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `☠️ *WORMGPT AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by ${getOwnerName().toUpperCase()} TECH_`
      }, { quoted: m });

    } catch (err) {
      console.error('[WORMGPT] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *WormGPT AI Error*\n\n${err.message}\n\nPlease try again later.`
      }, { quoted: m });
    }
  }
};
