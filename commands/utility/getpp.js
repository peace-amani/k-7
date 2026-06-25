import axios from "axios";

const FALLBACK_PP = "https://files.catbox.moe/lvcwnf.jpg";

export default {
  name: "getpp",
  alias: ["getprofilepic", "wolfgetpp"],
  desc: "Fetch someone's profile picture 🐺",
  category: "utility",
  usage: ".getpp [@user | reply to message]",

  async execute(sock, m) {
    const chatId = m.key.remoteJid;
    const isGroup = chatId.endsWith("@g.us");
    const isOwner = m.key.fromMe;

    if (!isGroup && !isOwner) {
      return sock.sendMessage(chatId, {
        text: "⚠️ Only the Alpha Wolf (Owner) can use this command in DMs.",
      }, { quoted: m });
    }

    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted    = m.message?.extendedTextMessage?.contextInfo?.participant;
    const target    = mentioned || quoted;

    if (!target) {
      return sock.sendMessage(chatId, {
        text: "⚠️ You must *mention* someone or *reply to* their message to fetch their profile picture. 🐾",
      }, { quoted: m });
    }

    await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

    try {
      let ppUrl;
      try {
        ppUrl = await sock.profilePictureUrl(target, "image");
      } catch {
        ppUrl = FALLBACK_PP;
      }

      const response = await axios.get(ppUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
      });

      const buffer = Buffer.from(response.data);

      await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });
      await sock.sendMessage(chatId, {
        image:   buffer,
        caption: `🐺 *Target:* @${target.split("@")[0]}\n📸 Profile picture retrieved successfully!`,
        mentions: [target],
      }, { quoted: m });

    } catch (error) {
      await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });
      console.error("🐺 Error in getpp command:", error);
      await sock.sendMessage(chatId, {
        text: `❌ Failed to retrieve profile picture!\n\n⚙️ Error: ${error.message}`,
      }, { quoted: m });
    }
  },
};
