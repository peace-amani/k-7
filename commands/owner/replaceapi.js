import { createRequire } from 'module';
import { getCommandInfo, setCommandApi, resetCommandApi } from '../../lib/apiRegistry.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { getBotName } from '../../lib/botname.js';

const _req = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = _req('gifted-btns'); } catch {}

export default {
    name: 'replaceapi',
    aliases: ['setapi', 'swapapi'],
    category: 'owner',
    desc: 'Replace the API endpoint for a command instantly (no restart needed)',
    usage: '.replaceapi <command> <newurl> | .replaceapi <command> reset',
    ownerOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatJid = msg.key.remoteJid;
        const reply = (text) => sock.sendMessage(chatJid, { text }, { quoted: msg });
        const BOT_NAME = extra?.BOT_NAME || getBotName() || 'WOLFBOT';
        const buttonMode = await isButtonModeEnabled();
        const cmdName = (args[0] || '').toLowerCase().trim();
        const newUrl = (args[1] || '').trim();

        if (!cmdName) {
            const text =
                `╭─⌈ 🔄 *REPLACE API* ⌋\n` +
                `│\n` +
                `├─⊷ *Usage:*\n` +
                `│   └⊷ ${PREFIX}replaceapi <cmd> <newurl>\n` +
                `│   └⊷ ${PREFIX}replaceapi <cmd> reset\n` +
                `│\n` +
                `├─⊷ *Examples:*\n` +
                `│   └⊷ ${PREFIX}replaceapi ytmp3 https://newapi.com/ytmp3\n` +
                `│   └⊷ ${PREFIX}replaceapi gpt reset\n` +
                `│\n` +
                `├─⊷ 📋 List all APIs: *${PREFIX}getapi*\n` +
                `│\n` +
                `╰⊷ *Powered by ${BOT_NAME.toUpperCase()}*`;
            await reply(text);
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

        if (newUrl.toLowerCase() === 'reset') {
            const ok = resetCommandApi(cmdName);
            await reply(
                ok
                    ? `╭─⌈ ♻️ *API RESET — ${cmdName.toUpperCase()}* ⌋\n` +
                      `│\n` +
                      `├─⊷ ✅ *Restored to default:*\n` +
                      `│   └⊷ ${info.defaultUrl}\n` +
                      `│\n` +
                      `╰⊷ *Powered by ${BOT_NAME.toUpperCase()}*`
                    : `❌ Failed to reset API for *${cmdName}*.`
            );
            return;
        }

        if (!newUrl) {
            await reply(
                `⚠️ Please provide a new URL.\n\n` +
                `Usage: *${PREFIX}replaceapi ${cmdName} <newurl>*\n` +
                `Reset: *${PREFIX}replaceapi ${cmdName} reset*\n\n` +
                `Current API:\n${info.currentUrl}`
            );
            return;
        }

        if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
            await reply(
                `❌ *Invalid URL.* Must start with http:// or https://\n\n` +
                `Example:\n${PREFIX}replaceapi ${cmdName} https://newapi.com/endpoint`
            );
            return;
        }

        const oldUrl = info.currentUrl;
        const ok = setCommandApi(cmdName, newUrl);
        if (!ok) {
            await reply(`❌ Failed to save API override for *${cmdName}*. Check disk space or file permissions.`);
            return;
        }

        const text =
            `╭─⌈ ✅ *API REPLACED — ${cmdName.toUpperCase()}* ⌋\n` +
            `│\n` +
            `├─⊷ 📦 *Command:* ${PREFIX}${cmdName}\n` +
            `│\n` +
            `├─⊷ ❌ *Old API:*\n` +
            `│   └⊷ ${oldUrl}\n` +
            `│\n` +
            `├─⊷ ✅ *New API:*\n` +
            `│   └⊷ ${newUrl}\n` +
            `│\n` +
            `├─⊷ ⚡ *Live:* Change is active immediately\n` +
            `├─⊷ ♻️ *Undo:* ${PREFIX}replaceapi ${cmdName} reset\n` +
            `│\n` +
            `╰⊷ *Powered by ${BOT_NAME.toUpperCase()}*`;

        if (buttonMode && giftedBtns) {
            try {
                await giftedBtns.sendButtons(sock, chatJid, {
                    text,
                    footer: BOT_NAME,
                    buttons: [
                        { type: 'reply', title: '📡 Fetch API', payload: `${PREFIX}fetchapi ${cmdName}` },
                        { type: 'reply', title: '♻️ Reset to Default', payload: `${PREFIX}replaceapi ${cmdName} reset` },
                    ],
                    headerType: 1,
                }, msg);
                return;
            } catch {}
        }

        await reply(text);
    }
};
