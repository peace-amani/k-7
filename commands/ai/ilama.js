import { callAI } from '../../lib/aiHelper.js';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
  name: 'ilama',
  description: 'LLaMA AI open-source model',
  category: 'ai',
  aliases: ["llama","llamaai"],
  usage: 'ilama [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🦙 *ILAMA AI* ⌋\n├─⊷ *${PREFIX}ilama <question>*\n│  └⊷ LLaMA AI open-source model\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      let reply = await callAI('llama', query);
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `🦙 *ILAMA AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by ${getOwnerName().toUpperCase()} TECH_`
      }, { quoted: m });

    } catch (err) {
      console.error('[ILAMA] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *ilama AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
