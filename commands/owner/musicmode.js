import {
    isMusicModeEnabled,
    setMusicMode,
    getMusicSongs,
    addMusicSong,
    removeMusicSong,
    resetMusicSongs,
    sendMusicClip,
} from '../../lib/musicMode.js';
import { getOwnerName } from '../../lib/menuHelper.js';

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
        if (!isOwner && !isSudo) {
            return reply('❌ Owner only command.');
        }

        const sub = (args[0] || '').toLowerCase();

        switch (sub) {
            case 'on':
            case 'enable': {
                setMusicMode(true, chatId);
                return reply(
                    `╭─⌈ 🎵 *MUSIC MODE ENABLED* ⌋\n│\n` +
                    `├─⊷ Every bot response will be\n│  └⊷ Followed by a 30s song preview\n` +
                    `├─⊷ Songs in pool: *${getMusicSongs().length}*\n│  └⊷ Alan Walker, NF & more\n` +
                    `├─⊷ *${PREFIX}musicmode off*\n│  └⊷ Disable music mode\n` +
                    `├─⊷ *${PREFIX}musicmode test*\n│  └⊷ Send a test clip now\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                );
            }

            case 'off':
            case 'disable': {
                setMusicMode(false, chatId);
                return reply(
                    `╭─⌈ 🔇 *MUSIC MODE DISABLED* ⌋\n│\n` +
                    `├─⊷ Bot responses are now silent\n│  └⊷ No audio clips will be sent\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                );
            }

            case 'status': {
                const on = isMusicModeEnabled();
                const songs = getMusicSongs();
                return reply(
                    `╭─⌈ 🎵 *MUSIC MODE STATUS* ⌋\n│\n` +
                    `├─⊷ *Status:* ${on ? 'ENABLED ✅' : 'DISABLED ❌'}\n` +
                    `├─⊷ *Songs in pool:* ${songs.length}\n│  └⊷ 30s iTunes previews with vocals\n│\n` +
                    `├─⊷ *${PREFIX}musicmode on/off*\n│  └⊷ Toggle music mode\n` +
                    `├─⊷ *${PREFIX}musicmode list*\n│  └⊷ View all songs\n` +
                    `├─⊷ *${PREFIX}musicmode add <song name>*\n│  └⊷ Add a song to the pool\n` +
                    `├─⊷ *${PREFIX}musicmode remove <number>*\n│  └⊷ Remove a song by number\n` +
                    `├─⊷ *${PREFIX}musicmode reset*\n│  └⊷ Restore default songs\n` +
                    `├─⊷ *${PREFIX}musicmode test*\n│  └⊷ Send a test clip now\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                );
            }

            case 'list': {
                const songs = getMusicSongs();
                if (!songs.length) return reply('No songs in the pool.');
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
                        `├─⊷ *${PREFIX}musicmode add <artist song>*\n│  └⊷ e.g. NF the search\n│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                    );
                }
                const added = addMusicSong(query);
                return reply(
                    added
                        ? `╭─⌈ ✅ *SONG ADDED* ⌋\n│\n├─⊷ *${query}*\n│  └⊷ Added to the music pool\n├─⊷ Pool size: *${getMusicSongs().length}*\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                        : `⚠️ *"${query}"* is already in the pool.`
                );
            }

            case 'remove': {
                const idx = parseInt(args[1]) - 1;
                if (isNaN(idx)) {
                    return reply(
                        `╭─⌈ 🎵 *REMOVE SONG* ⌋\n│\n` +
                        `├─⊷ *${PREFIX}musicmode remove <number>*\n│  └⊷ Use the list to find the number\n` +
                        `├─⊷ *${PREFIX}musicmode list*\n│  └⊷ View song numbers\n│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                    );
                }
                const removed = removeMusicSong(idx);
                return reply(
                    removed
                        ? `╭─⌈ ✅ *SONG REMOVED* ⌋\n│\n├─⊷ *${removed}*\n│  └⊷ Removed from pool\n├─⊷ Remaining: *${getMusicSongs().length}*\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                        : `❌ Invalid number. Use *${PREFIX}musicmode list* to see valid numbers.`
                );
            }

            case 'reset': {
                resetMusicSongs();
                return reply(
                    `╭─⌈ 🔄 *POOL RESET* ⌋\n│\n` +
                    `├─⊷ Song pool restored to defaults\n│  └⊷ Alan Walker, NF & similar\n` +
                    `├─⊷ Total songs: *${getMusicSongs().length}*\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                );
            }

            case 'test': {
                await reply(
                    `╭─⌈ 🎵 *TESTING MUSIC MODE* ⌋\n│\n` +
                    `├─⊷ Fetching a 30s preview...\n│  └⊷ This may take a few seconds\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                );
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
                    `├─⊷ Plays a random 30s song preview\n│  └⊷ As a reply after every response\n│\n` +
                    `├─⊷ *${PREFIX}musicmode on*\n│  └⊷ Enable music mode\n` +
                    `├─⊷ *${PREFIX}musicmode off*\n│  └⊷ Disable music mode\n` +
                    `├─⊷ *${PREFIX}musicmode status*\n│  └⊷ View current status\n` +
                    `├─⊷ *${PREFIX}musicmode list*\n│  └⊷ View all songs in pool\n` +
                    `├─⊷ *${PREFIX}musicmode add <song name>*\n│  └⊷ e.g. alan walker faded\n` +
                    `├─⊷ *${PREFIX}musicmode remove <number>*\n│  └⊷ Remove a song by number\n` +
                    `├─⊷ *${PREFIX}musicmode reset*\n│  └⊷ Restore default songs\n` +
                    `├─⊷ *${PREFIX}musicmode test*\n│  └⊷ Send a test clip now\n│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                );
            }
        }
    }
};
