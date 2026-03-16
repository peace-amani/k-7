import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const GIFTED_API = 'https://api.giftedtech.co.ke/api/stalk/ipstalk';

export default {
  name: 'ipstalk',
  aliases: ['ipinfo2', 'iplookup', 'iptrack'],
  description: 'Look up information about an IP address',
  category: 'Stalker Commands',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;

    if (!args || !args[0]) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🔍 *IP STALKER* ⌋\n│\n├─⊷ *${prefix}ipstalk <IP address>*\n│  └⊷ Look up IP address info\n│\n├─⊷ *Example:*\n│  └⊷ ${prefix}ipstalk 41.90.70.195\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    const address = args[0].trim();
    await sock.sendMessage(jid, { react: { text: '🔍', key: m.key } });

    try {
      const res = await axios.get(globalThis._apiOverrides?.['ipstalk'] || GIFTED_API, {
        params: { apikey: 'gifted', address },
        timeout: 20000
      });

      if (!res.data?.success || !res.data?.result) {
        throw new Error('Could not retrieve IP information');
      }

      const d = res.data.result;

      const caption = `╭─⌈ 🌐 *IP ADDRESS INFO* ⌋\n│\n├─⊷ *🔢 IP:* ${address}\n├─⊷ *🌍 Country:* ${d.country || 'N/A'}\n├─⊷ *🗺️ Continent:* ${d.continent || 'N/A'}\n├─⊷ *📌 Country Code:* ${d.countryCode || 'N/A'}\n├─⊷ *📡 ASN:* ${d.asn || 'N/A'}\n├─⊷ *🏢 ISP/AS Name:* ${d.asName || 'N/A'}\n├─⊷ *🌐 AS Domain:* ${d.asDomain || 'N/A'}${d.continentCode ? `\n├─⊷ *🗺️ Continent Code:* ${d.continentCode}` : ''}\n│\n╰───────────────\n> 🐺 *${getBotName()} STALKER*`;

      await sock.sendMessage(jid, { text: caption }, { quoted: m });
      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

    } catch (error) {
      console.error('❌ [IPSTALK] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *IP Stalk Failed*\n\n⚠️ ${error.message}\n\n💡 Make sure the IP address is valid.`
      }, { quoted: m });
    }
  }
};
