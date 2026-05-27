import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

function getServerPort() {
    if (process.env.PORT)        return parseInt(process.env.PORT);
    if (process.env.SERVER_PORT) return parseInt(process.env.SERVER_PORT);
    if (process.env.APP_PORT)    return parseInt(process.env.APP_PORT);
    return 3000;
}

async function fetchHealth(port) {
    const res = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function bar(usedMB, totalMB) {
    const pct = totalMB > 0 ? usedMB / totalMB : 0;
    const filled = Math.round(pct * 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${(pct * 100).toFixed(0)}%`;
}

export default {
    name: 'health',
    alias: ['healthcheck', 'botping', 'hc'],
    desc: 'Check web server health and bot status',
    category: 'owner',
    ownerOnly: false,

    async execute(sock, msg, args, prefix, extras) {
        const chatId = msg.key.remoteJid;
        const port   = getServerPort();
        const start  = Date.now();
        const wantJson = args[0] && ['json', 'raw', 'data', 'api'].includes(args[0].toLowerCase());

        let data;
        try {
            data = await fetchHealth(port);
        } catch (err) {
            await sock.sendMessage(chatId, {
                text: `❌ *WEB SERVER UNREACHABLE*\n\nFailed to reach http://localhost:${port}/health\nError: ${err.message}`
            }, { quoted: msg });
            return;
        }

        const latency = Date.now() - start;

        if (wantJson) {
            const json = JSON.stringify({ ...data, pingMs: latency }, null, 2);
            if (json.length > 3000) {
                const buf = Buffer.from(json, 'utf8');
                await sock.sendMessage(chatId, {
                    document: buf,
                    fileName: `bot_status_${Date.now()}.json`,
                    mimetype: 'application/json',
                    caption: `📄 *BOT STATUS JSON*\nPing: ${latency}ms`
                }, { quoted: msg });
            } else {
                await sock.sendMessage(chatId, {
                    text: `\`\`\`json\n${json}\n\`\`\``
                }, { quoted: msg });
            }
            return;
        }

        const statusEmoji = data.connected ? '🟢' : '🔴';
        const statusLabel = data.status === 'ok' ? '✅ HEALTHY' : '⚠️ DEGRADED';
        const memBar = bar(data.memoryMB, data.memoryTotalMB);

        const text =
            `╭─⌈ ${statusEmoji} *WEB SERVER HEALTH* ⌋\n│\n` +
            `│ *Status:*    ${statusLabel}\n` +
            `│ *Bot:*       ${data.connected ? '🟢 Connected' : '🔴 Disconnected'}\n` +
            `│ *Name:*      ${data.botName}\n` +
            `│ *Version:*   ${data.version}\n` +
            `│\n` +
            `├─⌈ 📊 *RESOURCES* ⌋\n│\n` +
            `│ *Uptime:*    ${data.uptime}\n` +
            `│ *Memory:*    ${memBar}\n` +
            `│           ${data.memoryMB} MB / ${data.memoryTotalMB} MB\n` +
            `│ *Platform:*  ${data.platform}\n` +
            `│ *Node:*      ${data.nodeVersion}\n` +
            `│\n` +
            `├─⌈ 🌐 *ENDPOINT* ⌋\n│\n` +
            `│ *Port:*      ${port}\n` +
            `│ *Ping:*      ${latency}ms\n` +
            `│ *At:*        ${new Date(data.timestamp).toLocaleTimeString()}\n` +
            `│\n` +
            `│ *JSON:*      ${prefix}health json\n` +
            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;

        await sock.sendMessage(chatId, { text }, { quoted: msg });
    }
};
