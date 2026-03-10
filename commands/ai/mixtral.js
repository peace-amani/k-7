import axios from 'axios';

export default {
  name: 'mixtral',
  description: 'Mixtral AI - Mixture of Experts language model by Mistral AI',
  category: 'ai',
  aliases: ['mixtralai', 'moe', 'mix'],
  usage: 'mixtral [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🔀 *MIXTRAL AI* ⌋\n├─⊷ *${PREFIX}mixtral <question>*\n│  └⊷ Mixture of Experts AI\n├─⊷ *${PREFIX}moe <question>*\n│  └⊷ Alias for mixtral\n╰───`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.get(`https://apis.wolf.space/api/ai/mixtral?q=${encodeURIComponent(query)}`, {
        timeout: 30000,
        headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
      });

      const data = res.data;
      const text = data?.result || data?.response || data?.answer || data?.text || data?.content;
      if (!text || !text.trim()) throw new Error('Empty response from Mixtral');

      let reply = text.trim();
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `🔀 *MIXTRAL AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
      }, { quoted: m });

    } catch (err) {
      console.error('[MIXTRAL] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *Mixtral AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
