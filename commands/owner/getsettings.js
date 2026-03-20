import fs from 'fs';
import { getBotName } from '../../lib/botname.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWarnLimit as getPerGroupLimit } from '../../lib/warnings-store.js';
import db from '../../lib/database.js';
import { getStatusAntideleteInfo } from './antideletestatus.js';
import { getAntieditInfo } from './antiedit.js';
import { detectPlatform } from '../../lib/platformDetect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function safeReadJSON(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch {}
    return null;
}

function getPrefix() {
    if (global.prefix) return global.prefix;
    if (global.CURRENT_PREFIX) return global.CURRENT_PREFIX;
    if (process.env.PREFIX) return process.env.PREFIX;
    return '?';
}

function getPrefixlessStatus() {
    const cfg = safeReadJSON(path.join(__dirname, '../../data/prefix.json'));
    return cfg?.isPrefixless || false;
}

function getBotMode() {
    const data = safeReadJSON(path.join(__dirname, '../../bot_mode.json'));
    return data?.mode || 'public';
}

function getMenuStyle() {
    const data = safeReadJSON(path.join(__dirname, '../menus/current_style.json'));
    return data?.current || '1';
}

function getMenuImage() {
    const imgPath1 = path.join(__dirname, '../menus/media/wolfbot.jpg');
    const imgPath2 = path.join(__dirname, '../media/wolfbot.jpg');
    if (fs.existsSync(imgPath1)) return imgPath1;
    if (fs.existsSync(imgPath2)) return imgPath2;
    return null;
}

function getMenuImageUrl() {
    const configPaths = [
        path.join(__dirname, '../../data/menuimage.json'),
        path.join(__dirname, '../../data/menu_image.json')
    ];
    for (const p of configPaths) {
        const data = safeReadJSON(p);
        if (data?.url) return data.url;
    }
    return getMenuImage() ? 'Local (wolfbot.jpg)' : 'Default';
}

function getFooter() {
    const data = safeReadJSON(path.join(__dirname, '../../data/footer.json'));
    return data?.footer || `${getBotName()} is the ALPHA`;
}

function getAutotypingState() {
    const data = safeReadJSON(path.join(__dirname, '../../data/autotyping/config.json'));
    if (!data || !data.mode || data.mode === 'off') return 'OFF';
    return `ON (${data.mode})`;
}

function getAutorecordingState() {
    const data = safeReadJSON(path.join(__dirname, '../../data/autorecording/config.json'));
    if (!data || !data.mode || data.mode === 'off') return 'OFF';
    return `ON (${data.mode})`;
}

function getAutoreadState() {
    const data = safeReadJSON(path.join(__dirname, '../../autoread_settings.json'));
    if (!data || !data.enabled) return 'OFF';
    return `ON (${data.mode || 'both'})`;
}

function getAutoViewStatusState() {
    const data = safeReadJSON(path.join(__dirname, '../../data/autoViewConfig.json'));
    if (!data) return 'OFF';
    return data.enabled ? 'ON' : 'OFF';
}

function getAutoDownloadStatusState() {
    const data = safeReadJSON(path.join(__dirname, '../../data/autoDownloadStatusConfig.json'));
    if (!data || !data.enabled) return 'OFF';
    return `ON (${data.mode || 'private'})`;
}

function getAutoreactStatusState() {
    const mgr = globalThis._autoReactManager;
    const data = mgr ? mgr.config : safeReadJSON(path.join(__dirname, '../../data/autoReactConfig.json'));
    if (!data || !data.enabled) return 'OFF';
    const mode = data.mode || 'fixed';
    if (mode === 'random') return 'ON (random)';
    const emoji = data.fixedEmoji || data.emoji || '';
    return `ON (fixed${emoji ? ' ' + emoji : ''})`;
}

function getAnticallState() {
    const data = safeReadJSON(path.join(__dirname, '../../anticall.json'));
    if (!data) return 'OFF';
    const settings = data.settings || {};
    const first = Object.values(settings).find(s => s?.enabled);
    if (!first) return 'OFF';
    return `ON (${first.mode || 'decline'})`;
}

