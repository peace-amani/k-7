import { callAI } from '../../lib/aiHelper.js';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
  name: 'mixtral',
  description: 'Mixtral Mixture of Experts',
  category: 'ai',
  aliases: ["mixtralai","moe","mix"],
  usage: 'mixtral [question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    let query = args.length > 0 ? args.join(' ') : (m.quoted?.text || '');

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🔀 *MIXTRAL AI* ⌋\n├─⊷ *${PREFIX}mixtral <question>*\n│  └⊷ Mixtral Mixture of Experts\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      let reply = await callAI('mixtral', query);
      if (reply.length > 4000) reply = reply.substring(0, 4000) + '\n\n_...(truncated)_';

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(jid, {
        text: `🔀 *MIXTRAL AI*\n━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by ${getOwnerName().toUpperCase()} TECH_`
      }, { quoted: m });

    } catch (err) {
      console.error('[MIXTRAL] Error:', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ *mixtral AI Error*\n\n${err.message}\n\nPlease try again later.` }, { quoted: m });
    }
  }
};
