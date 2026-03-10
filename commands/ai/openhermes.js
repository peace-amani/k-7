import axios from 'axios';

export default {
  name: 'openhermes',
  description: 'OpenHermes AI - High quality open-source chat model',
  category: 'ai',
  aliases: ['hermes', 'hermesai', 'ohermes'],
  usage: 'openhermes [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🏛️ *OPENHERMES AI* ⌋\n├─⊷ *${PREFIX}openhermes <question>*\n│  └⊷ Ask OpenHermes anything\n├─⊷ *${PREFIX}hermes <question>*\n│  └⊷ Alias for openhermes\n╰───`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const res = await axios.get(`https://apis.wolf.space/api/ai/openhermes?q=${encodeURIComponent(query)}`, {
        timeout: 30000,
        headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
      });

      const data = res.data;
      const text = data?.result || data?.response || data?.answer || data?.text || data?.content;
      if (!text || !text.trim()) throw new Error('Empty response from OpenHermes');

      let reply = text.trim();
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `🏛️ *OPENHERMES AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
      }, { quoted: m });

    } catch (err) {
      console.error('[OPENHERMES] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *OpenHermes AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
