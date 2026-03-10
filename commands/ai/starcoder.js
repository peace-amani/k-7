import axios from 'axios';

export default {
  name: 'starcoder',
  description: 'StarCoder AI - HuggingFace\'s code-focused large language model',
  category: 'ai',
  aliases: ['starcoderx', 'star', 'starcode', 'starcoder2'],
  usage: 'starcoder [coding question or request]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ ⭐ *STARCODER AI* ⌋\n├─⊷ *${PREFIX}starcoder <request>*\n│  └⊷ Advanced code generation\n├─⊷ *${PREFIX}star <request>*\n│  └⊷ Alias for starcoder\n╰───`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.get(`https://apis.wolf.space/api/ai/starcoder?q=${encodeURIComponent(query)}`, {
        timeout: 35000,
        headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
      });

      const data = res.data;
      const text = data?.result || data?.response || data?.answer || data?.text || data?.content;
      if (!text || !text.trim()) throw new Error('Empty response from StarCoder');

      let reply = text.trim();
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `⭐ *STARCODER AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
      }, { quoted: m });

    } catch (err) {
      console.error('[STARCODER] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *StarCoder AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
