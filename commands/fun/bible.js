import axios from 'axios';
import { getBotName } from '../../lib/botname.js';

export default {
  name: "bible",
  alias: ["bibleverse", "bv", "scripture", "verse"],
  desc: "Search the Bible for verses matching a keyword.",
  use: ".bible <keyword>",

  execute: async (client, msg, args) => {
    const jid = msg.key.remoteJid;

    const query = args?.join(' ')?.trim();

    if (!query) {
      return client.sendMessage(jid, {
        text: `📖 *Bible Verse Search*\n\nProvide a keyword to search.\n\n*Usage:* .bible <keyword>\n\n*Examples:*\n• .bible God\n• .bible love\n• .bible faith\n• .bible Jesus`,
      }, { quoted: msg });
    }

    try {
      // Pick a random page from page 1–3 so repeat searches return variety
      const page = Math.floor(Math.random() * 3) + 1;

      const res = await axios.get('https://apiskeith.top/bible/search', {
        params: { q: query, page },
        timeout: 10000,
      });

      const data = res.data;

      if (!data?.status || !data?.result?.verses?.length) {
        // Fall back to page 1 if random page had no results
        const retry = await axios.get('https://apiskeith.top/bible/search', {
          params: { q: query, page: 1 },
          timeout: 10000,
        });
        if (!retry.data?.status || !retry.data?.result?.verses?.length) {
          return client.sendMessage(jid, {
            text: `📖 *Bible Search*\n\nNo verses found for *"${query}"*.\n\nTry a different keyword like: God, love, faith, hope, grace, mercy.`,
          }, { quoted: msg });
        }
        data.result = retry.data.result;
      }

      const { verses, totalResults, totalPages, version } = data.result;

      // Show up to 5 results
      const display = verses.slice(0, 5);

      const verseLines = display.map((v, i) => {
        // Strip trailing ellipsis if present and clean up
        const text = v.preview.replace(/…$/, '').trim();
        return `*${i + 1}. ${v.reference}*\n_"${text}"_`;
      }).join('\n\n');

      const versionLabel = version === 'K' ? 'KJV' : version;
      const pageInfo = totalPages > 1
        ? `\n📄 Showing page ${data.result.currentPage} of ${totalPages} (${totalResults.toLocaleString()} total verses)`
        : `\n📄 ${totalResults} verse${totalResults !== 1 ? 's' : ''} found`;

      const text =
        `📖 *Bible Search — "${query}"*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `${verseLines}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━` +
        pageInfo +
        `\n📚 Version: *${versionLabel}*`;

      await client.sendMessage(jid, { text }, { quoted: msg });

    } catch (err) {
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
      await client.sendMessage(jid, {
        text: `❌ *${getBotName()}:* ${isTimeout ? 'Bible API timed out. Please try again.' : `Couldn't fetch verses: ${err.message}`}`,
      }, { quoted: msg });
    }
  },
};
