import {
    isMusicModeEnabled,
    setMusicMode,
    getMusicSongs,
    addMusicSong,
    removeMusicSong,
    resetMusicSongs,
    clearMusicSongs,
    sendMusicClip,
} from '../../lib/musicMode.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import axios from 'axios';

async function verifyShortClip(query) {
    try {
        const res = await axios.get('https://itunes.apple.com/search', {
            params: { term: query, entity: 'song', limit: 5, media: 'music' },
            timeout: 8000
        });
        const results = (res.data?.results || []).filter(r => r.previewUrl);
        if (!results.length) return { ok: false, reason: 'notfound' };
        const track = results[0];
        const trackDuration = track.trackTimeMillis || 0;
        if (trackDuration > 60000) return { ok: false, reason: 'toolong', trackName: track.trackName, artistName: track.artistName };
        return { ok: true, trackName: track.trackName, artistName: track.artistName };
    } catch {
        return { ok: false, reason: 'error' };
    }
}

export default {
    name: 'musicmode',
    alias: ['mmode', 'musicbot', 'mm'],
    desc: 'Every bot response plays a random 30s music preview',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: msg });

        const isOwner = extra?.isOwner?.() || false;
        const isSudo  = extra?.isSudo?.()  || false;
        if (!isOwner && !isSudo) return reply('❌ Owner only command.');

        const sub = (args[0] || '').toLowerCase();

        switch (sub) {
            case 'on':
            case 'enable': {
                setMusicMode(true, chatId);
                const count = getMusicSongs().length;
                return reply(
                    `╭─⌈ 🎵 *MUSIC MODE* ⌋\n│\n` +
                    `├─⊷ Status: *ENABLED* ✅\n` +
                    `├─⊷ Songs in pool: *${count}*\n│  └⊷ ${count ? 'Alan Walker, NF & more' : 'Pool is empty — add songs first'}\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                );
            }

            case 'off':
            case 'disable': {
                setMusicMode(false, chatId);
                return reply(
                    `╭─⌈ 🔇 *MUSIC MODE* ⌋\n│\n` +
                    `├─⊷ Status: *DISABLED* ❌\n│  └⊷ No audio clips will be sent\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                );
            }

            case 'list': {
                const songs = getMusicSongs();
                if (!songs.length) {
                    return reply(
                        `╭─⌈ 🎵 *MUSIC POOL* ⌋\n│\n` +
                        `├─⊷ Pool is currently empty\n│  └⊷ Use *${PREFIX}musicmode add <song>*\n│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                    );
                }
                let text = `╭─⌈ 🎵 *MUSIC POOL (${songs.length})* ⌋\n│\n`;
                songs.forEach((s, i) => { text += `├─⊷ ${i + 1}. ${s}\n`; });
                text += `│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
                return reply(text);
            }

            case 'add': {
                const query = args.slice(1).join(' ').trim();
                if (!query) {
                    return reply(
                        `╭─⌈ 🎵 *ADD SONG* ⌋\n│\n` +
                        `├─⊷ *${PREFIX}musicmode add <song name>*\n│  └⊷ e.g. alan walker faded\n` +
                        `├─⊷ *${PREFIX}musicmode add <audio url>*\n│  └⊷ Reply audio with *${PREFIX}url* to get link\n│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                    );
                }

                const isUrl = /^https?:\/\//i.test(query);

                if (isUrl) {
                    // Direct URL — add without iTunes validation
                    const added = addMusicSong(query);
                    if (!added) return reply(`⚠️ That URL is already in the pool.`);
                    return reply(
                        `╭─⌈ ✅ *CLIP ADDED* ⌋\n│\n` +
                        `├─⊷ Direct audio URL saved\n│  └⊷ Will play as-is in music mode\n` +
                        `├─⊷ Pool size: *${getMusicSongs().length}*\n│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                    );
                }

                // Song name — validate via iTunes
                const check = await verifyShortClip(query);
                if (!check.ok) {
                    if (check.reason === 'toolong') {
                        return reply(
                            `╭─⌈ ⚠️ *SONG TOO LONG* ⌋\n│\n` +
                            `├─⊷ *${check.artistName} - ${check.trackName}*\n│  └⊷ Full track is too long for music mode\n` +
                            `├─⊷ Music mode only plays 30s clips\n│  └⊷ Use *${PREFIX}trim* to cut a short clip\n` +
                            `├─⊷ Then reply the clip with *${PREFIX}url*\n│  └⊷ And add the link here\n│\n` +
                            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                        );
                    }
                    return reply(
                        `╭─⌈ ❌ *SONG NOT FOUND* ⌋\n│\n` +
                        `├─⊷ No preview found for:\n│  └⊷ *${query}*\n` +
                        `├─⊷ Try a different name\n│  └⊷ e.g. alan walker faded\n│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                    );
                }
                const added = addMusicSong(query);
                if (!added) return reply(`⚠️ *"${query}"* is already in the pool.`);
                return reply(
                    `╭─⌈ ✅ *SONG ADDED* ⌋\n│\n` +
                    `├─⊷ *${check.artistName} - ${check.trackName}*\n│  └⊷ Added as: _${query}_\n` +
                    `├─⊷ Pool size: *${getMusicSongs().length}*\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                );
            }

            case 'clear': {
                clearMusicSongs();
                return reply(
                    `╭─⌈ 🗑️ *POOL CLEARED* ⌋\n│\n` +
                    `├─⊷ All songs removed from pool\n│  └⊷ Music mode will stay silent\n` +
                    `├─⊷ Use *${PREFIX}musicmode add <song>*\n│  └⊷ To add songs back\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                );
            }

            case 'remove': {
                const idx = parseInt(args[1]) - 1;
                if (isNaN(idx)) return reply(`❌ Usage: *${PREFIX}musicmode remove <number>* — use *${PREFIX}musicmode list* to see numbers.`);
                const removed = removeMusicSong(idx);
                return reply(
                    removed
                        ? `✅ *"${removed}"* removed. Pool now has *${getMusicSongs().length}* song(s).`
                        : `❌ Invalid number. Use *${PREFIX}musicmode list* to see valid numbers.`
                );
            }

            case 'reset': {
                resetMusicSongs();
                return reply(`🔄 Pool restored to defaults. *${getMusicSongs().length}* songs loaded.`);
            }

            case 'test': {
                const songs = getMusicSongs();
                if (!songs.length) return reply(`⚠️ Pool is empty. Add songs first with *${PREFIX}musicmode add <song>*`);
                await reply(`⏳ Fetching a 30s preview...`);
                try {
                    await sendMusicClip(sock, chatId, msg);
                } catch (e) {
                    return reply(`❌ Test failed: ${e.message}`);
                }
                return;
            }

            default: {
                const on = isMusicModeEnabled();
                return reply(
                    `╭─⌈ 🎵 *MUSIC MODE* ⌋\n│\n` +
                    `├─⊷ *Status:* ${on ? 'ON ✅' : 'OFF ❌'}\n` +
                    `├─⊷ Plays a 30s song preview\n│  └⊷ As reply after every response\n│\n` +
                    `├─⊷ *${PREFIX}musicmode on*\n│  └⊷ Enable music mode\n` +
                    `├─⊷ *${PREFIX}musicmode off*\n│  └⊷ Disable music mode\n` +
                    `├─⊷ *${PREFIX}musicmode list*\n│  └⊷ View songs in pool\n` +
                    `├─⊷ *${PREFIX}musicmode add <song name>*\n│  └⊷ Add a 30s song to the pool\n` +
                    `├─⊷ *${PREFIX}musicmode clear*\n│  └⊷ Clear all songs from pool\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                );
            }
        }
    }
};
