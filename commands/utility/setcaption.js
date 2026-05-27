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
          text: `📝 *Global Caption Settings*\n\nUsage: setcaption <your text>\n\nCurrent caption: "${currentCaption}"\n\nThis caption is appended to:\n• TikTok downloads\n• Instagram downloads\n• Twitter/X downloads\n• YouTube/Facebook video downloads\n• MediaFire file downloads\n• Snapchat Spotlight\n• AI image generation (imagine, anime, art, real)`
        }, { quoted: m });
        return;
      }

      const caption = args.join(' ');
      setUserCaption(userId, caption);

      await sock.sendMessage(jid, {
        text: `✅ Global caption set!\n\n"${caption}"\n\nWill appear on: TikTok, Instagram, Twitter, YouTube/Facebook video, MediaFire, Snapchat, and AI images.`
      }, { quoted: m });

    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Error setting caption` }, { quoted: m });
    }
  },
};
