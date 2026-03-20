import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { xwolfSearch } from '../../lib/xwolfApi.js';

export default {
  name: 'yts',
  description: 'Search YouTube videos',
  category: 'Downloader',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p = prefix || '.';

    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🔍 *YTS SEARCH* ⌋\n│\n├─⊷ *${p}yts <search query>*\n│  └⊷ Search YouTube videos\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      const items = await xwolfSearch(query, 15);

      if (!items.length) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ No results found for "${query}". Try different keywords.` }, { quoted: m });
      }

      let text = `🔍 *${getBotName()} — YouTube Search*\n`;
      text += `📝 *Query:* "${query}"\n`;
      text += `📊 *Results:* ${items.length} found\n\n`;

      items.forEach((v, i) => {
        const ytUrl = `https://youtube.com/watch?v=${v.id}`;
        text += `*${i + 1}. ${v.title}*\n`;
        text += `   🅦 *URL:* ${ytUrl}\n`;
        text += `   ⏱️ *Duration:* ${v.duration || 'N/A'}\n`;
        text += `   📦 *Size:* ${v.size || 'N/A'}\n`;
        text += `   👤 *Channel:* ${v.channelTitle || 'Unknown'}\n\n`;
      });

      text += `┌───────────────────\n`;
      text += `│ 🐺 WOLFBOT DOWNLOAD TIPS\n`;
      text += `├───────────────────\n`;
      text += `│ • *${p}ytplay <url>* → Audio\n`;
      text += `│ • *${p}ytv <url>* → Video\n`;
      text += `│ • *${p}ytmp3 <url>* → MP3\n`;
      text += `│ • *${p}ytmp4 <url>* → MP4\n`;
      text += `└───────────────────`;

      await sock.sendMessage(jid, { text }, { quoted: m });
      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

    } catch (error) {
      console.error('❌ [YTS] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Search failed. Please try again later.` }, { quoted: m });
    }
  }
};
