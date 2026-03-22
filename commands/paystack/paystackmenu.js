import { createRequire } from 'module';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName, buildMenuHeader } from '../../lib/menuHelper.js';

const require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = require('gifted-btns'); } catch {}

export default {
  name: 'paystackmenu',
  alias: ['paystack', 'mpesasettings', 'paymentmenu'],
  desc: 'Shows all Paystack M-Pesa payment commands',
  category: 'Paystack',
  usage: '.paystackmenu',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const BOT = getBotName();
    const owner = getOwnerName().toUpperCase();
    const header = buildMenuHeader('💳 PAYSTACK MENU', PREFIX);

    const bodyText =
      `${header}\n\n` +
      `╭─⊷ *⚙️ SETUP*\n│  • ${PREFIX}setpaystackkey\n╰─⊷\n\n` +
      `╭─⊷ *💳 PAYMENTS*\n│  • ${PREFIX}prompt\n╰─⊷`;

    const buttons = [
      {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: '📘 Paystack Guide',
          id: `${PREFIX}paystackguide`
        })
      },
      {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: '🏠 Main Menu',
          id: `${PREFIX}menu`
        })
      }
    ];

    if (giftedBtns?.sendInteractiveMessage) {
      try {
        await giftedBtns.sendInteractiveMessage(sock, jid, {
          text: bodyText,
          footer: `🐺 ${BOT}`,
          interactiveButtons: buttons
        });
        return;
      } catch {}
    }

    await sock.sendMessage(jid, {
      text: `${bodyText}\n\n🐺 *POWERED BY ${owner} TECH* 🐺`
    }, { quoted: m });
  },
};
