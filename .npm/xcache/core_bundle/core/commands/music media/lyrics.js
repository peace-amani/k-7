import axios from "axios";
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: "lyrics",
    alias: ["lyric", "ly"],
    description: "Search for song lyrics by title or phrase",
    category: "music media",

    async execute(sock, msg, args) {
        const chatId = msg.key.remoteJid;
        const query  = args.join(" ").trim();

        if (!query) {
            return sock.sendMessage(chatId, {
                text:
                    `╭─⌈ 🎵 *LYRICS FINDER* ⌋\n│\n` +
                    `├─⊷ *Usage:* .lyrics <song title>\n│\n` +
                    `├─⊷ *Examples:*\n` +
                    `│  ▸ .lyrics what shall I render to Jehovah\n` +
                    `│  ▸ .lyrics Blinding Lights\n` +
                    `│  ▸ .lyrics Home by NF\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: '🔍', key: msg.key } });

        try {
            const result = await fetchLyrics(query);

            if (!result) {
                await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
                return sock.sendMessage(chatId, {
                    text: `❌ *No lyrics found for:*\n"${query}"\n\n💡 Try including the artist name.\nExample: .lyrics ${query} by <artist>`
                }, { quoted: msg });
            }

            await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

            const header =
                `╭─⌈ 🎵 *LYRICS* ⌋\n│\n` +
                `├─⊷ 🎶 *${result.title}*\n` +
                (result.artist ? `├─⊷ 👤 *${result.artist}*\n` : '') +
                `│\n╰───\n\n`;

            // WhatsApp has a 65,536 char limit; lyrics.ovh can be very long
            const maxLen   = 4000;
            const lyrics   = result.lyrics.trim();
            const trimmed  = lyrics.length > maxLen
                ? lyrics.substring(0, maxLen) + `\n\n📜 _(lyrics trimmed — search full version online)_`
                : lyrics;

            await sock.sendMessage(chatId, {
                text: header + trimmed
            }, { quoted: msg });

        } catch (err) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            await sock.sendMessage(chatId, {
                text: `❌ Error fetching lyrics: ${err.message}`
            }, { quoted: msg });
        }
    }
};

// ── API chain: try each source until one succeeds ────────────────────

async function fetchLyrics(query) {
    const sources = [
        () => fromPopCat(query),
        () => fromLyricsOvh(query),
        () => fromLyrist(query),
    ];

    for (const fn of sources) {
        try {
            const res = await fn();
            if (res?.lyrics && res.lyrics.trim().length > 30) return res;
        } catch {}
    }
    return null;
}

// Source 1 — PopCat public API (returns title, artist, lyrics)
async function fromPopCat(query) {
    const { data } = await axios.get(
        `https://api.popcat.xyz/lyrics?title=${encodeURIComponent(query)}`,
        { timeout: 10000 }
    );
    if (!data?.lyrics) throw new Error('no lyrics');
    return {
        title:  data.title  || query,
        artist: data.artist || '',
        lyrics: data.lyrics
    };
}

// Source 2 — lyrics.ovh (needs artist + title split)
async function fromLyricsOvh(query) {
    const { title, artist } = splitQuery(query);
    const { data } = await axios.get(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
        { timeout: 10000 }
    );
    if (!data?.lyrics) throw new Error('no lyrics');
    return { title, artist, lyrics: data.lyrics };
}

// Source 3 — lyrist (vercel, no key needed)
async function fromLyrist(query) {
    const { title, artist } = splitQuery(query);
    const url = artist && artist !== 'Unknown'
        ? `https://lyrist.vercel.app/api/${encodeURIComponent(title)}/${encodeURIComponent(artist)}`
        : `https://lyrist.vercel.app/api/${encodeURIComponent(title)}`;
    const { data } = await axios.get(url, { timeout: 10000 });
    if (!data?.lyrics) throw new Error('no lyrics');
    return {
        title:  data.title  || title,
        artist: data.artist || artist,
        lyrics: data.lyrics
    };
}

// Smart query splitter: "title by artist" or "artist - title" or plain title
function splitQuery(query) {
    const byMatch  = query.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) return { title: byMatch[1].trim(), artist: byMatch[2].trim() };

    const dashMatch = query.match(/^(.+?)\s+-\s+(.+)$/);
    if (dashMatch) return { title: dashMatch[2].trim(), artist: dashMatch[1].trim() };

    return { title: query.trim(), artist: 'Unknown' };
}
