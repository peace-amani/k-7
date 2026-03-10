import axios from 'axios';

export default {
  name: 'nemotron',
  description: 'Nemotron AI - NVIDIA\'s powerful language model',
  category: 'ai',
  aliases: ['nemotronai', 'nvidia', 'nvidiaai', 'nem'],
  usage: 'nemotron [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🟢 *NEMOTRON AI* ⌋\n├─⊷ *${PREFIX}nemotron <question>*\n│  └⊷ NVIDIA Nemotron model\n├─⊷ *${PREFIX}nvidia <question>*\n│  └⊷ Alias for nemotron\n╰───`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.get(`https://apis.wolf.space/api/ai/nemotron?q=${encodeURIComponent(query)}`, {
        timeout: 30000,
        headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
      });

      const data = res.data;
      const text = data?.result || data?.response || data?.answer || data?.text || data?.content;
      if (!text || !text.trim()) throw new Error('Empty response from Nemotron');

      let reply = text.trim();
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `🟢 *NEMOTRON AI (NVIDIA)*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
      }, { quoted: m });

    } catch (err) {
      console.error('[NEMOTRON] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *Nemotron AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
