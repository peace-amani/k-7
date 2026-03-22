import { createRequire } from 'module';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName, buildMenuHeader } from '../../lib/menuHelper.js';

const require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = require('gifted-btns'); } catch {}

export default {
  name: 'cpanelmenu',
  alias: ['panelmenu', 'ptero', 'pteromenu'],
  desc: 'Shows all Pterodactyl panel commands',
  category: 'CPanel',
  usage: '.cpanelmenu',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const BOT = getBotName();
    const owner = getOwnerName().toUpperCase();
    const header = buildMenuHeader('🖥️ CPANEL MENU', PREFIX);

    const bodyText =
      `${header}\n\n` +
      `╭─⊷ *⚙️ SETUP*\n│  • ${PREFIX}setlink\n│  • ${PREFIX}setkey\n╰─⊷\n\n` +
      `╭─⊷ *🏗️ NEST CONFIG*\n│  • ${PREFIX}nestconfig\n╰─⊷\n\n` +
      `╭─⊷ *👤 CREATION*\n│  • ${PREFIX}createuser\n│  • ${PREFIX}createpanel\n╰─⊷`;

    const buttons = [
      {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: '📘 Cpanel Guide',
          id: `${PREFIX}cpanelguide`
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
      text: `${bodyText}\n\n📘 *Cpanel Guide* → ${PREFIX}cpanelguide\n\n🐺 *POWERED BY ${owner} TECH* 🐺`
    }, { quoted: m });
  },
};
