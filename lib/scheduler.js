/**
 * scheduler.js — scheduled messages (goodnight, etc.)
 *
 * All times are in Africa/Nairobi (EAT, UTC+3) regardless of server timezone.
 *
 * Goodnight message: sent to owner every day at GOODNIGHT_HOUR:GOODNIGHT_MINUTE EAT.
 * Default: 10:30 PM EAT (22:30).
 *
 * Override via env vars:
 *   GOODNIGHT_HOUR   (0-23 EAT, default 22)
 *   GOODNIGHT_MINUTE (0-59, default 30)
 */

const TIMEZONE         = 'Africa/Nairobi';
const GOODNIGHT_HOUR   = parseInt(process.env.GOODNIGHT_HOUR   ?? '22', 10);
const GOODNIGHT_MINUTE = parseInt(process.env.GOODNIGHT_MINUTE ?? '30', 10);

const GOODNIGHT_MESSAGES = [
    `╭⊷『 🌙 GOOD NIGHT 』\n│\n` +
    `├⊷ *To:* Owner 👑\n` +
    `├⊷ *Wish:* Sweet dreams 😴\n` +
    `├⊷ *Note:* You deserve the rest ✨\n` +
    `├⊷ *Anti-delete:* ✅ Running\n` +
    `├⊷ *Status Detect:* ✅ Watching\n` +
    `├⊷ *Anti-ViewOnce:* ✅ Active\n` +
    `└⊷ *Connection:* ✅ Stable\n\n` +
    `╰⊷ *WolfBot is keeping watch* 🐺`,

    `╭⊷『 🌙 GOOD NIGHT 』\n│\n` +
    `├⊷ *To:* Boss 👑\n` +
    `├⊷ *Wish:* Sleep tight 💫\n` +
    `├⊷ *Note:* You worked hard today ⭐\n` +
    `├⊷ *Anti-delete:* ✅ Running\n` +
    `├⊷ *All systems:* ✅ Active\n` +
    `├⊷ *Security:* ✅ Protected\n` +
    `└⊷ *Speed:* ✅ Optimized\n\n` +
    `╰⊷ *WolfBot never sleeps* 🐺`,

    `╭⊷『 🌙 GOOD NIGHT 』\n│\n` +
    `├⊷ *To:* Owner 👑\n` +
    `├⊷ *Wish:* Rest well tonight 🌟\n` +
    `├⊷ *Note:* Tomorrow will be great 💪\n` +
    `├⊷ *Anti-delete:* ✅ Running\n` +
    `├⊷ *Commands:* ✅ Ready\n` +
    `├⊷ *Connection:* ✅ Stable\n` +
    `└⊷ *Status:* ✅ Online 24/7\n\n` +
    `╰⊷ *Silent Wolf Online* 🐾`,
];

let _sock        = null;
let _intervalId  = null;
let _lastSentDay = -1;

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

function getRandomMessage() {
    return GOODNIGHT_MESSAGES[Math.floor(Math.random() * GOODNIGHT_MESSAGES.length)];
}

async function checkAndSend() {
    if (!_sock) return;

    const ownerJid = global.OWNER_CLEAN_JID;
    if (!ownerJid) return;

    const { h, min, day } = getNairobiTime();

    if (h === GOODNIGHT_HOUR && min === GOODNIGHT_MINUTE && day !== _lastSentDay) {
        _lastSentDay = day;
        try {
            await _sock.sendMessage(ownerJid, { text: getRandomMessage() });
            console.log(`[scheduler] ✅ Goodnight message sent to owner at ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')} EAT`);
        } catch (e) {
            console.log(`[scheduler] ❌ Failed to send goodnight: ${e.message}`);
        }
    }
}

/**
 * Start the scheduler. Safe to call multiple times — only one interval runs.
 */
export function startScheduler(sock) {
    _sock = sock;
    if (_intervalId) clearInterval(_intervalId);

    // Delay first check by 15s to let owner JID load, then every minute
    setTimeout(checkAndSend, 15 * 1000);
    _intervalId = setInterval(checkAndSend, 60 * 1000);

    const { h, min } = getNairobiTime();
    console.log(`[scheduler] ✅ Started — current EAT time: ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')} | goodnight fires at ${String(GOODNIGHT_HOUR).padStart(2,'0')}:${String(GOODNIGHT_MINUTE).padStart(2,'0')} EAT daily`);
}

export function updateSchedulerSock(sock) {
    _sock = sock;
}

export function stopScheduler() {
    if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
}
