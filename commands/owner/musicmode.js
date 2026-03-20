import {
    isMusicModeEnabled,
    setMusicMode,
    getMusicClips,
    addMusicClip,
    removeMusicClip,
    resetMusicClips,
    sendMusicClip,
} from '../../lib/musicMode.js';
import { getBotName } from '../../lib/botname.js';

export default {
    name: 'musicmode',
    alias: ['mmode', 'musicbot', 'mm'],
    desc: 'Toggle music mode — every response is followed by a random short audio clip',
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
                setMusicMode(true, msg.key.remoteJid);
                return reply(
                    `🎵 *MUSIC MODE ON*\n\n` +
                    `Every bot response will now be followed by a random short audio clip.\n\n` +
                    `Clips loaded: ${getMusicClips().length}\n` +
                    `Use *${PREFIX}musicmode off* to disable.`
                );
            }

            case 'off':
            case 'disable': {
                setMusicMode(false, msg.key.remoteJid);
                return reply('🔇 *MUSIC MODE OFF*\n\nBot responses will no longer include audio clips.');
            }

            case 'status': {
                const on = isMusicModeEnabled();
                const clips = getMusicClips();
                return reply(
                    `🎵 *MUSIC MODE STATUS*\n\n` +
                    `Status: ${on ? 'ON ✅' : 'OFF ❌'}\n` +
                    `Clips: ${clips.length}\n\n` +
                    `*Commands:*\n` +
                    `• ${PREFIX}musicmode on/off\n` +
                    `• ${PREFIX}musicmode list\n` +
                    `• ${PREFIX}musicmode add <url>\n` +
                    `• ${PREFIX}musicmode remove <number>\n` +
                    `• ${PREFIX}musicmode reset\n` +
                    `• ${PREFIX}musicmode test`
                );
            }

            case 'list': {
                const clips = getMusicClips();
                if (!clips.length) return reply('No clips in the list.');
                let text = `🎵 *MUSIC CLIPS (${clips.length})*\n\n`;
                clips.forEach((url, i) => {
                    const short = url.length > 60 ? url.substring(0, 57) + '…' : url;
                    text += `${i + 1}. ${short}\n`;
                });
                return reply(text);
            }

            case 'add': {
                const url = args[1];
                if (!url || !url.startsWith('http')) {
                    return reply(`Usage: *${PREFIX}musicmode add <audio_url>*\nURL must start with http:// or https://`);
                }
                const added = addMusicClip(url);
                return reply(added
                    ? `✅ Clip added. Total: ${getMusicClips().length}`
                    : '⚠️ That URL is already in the list.'
                );
            }

            case 'remove': {
                const idx = parseInt(args[1]) - 1;
                if (isNaN(idx)) {
                    return reply(`Usage: *${PREFIX}musicmode remove <number>*\nUse *${PREFIX}musicmode list* to see numbers.`);
                }
                const removed = removeMusicClip(idx);
                return reply(removed
                    ? `✅ Removed: ${removed}\nRemaining: ${getMusicClips().length}`
                    : '❌ Invalid number.'
                );
            }

            case 'reset': {
                resetMusicClips();
                return reply(`🔄 Clip list reset to defaults. (${getMusicClips().length} clips)`);
            }

            case 'test': {
                await reply('🎵 Sending a test clip...');
                try {
                    await sendMusicClip(sock, chatId);
                } catch (e) {
                    return reply(`❌ Failed to send test clip: ${e.message}`);
                }
                return;
            }

            default: {
                const on = isMusicModeEnabled();
                return reply(
                    `🎵 *MUSIC MODE* — ${on ? 'ON ✅' : 'OFF ❌'}\n\n` +
                    `When enabled, every bot response is followed by a random short audio clip.\n\n` +
                    `*Commands:*\n` +
                    `• *${PREFIX}musicmode on* — Enable\n` +
                    `• *${PREFIX}musicmode off* — Disable\n` +
                    `• *${PREFIX}musicmode status* — Current status\n` +
                    `• *${PREFIX}musicmode list* — View all clips\n` +
                    `• *${PREFIX}musicmode add <url>* — Add a clip\n` +
                    `• *${PREFIX}musicmode remove <num>* — Remove a clip\n` +
                    `• *${PREFIX}musicmode reset* — Restore defaults\n` +
                    `• *${PREFIX}musicmode test* — Send a test clip\n\n` +
                    `Powered by *${getBotName().toUpperCase()}*`
                );
            }
        }
    }
};