function getAnticallMessage() {
    const data = safeReadJSON(path.join(__dirname, '../../anticall.json'));
    if (!data) return '—';
    const settings = data.settings || {};
    const first = Object.values(settings).find(s => s?.enabled);
    if (!first?.autoMessage || !first?.message) return 'None';
    const msg = first.message;
    return msg.length > 38 ? msg.substring(0, 38) + '…' : msg;
}

function getAntiViewOnceState() {
    const data = safeReadJSON(path.join(__dirname, '../../data/antiviewonce/config.json'));
    if (!data) return 'OFF';
    if (data.gc && data.pm) {
        const gc = data.gc.enabled ? data.gc.mode.toUpperCase() : 'OFF';
        const pm = data.pm.enabled ? data.pm.mode.toUpperCase() : 'OFF';
        if (gc === 'OFF' && pm === 'OFF') return 'OFF';
        return `GC: ${gc} | PM: ${pm}`;
    }
    if (!data.enabled || data.mode === 'off') return 'OFF';
    return (data.mode || 'private').toUpperCase();
}

function getAntibugState() {
    const cfg = globalThis._antibugConfig;
    if (!cfg || typeof cfg !== 'object') return 'Not configured';
    const enabled = Object.values(cfg).filter(v => v?.enabled);
    if (enabled.length === 0) return 'OFF';
    return `${enabled.length} group(s)`;
}

function getAntilinkState() {
    const cfg = globalThis._antilinkConfig;
    if (!cfg || typeof cfg !== 'object') return 'Not configured';
    const enabled = Object.values(cfg).filter(v => v?.enabled);
    if (enabled.length === 0) return 'OFF';
    return `${enabled.length} group(s)`;
}

function getAntispamState() {
    const cfg = globalThis._antispamConfig;
    if (!cfg || typeof cfg !== 'object') return 'Not configured';
    const enabled = Object.values(cfg).filter(v => v?.enabled);
    if (enabled.length === 0) return 'OFF';
    return `${enabled.length} group(s)`;
}

function getOnlinePresenceState() {
    const data = safeReadJSON(path.join(__dirname, '../../data/presence/config.json'));
    if (!data || !data.enabled) return 'OFF';
    return `ON (${data.mode || 'online'})`;
}

function getDispState() {
    const data = safeReadJSON(path.join(__dirname, '../../disp_settings.json'));
    if (!data) return 'OFF';
    const groups = Object.keys(data).filter(k => data[k]?.enabled);
    if (groups.length === 0) return 'OFF';
    return `${groups.length} group(s)`;
}

async function getWelcomeStatus() {
    try {
        const data = await db.getConfig('welcome_data', {});
        const count = data && typeof data === 'object' ? Object.keys(data).length : 0;
        return count ? `${count} group(s)` : 'No groups';
    } catch {}
    return 'No groups';
}

