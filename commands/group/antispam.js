import { createRequire } from 'module';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { getBotName } from '../../lib/botname.js';

const _requireAs = createRequire(import.meta.url);
let giftedBtnsAs;
try { giftedBtnsAs = _requireAs('gifted-btns'); } catch (e) {}

const SPAM_THRESHOLD_DEFAULT = 3;
const SPAM_WINDOW_MS = 10000;

function getConfig() {
    if (typeof globalThis._antispamConfig === 'object' && globalThis._antispamConfig !== null) {
        return globalThis._antispamConfig;
    }
    return {};
}

function saveConfig(data) {
    globalThis._antispamConfig = data;
    if (typeof globalThis._saveAntispamConfig === 'function') {
        globalThis._saveAntispamConfig(data);
    }
}

export function isEnabled(chatJid) {
    const config = getConfig();
    const gc = config[chatJid];
    return gc?.enabled === true;
}

export function getAction(chatJid) {
    const config = getConfig();
    return config[chatJid]?.action || 'warn';
}

export function getThreshold(chatJid) {
    const config = getConfig();
    return config[chatJid]?.threshold || SPAM_THRESHOLD_DEFAULT;
}

export function getGroupConfig(chatJid) {
    const config = getConfig();
    return config[chatJid] || null;
}

export function checkSpam(chatJid, senderJid, messageText) {
    if (!globalThis._antispamTracker) globalThis._antispamTracker = new Map();

    const tracker = globalThis._antispamTracker;
    const key = `${chatJid}::${senderJid}`;
    const now = Date.now();
    const threshold = getThreshold(chatJid);

    const existing = tracker.get(key);

    if (!existing) {
        tracker.set(key, { lastMsg: messageText, count: 1, lastTime: now });
        return false;
    }

    const timeDiff = now - existing.lastTime;

    if (timeDiff > SPAM_WINDOW_MS) {
        tracker.set(key, { lastMsg: messageText, count: 1, lastTime: now });
        return false;
    }

    if (existing.lastMsg === messageText) {
        existing.count += 1;
        existing.lastTime = now;
        tracker.set(key, existing);

        if (existing.count >= threshold) {
            tracker.delete(key);
            return true;
        }
        return false;
    }

    tracker.set(key, { lastMsg: messageText, count: 1, lastTime: now });
    return false;
}

export function resetUserTracker(chatJid, senderJid) {
    if (!globalThis._antispamTracker) return;
    globalThis._antispamTracker.delete(`${chatJid}::${senderJid}`);
}

