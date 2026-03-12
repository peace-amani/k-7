import { getCommandInfo } from '../../lib/apiRegistry.js';
import { getBotName } from '../../lib/botname.js';

export default {
    name: 'fetchapi',
    aliases: ['testapi', 'pingapi'],
    category: 'owner',
    desc: 'Test if a command API is reachable and measure latency',
    usage: '.fetchapi <command>',
    ownerOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatJid = msg.key.remoteJid;
        const reply = (text) => sock.sendMessage(chatJid, { text }, { quoted: msg });
        const BOT_NAME = extra?.BOT_NAME || getBotName() || 'WOLFBOT';
        const cmdName = (args[0] || '').toLowerCase().trim();

        if (!cmdName) {
            await reply(
                `╭─⌈ 📡 *FETCH API* ⌋\n` +
                `│\n` +
                `├─⊷ *Usage:* ${PREFIX}fetchapi <command>\n` +
                `├─⊷ *Example:* ${PREFIX}fetchapi ytmp3\n` +
                `│\n` +
                `├─⊷ Tests if a command's API is online\n` +
                `├─⊷ Shows HTTP status & response time\n` +
                `│\n` +
                `╰⊷ *Powered by ${BOT_NAME.toUpperCase()}*`
            );
            return;
        }

        const info = getCommandInfo(cmdName);
        if (!info) {
            await reply(
                `❌ No API registered for *${cmdName}*.\n\n` +
                `Use *${PREFIX}getapi* to see all commands with APIs.`
            );
            return;
        }

        await sock.sendMessage(chatJid, {
            text: `⏳ *Testing API...*\n\n📦 Command: ${PREFIX}${cmdName}\n🔗 URL: ${info.currentUrl}`,
        }, { quoted: msg });

        try {
            const start = Date.now();
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            let status = 0;
            let statusText = '';
            let ok = false;

            try {
                const res = await fetch(info.currentUrl, {
                    method: 'HEAD',
                    signal: controller.signal,
                    headers: { 'User-Agent': 'WolfBot/1.0' },
                });
                status = res.status;
                statusText = res.statusText || '';
                ok = res.ok || res.status < 500;
            } catch (headErr) {
                const res2 = await fetch(info.currentUrl, {
                    method: 'GET',
                    signal: controller.signal,
                    headers: { 'User-Agent': 'WolfBot/1.0' },
                });
                status = res2.status;
                statusText = res2.statusText || '';
                ok = res2.ok || res2.status < 500;
            } finally {
                clearTimeout(timer);
            }

            const ms = Date.now() - start;
            const speedTag = ms < 500 ? '🟢 Fast' : ms < 1500 ? '🟡 Normal' : '🔴 Slow';
            const statusEmoji = ok ? '✅' : '❌';

            await reply(
                `╭─⌈ 📡 *API TEST — ${cmdName.toUpperCase()}* ⌋\n` +
                `│\n` +
                `├─⊷ 📦 *Command:* ${PREFIX}${cmdName}\n` +
                `├─⊷ 🔗 *URL:* ${info.currentUrl}\n` +
                `│\n` +
                `├─⊷ ${statusEmoji} *HTTP Status:* ${status} ${statusText}\n` +
                `├─⊷ ⚡ *Latency:* ${ms}ms (${speedTag})\n` +
                `├─⊷ ${ok ? '🟢 *API is ONLINE*' : '🔴 *API may be DOWN*'}\n` +
                `│\n` +
                (info.isOverridden ? `├─⊷ 🔄 *Using override* (not default)\n│\n` : '') +
                (ok ? '' : `├─⊷ 💡 Replace: ${PREFIX}replaceapi ${cmdName} <newurl>\n│\n`) +
                `╰⊷ *Powered by ${BOT_NAME.toUpperCase()}*`
            );
        } catch (err) {
            const isTimeout = err.name === 'AbortError';
            await reply(
                `╭─⌈ 📡 *API TEST — ${cmdName.toUpperCase()}* ⌋\n` +
                `│\n` +
                `├─⊷ 📦 *Command:* ${PREFIX}${cmdName}\n` +
                `├─⊷ 🔗 *URL:* ${info.currentUrl}\n` +
                `│\n` +
                `├─⊷ ❌ *Status:* ${isTimeout ? 'Timed out (10s)' : 'Unreachable'}\n` +
                `├─⊷ 💬 *Error:* ${err.message}\n` +
                `├─⊷ 🔴 *API appears to be DOWN*\n` +
                `│\n` +
                `├─⊷ 💡 *Fix:* ${PREFIX}replaceapi ${cmdName} <newurl>\n` +
                `│\n` +
                `╰⊷ *Powered by ${BOT_NAME.toUpperCase()}*`
            );
        }
    }
};
