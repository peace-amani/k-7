import { callAI } from '../../lib/aiHelper.js';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
  name: 'wormgpt',
  description: 'WormGPT AI assistant',
  category: 'ai',
  aliases: ["wgpt","evilgpt","darkai"],
  usage: 'wormgpt [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ ☠️ *WORMGPT AI* ⌋\n├─⊷ *${PREFIX}wormgpt <question>*\n│  └⊷ WormGPT AI assistant\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      let reply = await callAI('wormgpt', query);
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `☠️ *WORMGPT AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by ${getOwnerName().toUpperCase()} TECH_`
      }, { quoted: m });

    } catch (err) {
      console.error('[WORMGPT] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *wormgpt AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