async function getGoodbyeStatus() {
    try {
        const data = await db.getConfig('goodbye_data', {});
        const count = data && typeof data === 'object' ? Object.keys(data).length : 0;
        return count ? `${count} group(s)` : 'No groups';
    } catch {}
    return 'No groups';
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const min = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (min > 0) parts.push(`${min}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

function countCommands(dir) {
    let count = 0;
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const full = path.join(dir, item);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) count += countCommands(full);
            else if (item.endsWith('.js')) count++;
        }
    } catch {}
    return count;
}

export default {
    name: 'getsettings',
    alias: ['settings', 'config', 'botconfig', 'showconfig'],
    description: 'View all bot settings and configuration',
    category: 'owner',

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager } = extra;

        const isSudoUser = extra?.isSudo ? extra.isSudo() : false;
        if (!jidManager.isOwner(msg) && !isSudoUser) {
            return sock.sendMessage(chatId, {
                text: '❌ *Owner Only Command!*\n\nOnly the bot owner can view settings.'
            }, { quoted: msg });
        }

        try {
            const ownerNumber = global.OWNER_CLEAN_NUMBER || global.OWNER_NUMBER || sock.user?.id?.split('@')[0] || 'Unknown';
            const isPrefixless = getPrefixlessStatus();
            const prefix = isPrefixless ? 'none (prefixless)' : getPrefix();
            const mode = getBotMode();
            const menuStyle = getMenuStyle();
            const menuImageUrl = getMenuImageUrl();
            const footer = getFooter();

            const autotyping = getAutotypingState();
            const autorecording = getAutorecordingState();
            const autoread = getAutoreadState();
            const autoViewStatus = getAutoViewStatusState();
            const autoDownloadStatus = getAutoDownloadStatusState();
            const autoreactStatus = getAutoreactStatusState();

            const anticall = getAnticallState();
            const anticallMsg = getAnticallMessage();
            const antiViewOnce = getAntiViewOnceState();
            const antibug = getAntibugState();
            const antilink = getAntilinkState();
            const antispam = getAntispamState();
            const onlinePresence = getOnlinePresenceState();
            const dispState = getDispState();

            const warnLimit = getPerGroupLimit('default');
            const welcomeStatus = await getWelcomeStatus();
            const goodbyeStatus = await getGoodbyeStatus();

            let antidelete = 'Unknown';
            try {
                const adCfg = await db.getConfig('antidelete_settings', null);
                if (adCfg && typeof adCfg.enabled === 'boolean') {
                    antidelete = adCfg.enabled ? (adCfg.mode || 'private').toUpperCase() : 'OFF';
                } else {
                    antidelete = 'OFF';
                }
            } catch {}

            let antidemote = 'Not configured';
            try {
                const adm = await db.getConfig('antidemote_config', null);
                if (adm && typeof adm === 'object') {
                    const en = Object.values(adm).filter(v => v?.enabled);
                    antidemote = en.length ? `${en.length} group(s)` : 'OFF';
                }
            } catch {}

            let antipromote = 'Not configured';
            try {
                const apm = safeReadJSON(path.join(__dirname, '../../data/antipromote/config.json'))
                    || await db.getConfig('antipromote_config', null);
                if (apm && typeof apm === 'object') {
                    const en = Object.values(apm).filter(v => v?.enabled);
                    antipromote = en.length ? `${en.length} group(s)` : 'OFF';
                }
            } catch {}

            let antideleteStatusDisplay = 'OFF';
            try {
                const adsInfo = getStatusAntideleteInfo();
                if (adsInfo.enabled) {
                    antideleteStatusDisplay = (adsInfo.mode || 'private').toUpperCase();
                }
            } catch {}

            let antieditDisplay = 'OFF';
            try {
                const aeInfo = getAntieditInfo();
                if (aeInfo.gc.enabled || aeInfo.pm.enabled) {
                    const gcMode = aeInfo.gc.enabled ? aeInfo.gc.mode.toUpperCase() : 'OFF';
                    const pmMode = aeInfo.pm.enabled ? aeInfo.pm.mode.toUpperCase() : 'OFF';
                    antieditDisplay = `GC: ${gcMode} | PM: ${pmMode}`;
                }
            } catch {}

            let readReceipts = 'Not set';
            try {
                const rrPref = await db.getConfig('read_receipts_pref', null);
                if (rrPref?.mode === 'all') readReceipts = 'ON';
                else if (rrPref?.mode === 'none') readReceipts = 'OFF';
            } catch {}

            const platform = detectPlatform();
            const uptime = formatUptime(process.uptime());
            const memUsage = `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`;
            const totalCmds = globalThis._loadedCommandCount || countCommands(path.join(__dirname, '../../commands'));

            let caption = `⚙️  \`W.O.L.F  𝚂𝙴𝚃𝚃𝙸𝙽𝙶𝚂\`\n\n`;

            caption += `┌─── *BASIC CONFIG* ───\n`;
            caption += `│ ◎ *Bot Name:* ${getBotName()}\n`;
            caption += `│ ◎ *Owner:* ${ownerNumber}\n`;
            caption += `│ ◎ *Prefix:* ${prefix}\n`;
            caption += `│ ◎ *Prefixless:* ${isPrefixless ? '✅ ON' : '❌ OFF'}\n`;
            caption += `│ ◎ *Mode:* ${mode.toUpperCase()}\n`;
            caption += `│ ◎ *Menu Style:* ${menuStyle}\n`;
            caption += `│ ◎ *Menu Image:* ${menuImageUrl}\n`;
            caption += `│ ◎ *Footer:* ${footer.length > 40 ? footer.substring(0, 40) + '…' : footer}\n`;
            caption += `│ ◎ *Read Receipts:* ${readReceipts}\n`;
            caption += `│ ◎ *Online Presence:* ${onlinePresence}\n`;
            caption += `│ ◎ *Disappearing Msgs:* ${dispState}\n`;
            caption += `└──────────────\n\n`;

            caption += `┌─── *AUTOMATION* ───\n`;
            caption += `│ ◎ *Autotyping:* ${autotyping}\n`;
            caption += `│ ◎ *Autorecording:* ${autorecording}\n`;
            caption += `│ ◎ *Autoread:* ${autoread}\n`;
            caption += `│ ◎ *Auto View Status:* ${autoViewStatus}\n`;
            caption += `│ ◎ *Auto Download Status:* ${autoDownloadStatus}\n`;
            caption += `│ ◎ *Autoreact Status:* ${autoreactStatus}\n`;
            caption += `└──────────────\n\n`;

            caption += `┌─── *PROTECTION* ───\n`;
            caption += `│ ◎ *Anticall:* ${anticall}\n`;
            caption += `│ ◎ *Anticall Msg:* ${anticallMsg}\n`;
            caption += `│ ◎ *Antidelete:* ${antidelete}\n`;
            caption += `│ ◎ *Antidelete Status:* ${antideleteStatusDisplay}\n`;
            caption += `│ ◎ *Antiedit:* ${antieditDisplay}\n`;
            caption += `│ ◎ *Anti-ViewOnce:* ${antiViewOnce}\n`;
            caption += `│ ◎ *Antilink:* ${antilink}\n`;
            caption += `│ ◎ *Antispam:* ${antispam}\n`;
            caption += `│ ◎ *Antibug:* ${antibug}\n`;
            caption += `│ ◎ *Antidemote:* ${antidemote}\n`;
            caption += `│ ◎ *Antipromote:* ${antipromote}\n`;
            caption += `│ ◎ *Warn Limit:* ${warnLimit}\n`;
            caption += `└──────────────\n\n`;

            caption += `┌─── *GROUP FEATURES* ───\n`;
            caption += `│ ◎ *Welcome:* ${welcomeStatus}\n`;
            caption += `│ ◎ *Goodbye:* ${goodbyeStatus}\n`;
            caption += `└──────────────\n\n`;

            caption += `┌─── *BOT STATS* ───\n`;
            caption += `│ ◎ *Uptime:* ${uptime}\n`;
            caption += `│ ◎ *Memory:* ${memUsage}\n`;
            caption += `│ ◎ *Commands:* ${totalCmds}\n`;
            caption += `│ ◎ *Node:* ${process.version}\n`;
            caption += `│ ◎ *Platform:* ${platform}\n`;
            caption += `│ ◎ *OS:* ${process.platform} ${process.arch}\n`;
            caption += `└──────────────\n\n`;

            caption += `🕒 *Updated:* ${new Date().toLocaleString()}\n`;
            caption += `🔧 *Use* \`${PREFIX}setsetting\` *to change settings*`;

            const imagePath = getMenuImage();

            if (imagePath) {
                const imageBuffer = fs.readFileSync(imagePath);
                await sock.sendMessage(chatId, {
                    image: imageBuffer,
                    caption: caption,
                    mimetype: 'image/jpeg'
                }, { quoted: msg });
            } else {
                await sock.sendMessage(chatId, { text: caption }, { quoted: msg });
            }

        } catch (error) {
            console.error('[GetSettings] Error:', error);
            await sock.sendMessage(chatId, {
                text: '❌ Failed to load settings: ' + error.message
            }, { quoted: msg });
        }
    }
};
