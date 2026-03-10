import axios from 'axios';

export default {
  name: 'deepseek',
  description: 'DeepSeek AI - Advanced reasoning and coding model',
  category: 'ai',
  aliases: ['deep', 'dseek', 'dsai', 'deepseekr1'],
  usage: 'deepseek [question or request]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;

    let query = '';
    if (args.length > 0) {
      query = args.join(' ');
    } else if (m.quoted?.text) {
      query = m.quoted.text;
    } else {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🧠 *DEEPSEEK AI* ⌋\n├─⊷ *${PREFIX}deepseek <question>*\n│  └⊷ Ask DeepSeek anything\n├─⊷ *${PREFIX}deep <question>*\n│  └⊷ Alias for deepseek\n├─⊷ *${PREFIX}dseek <question>*\n│  └⊷ Alias for deepseek\n╰───`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const apis = [
        { name: 'DeepSeek', url: `https://apis.wolf.space/api/ai/deepseek?q=${encodeURIComponent(query)}` },
        { name: 'GPT', url: `https://apis.wolf.space/api/ai/gpt?q=${encodeURIComponent(query)}` }
      ];

      let aiResponse = '';
      let modelUsed = 'DeepSeek';

      for (const api of apis) {
        try {
          const res = await axios.get(api.url, {
            timeout: 35000,
            headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
          });
          const data = res.data;
          const text = data?.result || data?.response || data?.answer || data?.text || data?.content;
          if (text && text.trim()) {
            aiResponse = text.trim();
            modelUsed = api.name;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!aiResponse) throw new Error('All DeepSeek APIs failed');
      if (aiResponse.length > 4000) aiResponse = aiResponse.substring(0, 4000) + '\n\n_...(response truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `🧠 *DEEPSEEK AI*\n━━━━━━━━━━━━━━━━━\n${aiResponse}\n━━━━━━━━━━━━━━━━━\n🎯 *Model:* ${modelUsed}\n🐺 _Powered by WOLF AI_`
      }, { quoted: m });

    } catch (err) {
      console.error('[DEEPSEEK] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *DeepSeek AI Error*\n\n${err.message}\n\nPlease try again later.`
      }, { quoted: m });
    }
  }
};
