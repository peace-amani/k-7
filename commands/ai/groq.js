import axios from 'axios';

export default {
  name: 'groq',
  description: 'Groq AI - Ultra-fast inference powered by LPU hardware',
  category: 'ai',
  aliases: ['groqai', 'gq', 'groqchat'],
  usage: 'groq [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ ⚡ *GROQ AI* ⌋\n├─⊷ *${PREFIX}groq <question>*\n│  └⊷ Ultra-fast AI responses\n├─⊷ *${PREFIX}groqai <question>*\n│  └⊷ Alias for groq\n╰───`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.get(`https://apis.wolf.space/api/ai/groq?q=${encodeURIComponent(query)}`, {
        timeout: 30000,
        headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
      });

      const data = res.data;
      const text = data?.result || data?.response || data?.answer || data?.text || data?.content;
      if (!text || !text.trim()) throw new Error('Empty response from Groq');

      let reply = text.trim();
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `⚡ *GROQ AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🚀 _Ultra-fast by WOLF AI_`
      }, { quoted: m });

    } catch (err) {
      console.error('[GROQ] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *Groq AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
