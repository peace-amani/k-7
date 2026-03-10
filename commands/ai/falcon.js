import axios from 'axios';

export default {
  name: 'falcon',
  description: 'Falcon AI - Technology Innovation Institute open-source LLM',
  category: 'ai',
  aliases: ['falconai', 'falcon40b', 'tii'],
  usage: 'falcon [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🦅 *FALCON AI* ⌋\n├─⊷ *${PREFIX}falcon <question>*\n│  └⊷ Ask Falcon AI anything\n├─⊷ *${PREFIX}falconai <question>*\n│  └⊷ Alias for falcon\n╰───`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.get(`https://apis.wolf.space/api/ai/falcon?q=${encodeURIComponent(query)}`, {
        timeout: 30000,
        headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
      });

      const data = res.data;
      const text = data?.result || data?.response || data?.answer || data?.text || data?.content;
      if (!text || !text.trim()) throw new Error('Empty response from Falcon');

      let reply = text.trim();
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `🦅 *FALCON AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
      }, { quoted: m });

    } catch (err) {
      console.error('[FALCON] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *Falcon AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
