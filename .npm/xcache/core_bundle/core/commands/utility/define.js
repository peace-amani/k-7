// commands/utility/define.js
import fetch from "node-fetch";
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
  name: "define",
  alias: ["meaning", "dict"],
  description: "Get the definition of a word (reply or type a word)",
  
  async execute(sock, m, args) {
    try {
      let word;

      // If user replies to a message, take that as the word
      if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        word =
          m.message.extendedTextMessage.contextInfo.quotedMessage?.conversation ||
          m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
      } else {
        word = args.join(" ");
      }

      if (!word) {
        await sock.sendMessage(m.key.remoteJid, { text: `╭─⌈ 🐺💚 *DICTIONARY* ⌋\n│\n├─⊷ *define <word>*\n│  └⊷ Get the definition of a word\n│\n├─⊷ *Reply*\n│  └⊷ Reply to a word with .define\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` }, { quoted: m });
        return;
      }

      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      if (!res.ok) {
        throw new Error("Word not found");
      }

      const data = await res.json();
      const definition = data[0]?.meanings[0]?.definitions[0]?.definition || "No definition found.";
      const example = data[0]?.meanings[0]?.definitions[0]?.example || "No example available.";

      let response = `
🌿🐺 *Silent Wolf Dictionary* 🐺🌿

🔎 *Word:*  🌱 ${word}
📖 *Definition:* 💚 ${definition}
📝 *Example:* ✨ ${example}
`;

      await sock.sendMessage(m.key.remoteJid, { text: response }, { quoted: m });

    } catch (e) {
      console.error("❌ Error in define command:", e);
      await sock.sendMessage(m.key.remoteJid, { text: "❌ Could not fetch definition. Try another word." }, { quoted: m });
    }
  },
};
