/**
 * scheduler.js — scheduled daily messages to owner
 *
 * All times are Africa/Nairobi (EAT, UTC+3) regardless of server timezone.
 *
 * Good morning : 07:00 EAT  (GOODMORNING_HOUR / GOODMORNING_MINUTE)
 * Good night   : 22:30 EAT  (GOODNIGHT_HOUR   / GOODNIGHT_MINUTE)
 *
 * Override via env vars (0-23 / 0-59):
 *   GOODMORNING_HOUR, GOODMORNING_MINUTE
 *   GOODNIGHT_HOUR,   GOODNIGHT_MINUTE
 */

import { getBotName } from './botname.js';

const TIMEZONE = 'Africa/Nairobi';

const GOODMORNING_HOUR   = parseInt(process.env.GOODMORNING_HOUR   ?? '7',  10);
const GOODMORNING_MINUTE = parseInt(process.env.GOODMORNING_MINUTE ?? '0',  10);
const GOODNIGHT_HOUR     = parseInt(process.env.GOODNIGHT_HOUR     ?? '22', 10);
const GOODNIGHT_MINUTE   = parseInt(process.env.GOODNIGHT_MINUTE   ?? '30', 10);

function buildMorningMessages(name) {
    return [
        `╭⊷『 ☀️ GOOD MORNING 』\n│\n` +
        `├⊷ *To:* Owner 👑\n` +
        `├⊷ *Wish:* Have a great day! 🌅\n` +
        `├⊷ *Note:* Rise and conquer today 💪\n` +
        `├⊷ *Anti-delete:* ✅ Running\n` +
        `├⊷ *Status Detect:* ✅ Watching\n` +
        `├⊷ *Anti-ViewOnce:* ✅ Active\n` +
        `└⊷ *Connection:* ✅ Stable\n\n` +
        `╰⊷ *${name} Online* 🐾`,

        `╭⊷『 ☀️ GOOD MORNING 』\n│\n` +
        `├⊷ *To:* Boss 👑\n` +
        `├⊷ *Wish:* New day, new wins! 🌤️\n` +
        `├⊷ *Note:* You've got this today 🔥\n` +
        `├⊷ *Anti-delete:* ✅ Running\n` +
        `├⊷ *All systems:* ✅ Active\n` +
        `├⊷ *Security:* ✅ Protected\n` +
        `└⊷ *Speed:* ✅ Optimized\n\n` +
        `╰⊷ *${name} ready for the day* 🐺`,

        `╭⊷『 ☀️ GOOD MORNING 』\n│\n` +
        `├⊷ *To:* Owner 👑\n` +
        `├⊷ *Wish:* Start strong today! 🌞\n` +
        `├⊷ *Note:* Make today count 🏆\n` +
        `├⊷ *Anti-delete:* ✅ Running\n` +
        `├⊷ *Commands:* ✅ Ready\n` +
        `├⊷ *Connection:* ✅ Stable\n` +
        `└⊷ *Status:* ✅ Online 24/7\n\n` +
        `╰⊷ *${name} is with you* 🐺`,
    ];
}

function buildNightMessages(name) {
    return [
        `╭⊷『 🌙 GOOD NIGHT 』\n│\n` +
        `├⊷ *To:* Owner 👑\n` +
        `├⊷ *Wish:* Sweet dreams 😴\n` +
        `├⊷ *Note:* You deserve the rest ✨\n` +
        `├⊷ *Anti-delete:* ✅ Running\n` +
        `├⊷ *Status Detect:* ✅ Watching\n` +
        `├⊷ *Anti-ViewOnce:* ✅ Active\n` +
        `└⊷ *Connection:* ✅ Stable\n\n` +
        `╰⊷ *${name} is keeping watch* 🐺`,

        `╭⊷『 🌙 GOOD NIGHT 』\n│\n` +
        `├⊷ *To:* Boss 👑\n` +
        `├⊷ *Wish:* Sleep tight 💫\n` +
        `├⊷ *Note:* You worked hard today ⭐\n` +
        `├⊷ *Anti-delete:* ✅ Running\n` +
        `├⊷ *All systems:* ✅ Active\n` +
        `├⊷ *Security:* ✅ Protected\n` +
        `└⊷ *Speed:* ✅ Optimized\n\n` +
        `╰⊷ *${name} never sleeps* 🐺`,

        `╭⊷『 🌙 GOOD NIGHT 』\n│\n` +
        `├⊷ *To:* Owner 👑\n` +
        `├⊷ *Wish:* Rest well tonight 🌟\n` +
        `├⊷ *Note:* Tomorrow will be great 💪\n` +
        `├⊷ *Anti-delete:* ✅ Running\n` +
        `├⊷ *Commands:* ✅ Ready\n` +
        `├⊷ *Connection:* ✅ Stable\n` +
        `└⊷ *Status:* ✅ Online 24/7\n\n` +
        `╰⊷ *${name} Online* 🐾`,
    ];
}

let _sock              = null;
let _intervalId        = null;
let _lastMorningDay    = -1;
let _lastNightDay      = -1;

function getNairobiTime() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TIMEZONE,
        hour:     'numeric',
        minute:   'numeric',
        day:      'numeric',
        hour12:   false
    }).formatToParts(now);
    const get = type => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
    return { h: get('hour'), min: get('minute'), day: get('day') };
}

function random(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function checkAndSend() {
    if (!_sock) return;

    const ownerJid = global.OWNER_CLEAN_JID;
    if (!ownerJid) return;

    const { h, min, day } = getNairobiTime();
    const name = getBotName() || 'Silent Wolf';

    if (h === GOODMORNING_HOUR && min === GOODMORNING_MINUTE && day !== _lastMorningDay) {
        _lastMorningDay = day;
        try {
            await _sock.sendMessage(ownerJid, { text: random(buildMorningMessages(name)) });
            console.log(`[scheduler] ✅ Good morning message sent to owner at ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')} EAT`);
        } catch (e) {
            console.log(`[scheduler] ❌ Failed to send good morning: ${e.message}`);
        }
    }

    if (h === GOODNIGHT_HOUR && min === GOODNIGHT_MINUTE && day !== _lastNightDay) {
        _lastNightDay = day;
        try {
            await _sock.sendMessage(ownerJid, { text: random(buildNightMessages(name)) });
            console.log(`[scheduler] ✅ Good night message sent to owner at ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')} EAT`);
        } catch (e) {
            console.log(`[scheduler] ❌ Failed to send good night: ${e.message}`);
        }
    }
}

export function startScheduler(sock) {
    _sock = sock;
    if (_intervalId) clearInterval(_intervalId);

    setTimeout(checkAndSend, 15 * 1000);
    _intervalId = setInterval(checkAndSend, 60 * 1000);

    const { h, min } = getNairobiTime();
    globalThis._wolfSysStats = globalThis._wolfSysStats || {};
    globalThis._wolfSysStats.schedulerEAT = `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')} EAT`;
}

export function updateSchedulerSock(sock) {
    _sock = sock;
}

export function stopScheduler() {
    if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
}
