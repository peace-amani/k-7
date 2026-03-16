import { getBotName } from '../../lib/botname.js';

let getUserCaption, setUserCaption;

try {
    const tiktokModule = await import('../downloaders/tiktok.js');
    getUserCaption = tiktokModule.getUserCaption;
    setUserCaption = tiktokModule.setUserCaption;
} catch {
    const fallbackMap = new Map();
    getUserCaption = (userId) => fallbackMap.get(userId) || `${getBotName()} is the Alpha`;
    setUserCaption = (userId, caption) => fallbackMap.set(userId, caption);
}

export default {
  name: "setcaption",
  description: "Set custom caption for all media downloads",
  category: 'utility',
  async execute(sock, m, args) {
    const jid = m.key.remoteJid;
    const userId = m.key.participant || m.key.remoteJid;

    try {
      if (!args[0]) {
        const currentCaption = getUserCaption(userId);
        await sock.sendMessage(jid, {
          text: `📝 *Global Caption Settings*\n\nUsage: setcaption <your text>\n\nCurrent caption: "${currentCaption}"\n\nThis caption will be used for:\n• TikTok downloads\n• Instagram downloads\n• YouTube downloads\n• All media with captions`
        }, { quoted: m });
        return;
      }

      const caption = args.join(' ');
      setUserCaption(userId, caption);

      await sock.sendMessage(jid, {
        text: `✅ Global caption set!\n\n"${caption}"\n\nThis will be used for all your media downloads.`
      }, { quoted: m });

    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Error setting caption` }, { quoted: m });
    }
  },
};
