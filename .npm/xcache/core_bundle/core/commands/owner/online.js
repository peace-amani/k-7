import fs from 'fs';
import { getOwnerName } from '../../lib/menuHelper.js';

const PRESENCE_FILE = './data/presence/config.json';

function ensureDir() {
    if (!fs.existsSync('./data/presence')) {
        fs.mkdirSync('./data/presence', { recursive: true });
    }
}

function loadConfig() {
    ensureDir();
    try {
        if (fs.existsSync(PRESENCE_FILE)) {
            return JSON.parse(fs.readFileSync(PRESENCE_FILE, 'utf8'));
        }
    } catch {}
    return { enabled: false, mode: 'available', interval: 2 };
}

function saveConfig(config) {
    ensureDir();
    fs.writeFileSync(PRESENCE_FILE, JSON.stringify(config, null, 2));
}

export default {
    name: 'online',
    alias: ['ghost', 'presence', 'fakeonline', 'alwaysonline'],
    category: 'owner',
    description: 'Toggle always-online presence (hides last seen)',
    ownerOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager } = extra;

        const isSudoUser = extra?.isSudo ? extra.isSudo() : false;
        if (!jidManager.isOwner(msg) && !isSudoUser) {
            return sock.sendMessage(chatId, {
                text: '❌ *Owner Only Command*'
            }, { quoted: msg });
        }

        const command = args[0]?.toLowerCase() || 'toggle';
        let config = loadConfig();

        switch (command) {
            case 'on':
            case 'enable':
            case 'start': {
                config.enabled = true;
                config.startedAt = new Date().toISOString();
                saveConfig(config);

                clearInterval(global.PRESENCE_INTERVAL);
                global.PRESENCE_INTERVAL = setInterval(async () => {
                    try {
                        await sock.sendPresenceUpdate('available');
                    } catch {}
                }, (config.interval || 2) * 60000);

                try {
                    await sock.sendPresenceUpdate('available');
                } catch {}

                await sock.sendMessage(chatId, {
                    text:
                        `╭─⌈ 🟢 *ALWAYS ONLINE* ⌋\n` +
                        `│\n` +
                        `│ ✧ *Status:* ✅ ENABLED\n` +
                        `│ ✧ *Mode:* Always Online\n` +
                        `│ ✧ *Interval:* Every ${config.interval || 2} min\n` +
                        `│\n` +
                        `│ 👁️ Others will always see\n` +
                        `│ you as "Online"\n` +
                        `│ 🔒 Last seen is hidden\n` +
                        `│\n` +
                        `│ • \`${PREFIX}online off\` - Disable\n` +
                        `│ • \`${PREFIX}privacy\` - View all settings\n` +
                        `│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                break;
            }

            case 'off':
            case 'disable':
            case 'stop': {
                config.enabled = false;
                saveConfig(config);

                clearInterval(global.PRESENCE_INTERVAL);
                global.PRESENCE_INTERVAL = null;

                try {
                    await sock.sendPresenceUpdate('unavailable');
                } catch {}

                await sock.sendMessage(chatId, {
                    text:
                        `╭─⌈ 🔴 *ALWAYS ONLINE* ⌋\n` +
                        `│\n` +
                        `│ ✧ *Status:* ❌ DISABLED\n` +
                        `│\n` +
                        `│ Normal presence restored\n` +
                        `│ Last seen will show normally\n` +
                        `│\n` +
                        `│ • \`${PREFIX}online on\` - Re-enable\n` +
                        `│ • \`${PREFIX}privacy\` - View all settings\n` +
                        `│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                break;
            }

            default: {
                config.enabled = !config.enabled;
                saveConfig(config);

                if (config.enabled) {
                    clearInterval(global.PRESENCE_INTERVAL);
                    global.PRESENCE_INTERVAL = setInterval(async () => {
                        try {
                            await sock.sendPresenceUpdate('available');
                        } catch {}
                    }, (config.interval || 2) * 60000);

                    try {
                        await sock.sendPresenceUpdate('available');
                    } catch {}
                } else {
                    clearInterval(global.PRESENCE_INTERVAL);
                    global.PRESENCE_INTERVAL = null;
                    try {
                        await sock.sendPresenceUpdate('unavailable');
                    } catch {}
                }

                const status = config.enabled ? '✅ ENABLED' : '❌ DISABLED';
                const emoji = config.enabled ? '🟢' : '🔴';

                await sock.sendMessage(chatId, {
                    text:
                        `╭─⌈ ${emoji} *ALWAYS ONLINE* ⌋\n` +
                        `│\n` +
                        `│ ✧ *Status:* ${status}\n` +
                        `│\n` +
                        `│ ${config.enabled ? '👁️ You appear always online\n│ 🔒 Last seen is hidden' : '📱 Normal presence restored'}\n` +
                        `│\n` +
                        `│ • \`${PREFIX}online ${config.enabled ? 'off' : 'on'}\` - Toggle\n` +
                        `│ • \`${PREFIX}privacy\` - View all settings\n` +
                        `│\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                break;
            }
        }
    }
};
