import axios from 'axios';

export default {
  name: 'replitai',
  description: 'Replit AI - Replit\'s code-focused AI assistant',
  category: 'ai',
  aliases: ['rplit', 'repai', 'replitcode'],
  usage: 'replitai [coding question or request]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 💻 *REPLIT AI* ⌋\n├─⊷ *${PREFIX}replitai <question>*\n│  └⊷ Replit code-focused AI\n├─⊷ *${PREFIX}rplit <question>*\n│  └⊷ Alias for replitai\n╰───`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.get(`https://apis.wolf.space/api/ai/replit?q=${encodeURIComponent(query)}`, {
        timeout: 30000,
        headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
      });

      const data = res.data;
      const text = data?.result || data?.response || data?.answer || data?.text || data?.content;
      if (!text || !text.trim()) throw new Error('Empty response from Replit AI');

      let reply = text.trim();
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `💻 *REPLIT AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
      }, { quoted: m });

    } catch (err) {
      console.error('[REPLITAI] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *Replit AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