const antispamCommand = {
    name: 'antispam',
    aliases: ['spamfilter', 'antispamfilter'],
    category: 'group',
    desc: 'Detect & auto-action repeated consecutive messages in groups or DMs.',
    usage: '.antispam on warn | .antispam on block | .antispam off | .antispam status | .antispam threshold <number>',
    groupOnly: false,
    adminOnly: false,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatJid = msg.key.remoteJid;
        const reply = (text) => sock.sendMessage(chatJid, { text }, { quoted: msg });
        const config = getConfig();
        const gc = config[chatJid] || {};
        const prefix = PREFIX || extra?.prefix || '.';
        const BOT_NAME = extra?.BOT_NAME || 'WOLFBOT';
        const subCmd = (args[0] || '').toLowerCase();
        const subArg = (args[1] || '').toLowerCase();

        const buttonMode = await isButtonModeEnabled();

        if (!subCmd || subCmd === 'status') {
            const enabled = gc.enabled === true;
            const action = gc.action || 'warn';
            const threshold = gc.threshold || SPAM_THRESHOLD_DEFAULT;
            const status = enabled
                ? `✅ *ACTIVE* — Action: *${action.toUpperCase()}* — Threshold: *${threshold} msgs*`
                : `❌ *INACTIVE*`;

            if (buttonMode && giftedBtnsAs) {
                try {
                    const btns = [
                        { type: 'reply', title: '⚠️ Warn Mode', payload: `${prefix}antispam on warn` },
                        { type: 'reply', title: '🔨 Block Mode', payload: `${prefix}antispam on block` },
                        { type: 'reply', title: '❌ Turn Off', payload: `${prefix}antispam off` },
                    ];
                    await giftedBtnsAs.sendButtons(sock, chatJid, {
                        text: `🚫 *ANTI-SPAM SYSTEM*\n\n📊 *Status:* ${status}\n\n🔧 *Threshold:* ${threshold} repeated messages trigger action\n⏱️ *Window:* 10 seconds\n\nChoose an action:`,
                        footer: BOT_NAME,
                        buttons: btns,
                        headerType: 1,
                    }, msg);
                    return;
                } catch {}
            }

            await reply(
                `╭─⌈ 🚫 *ANTI-SPAM* ⌋\n` +
                `│\n` +
                `├─⊷ *${prefix}antispam on warn*\n` +
                `│  └⊷ Enable — warn spammers\n` +
                `├─⊷ *${prefix}antispam on block*\n` +
                `│  └⊷ Enable — block & remove spammers\n` +
                `├─⊷ *${prefix}antispam off*\n` +
                `│  └⊷ Disable spam detection\n` +
                `├─⊷ *${prefix}antispam threshold <1-10>*\n` +
                `│  └⊷ Set repeated msg trigger count\n` +
                `├─⊷ *${prefix}antispam reset @user*\n` +
                `│  └⊷ Clear a user's spam record\n` +
                `│\n` +
                `├─⊷ 📊 *Status:* ${status}\n` +
                `├─⊷ 🔧 *Threshold:* ${threshold} repeated msgs\n` +
                `├─⊷ ⏱️ *Window:* 10s\n` +
                `│\n` +
                `╰⊷ *Powered by ${getBotName().toUpperCase()}*`
            );
            return;
        }

        if (subCmd === 'on') {
            const action = (subArg === 'block') ? 'block' : 'warn';
            config[chatJid] = { ...gc, enabled: true, action };
            saveConfig(config);
            await reply(
                `╭─⌈ 🚫 *ANTI-SPAM: ENABLED* ⌋\n` +
                `├─⊷ 🎯 *Action:* ${action === 'block' ? '🔨 Block + Kick' : '⚠️ Warn'}\n` +
                `├─⊷ 🔁 *Threshold:* ${gc.threshold || SPAM_THRESHOLD_DEFAULT} repeated msgs\n` +
                `├─⊷ ⏱️ *Window:* 10 seconds\n` +
                `╰─⊷ ✅ Spam detection is now active!`
            );
            return;
        }

        if (subCmd === 'off') {
            config[chatJid] = { ...gc, enabled: false };
            saveConfig(config);
            await reply(`╭─⌈ 🚫 *ANTI-SPAM: DISABLED* ⌋\n╰─⊷ ❌ Spam detection turned off.`);
            return;
        }

        if (subCmd === 'threshold') {
            const num = parseInt(subArg, 10);
            if (isNaN(num) || num < 2 || num > 10) {
                await reply(`⚠️ Please provide a number between 2 and 10.\nExample: ${prefix}antispam threshold 3`);
                return;
            }
            config[chatJid] = { ...gc, threshold: num };
            saveConfig(config);
            await reply(`✅ *Anti-Spam threshold set to ${num} repeated messages.*`);
            return;
        }

        if (subCmd === 'reset') {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (mentioned.length === 0) {
                await reply(`⚠️ Please mention a user to reset.\nExample: ${prefix}antispam reset @user`);
                return;
            }
            for (const jid of mentioned) {
                resetUserTracker(chatJid, jid);
            }
            const nums = mentioned.map(j => j.split('@')[0]);
            await reply(`✅ *Spam tracker reset for:* ${nums.map(n => '+' + n).join(', ')}`);
            return;
        }

        await reply(`❓ Unknown subcommand. Use: ${prefix}antispam on warn | on block | off | status | threshold <n>`);
    }
};

export default antispamCommand;
