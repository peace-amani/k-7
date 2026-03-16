import translate from "@iamtraction/google-translate";
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
  name: "translate",
  description: "Translate text into a target language",
  usage: ".translate <lang> <text>",
  async execute(sock, m, args) {
    try {
      let targetLang = args.shift(); // first argument = language
      let text;

      if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        // If replying to a message, grab that text
        text =
          m.message.extendedTextMessage.contextInfo.quotedMessage
            ?.conversation ||
          m.message.extendedTextMessage.contextInfo.quotedMessage
            ?.extendedTextMessage?.text ||
          "No text found in reply";
      } else {
        // Otherwise use the arguments after the language
        text = args.join(" ");
      }

      if (!targetLang || !text) {
        await sock.sendMessage(m.key.remoteJid, {
          text: `╭─⌈ 🌍 *TRANSLATE* ⌋\n│\n├─⊷ *translate <lang> <text>*\n│  └⊷ Translate text to target language\n│\n├─⊷ *Reply*\n│  └⊷ Reply to a message with .translate <lang>\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
        });
        return;
      }

      const result = await translate(text, { to: targetLang });

      await sock.sendMessage(m.key.remoteJid, {
        text: `🌍 Translated to *${targetLang}*:\n\n${result.text}`,
      });
    } catch (err) {
      console.error("❌ Translate error:", err);
      await sock.sendMessage(m.key.remoteJid, {
        text: "❌ Error translating message.",
      });
    }
  },
};
