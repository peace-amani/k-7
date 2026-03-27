import translate from "@iamtraction/google-translate";
import { createRequire } from 'module';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';

const _require = createRequire(import.meta.url);
let sendInteractiveMessage;
try { ({ sendInteractiveMessage } = _require('gifted-btns')); } catch (e) {}

export default {
  name: "translate",
  description: "Translate text into a target language",
  usage: ".translate <lang> <text>",
  async execute(sock, m, args) {
    try {
      let targetLang = args.shift();
      let text;

      if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        text =
          m.message.extendedTextMessage.contextInfo.quotedMessage?.conversation ||
          m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text ||
          "No text found in reply";
      } else {
        text = args.join(" ");
      }

      if (!targetLang || !text) {
        await sock.sendMessage(m.key.remoteJid, {
          text: `╭─⌈ 🌍 *TRANSLATE* ⌋\n│\n├─⊷ *translate <lang> <text>*\n│  └⊷ Translate text to target language\n│\n├─⊷ *Reply*\n│  └⊷ Reply to a message with .translate <lang>\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`,
        });
        return;
      }

      const result = await translate(text, { to: targetLang });
      const translated = result.text;
      const outText = `🌍 *Translated to ${targetLang.toUpperCase()}:*\n\n${translated}`;

      if (isButtonModeEnabled() && typeof sendInteractiveMessage === 'function') {
        try {
          await sendInteractiveMessage(sock, m.key.remoteJid, {
            text: outText,
            footer: '🌍 Silent Wolf Translate',
            interactiveButtons: [
              {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Translation', copy_code: translated })
              }
            ]
          });
          return;
        } catch (btnErr) {
          console.log('[Translate] Button send failed:', btnErr.message);
        }
      }

      await sock.sendMessage(m.key.remoteJid, { text: outText });
    } catch (err) {
      console.error("❌ Translate error:", err);
      await sock.sendMessage(m.key.remoteJid, {
        text: "❌ Error translating message.",
      });
    }
  },
};
