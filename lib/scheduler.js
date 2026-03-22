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
const GOODNIGHT_HOUR   = parseInt(process.env.GOODNIGHT_HOUR   ?? '0',  10); // TEST: 00:55 EAT — change back to 22 after test
const GOODNIGHT_MINUTE = parseInt(process.env.GOODNIGHT_MINUTE ?? '55', 10); // TEST: change back to 30 after test

const GOODNIGHT_MESSAGES = [
    `🌙 *Good night, Owner!*\nHave a sweet dream and rest well. 😴✨\n\n_— Your WolfBot is keeping watch_ 🐺`,
    `🌙 *Good night, Boss!*\nYou deserve a peaceful rest. Sweet dreams! 🌟\n\n_— Your WolfBot never sleeps_ 🐺`,
    `🌙 *Good night, Owner!*\nTime to recharge. Sleep tight and dream big! 💫\n\n_— WolfBot on duty_ 🐺`,
    `🌙 *Good night!*\nMay your night be as amazing as you are. Sweet dreams! 🌙✨\n\n_— Your loyal WolfBot_ 🐺`,
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
