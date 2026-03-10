import axios from 'axios';

export default {
  name: 'orca',
  description: 'Orca AI - Microsoft\'s instruction-tuned LLM',
  category: 'ai',
  aliases: ['orcaai', 'orca2', 'orca13b'],
  usage: 'orca [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🐋 *ORCA AI* ⌋\n├─⊷ *${PREFIX}orca <question>*\n│  └⊷ Microsoft Orca AI model\n├─⊷ *${PREFIX}orca2 <question>*\n│  └⊷ Alias for orca\n╰───`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.get(`https://apis.wolf.space/api/ai/orca?q=${encodeURIComponent(query)}`, {
        timeout: 30000,
        headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
      });

      const data = res.data;
      const text = data?.result || data?.response || data?.answer || data?.text || data?.content;
      if (!text || !text.trim()) throw new Error('Empty response from Orca');

      let reply = text.trim();
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `🐋 *ORCA AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
      }, { quoted: m });

    } catch (err) {
      console.error('[ORCA] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *Orca AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
