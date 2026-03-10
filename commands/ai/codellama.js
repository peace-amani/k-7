import axios from 'axios';

export default {
  name: 'codellama',
  description: 'Code Llama AI - Meta\'s specialized code generation model',
  category: 'ai',
  aliases: ['codel', 'codellm', 'llamacode', 'codeai'],
  usage: 'codellama [coding question or request]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 💻 *CODE LLAMA AI* ⌋\n├─⊷ *${PREFIX}codellama <request>*\n│  └⊷ Code generation & debugging\n├─⊷ *${PREFIX}codel <request>*\n│  └⊷ Alias for codellama\n╰───`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.get(`https://apis.wolf.space/api/ai/codellama?q=${encodeURIComponent(query)}`, {
        timeout: 35000,
        headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
      });

      const data = res.data;
      const text = data?.result || data?.response || data?.answer || data?.text || data?.content;
      if (!text || !text.trim()) throw new Error('Empty response from CodeLlama');

      let reply = text.trim();
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `💻 *CODE LLAMA AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
      }, { quoted: m });

    } catch (err) {
      console.error('[CODELLAMA] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *Code Llama Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
