// commands/utility/remind.js
import supabase from '../../lib/database.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const CONFIG_KEY = 'reminders_config';

// ── Persistent store ─────────────────────────────────────────────────────────
function loadData() {
    try {
        const d = supabase.getConfigSync(CONFIG_KEY, {});
        return {
            reminders:  Array.isArray(d.reminders)  ? d.reminders  : [],
            utcOffset:  typeof d.utcOffset === 'number' ? d.utcOffset : 1,
            nextId:     typeof d.nextId    === 'number' ? d.nextId    : 1
        };
    } catch { return { reminders: [], utcOffset: 1, nextId: 1 }; }
}

function saveData(data) {
    supabase.setConfig(CONFIG_KEY, data).catch(() => {});
}

// ── Time helpers ─────────────────────────────────────────────────────────────

function nowInOffset(utcOffset) {
    return new Date(Date.now() + utcOffset * 3600000);
}

// Return a Date object (UTC ms) for a wall-clock time string "HH:MM" in given UTC offset
function wallClockToUtcMs(hh, mm, utcOffset, addDays = 0) {
    const now = nowInOffset(utcOffset);
    const y = now.getUTCFullYear(), mo = now.getUTCMonth(), d = now.getUTCDate();
    // Build a UTC timestamp representing that wall time in the owner's offset
    return Date.UTC(y, mo, d + addDays, hh - utcOffset, mm);
}

// ── Natural language time parser ─────────────────────────────────────────────
// Returns { fireAt: <ms>, label: <string>, remainder: <remaining text> } or null
function parseTime(text, utcOffset) {
    const raw = text.trim();

    // "in X minutes" / "in X hours" / "in X hours Y minutes"
    const inMatch = raw.match(/^in\s+(\d+)\s*(hour|hr|h)s?\s*(?:and\s+)?(?:(\d+)\s*(minute|min|m)s?)?\b/i)
                 || raw.match(/^in\s+(\d+)\s*(minute|min|m)s?\b/i);
    if (inMatch) {
        let ms = 0;
        const full = inMatch[0];
        const n1 = parseInt(inMatch[1]);
        const unit1 = inMatch[2].toLowerCase();
        if (/^h/.test(unit1)) {
            ms += n1 * 3600000;
            if (inMatch[3]) ms += parseInt(inMatch[3]) * 60000;
        } else {
            ms += n1 * 60000;
        }
        const fireAt = Date.now() + ms;
        const mins   = Math.round(ms / 60000);
        const label  = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60 ? (mins % 60) + 'm' : ''}`.trim() : `${mins} min`;
        const remainder = raw.slice(full.length).trim();
        return { fireAt, label, remainder };
    }

    // "tomorrow at HH:MM [am/pm]"
    const tmrMatch = raw.match(/^tomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (tmrMatch) {
        let hh = parseInt(tmrMatch[1]), mm = parseInt(tmrMatch[2] || '0');
        const ampm = (tmrMatch[3] || '').toLowerCase();
        if (ampm === 'pm' && hh < 12) hh += 12;
        if (ampm === 'am' && hh === 12) hh = 0;
        const fireAt   = wallClockToUtcMs(hh, mm, utcOffset, 1);
        const label    = `tomorrow at ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
        const remainder = raw.slice(tmrMatch[0].length).trim();
        return { fireAt, label, remainder };
    }

    // "at HH:MM [am/pm]" or "at HH [am/pm]"
    const atMatch = raw.match(/^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
                 || raw.match(/^at\s+(\d{1,2})(?::(\d{2}))?\b/i);
    if (atMatch) {
        let hh = parseInt(atMatch[1]), mm = parseInt(atMatch[2] || '0');
        const ampm = (atMatch[3] || '').toLowerCase();
        if (ampm === 'pm' && hh < 12) hh += 12;
        if (ampm === 'am' && hh === 12) hh = 0;
        let fireAt = wallClockToUtcMs(hh, mm, utcOffset, 0);
        // If the time is in the past today, schedule for tomorrow
        if (fireAt <= Date.now() + 30000) fireAt = wallClockToUtcMs(hh, mm, utcOffset, 1);
        const wallLabel = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
        const label     = `at ${wallLabel}`;
        const remainder = raw.slice(atMatch[0].length).trim();
        return { fireAt, label, remainder };
    }

    return null;
}

// ── Formatter ────────────────────────────────────────────────────────────────
function formatFireAt(ms, utcOffset) {
    const d = new Date(ms + utcOffset * 3600000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const today = nowInOffset(utcOffset);
    const isTomorrow = d.getUTCDate() !== today.getUTCDate();
    return isTomorrow ? `tomorrow ${hh}:${mm}` : `${hh}:${mm}`;
}

function msUntil(ms) {
    const diff = ms - Date.now();
    if (diff <= 0) return 'now';
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60 ? (m % 60) + 'm' : ''}`.trim();
    return `${m} min`;
}

// ── In-process scheduler ─────────────────────────────────────────────────────
let _sock    = null;
let _interval = null;

export function startReminderScheduler(sock) {
    _sock = sock;
    if (_interval) return;
    _interval = setInterval(_tick, 30000);
}

export function updateReminderSock(sock) {
    _sock = sock;
}

async function _tick() {
    if (!_sock) return;
    const data = loadData();
    if (!data.reminders.length) return;

    const now    = Date.now();
    const fired  = [];
    const pending = [];

    for (const r of data.reminders) {
        if (r.fireAt <= now) {
            fired.push(r);
        } else {
            pending.push(r);
        }
    }

    if (!fired.length) return;

    data.reminders = pending;
    saveData(data);

    for (const r of fired) {
        try {
            const text =
                `╭─⌈ ⏰ *REMINDER* ⌋\n│\n` +
                `│ 📝 ${r.text}\n│\n` +
                `╰⊷ *${getOwnerName().toUpperCase()} TECH*`;
            await _sock.sendMessage(r.chatId, { text });
        } catch {}
    }
}

// ── Command ──────────────────────────────────────────────────────────────────
export default {
    name:      'remind',
    alias:     ['rem', 'reminder', 'remindme'],
    desc:      'Set a personal reminder — fires at the specified time',
    category:  'utility',
    ownerOnly: false,

    async execute(sock, msg, args, prefix, extras) {
        const chatId = msg.key.remoteJid;
        const reply  = (text) => sock.sendMessage(chatId, { text }, { quoted: msg });

        const sub = (args[0] || '').toLowerCase();

        // ── list ──────────────────────────────────────────────────────────────
        if (sub === 'list' || sub === 'ls') {
            const data = loadData();
            if (!data.reminders.length) return reply(`📭 *No pending reminders.*\n\nSet one: *${prefix}rem at 10:00 pm Your message*`);
            let text = `╭─⌈ ⏰ *PENDING REMINDERS* ⌋\n│\n`;
            data.reminders.forEach((r, i) => {
                const timeStr = formatFireAt(r.fireAt, data.utcOffset);
                const left    = msUntil(r.fireAt);
                text += `│ *${i + 1}.* ${r.text}\n│    🕐 ${timeStr}  (in ${left})\n│\n`;
            });
            text += `╰⊷ Cancel: *${prefix}rem cancel <number>*`;
            return reply(text);
        }

        // ── cancel ────────────────────────────────────────────────────────────
        if (sub === 'cancel' || sub === 'delete' || sub === 'del') {
            const idx = parseInt(args[1]) - 1;
            const data = loadData();
            if (isNaN(idx) || idx < 0 || idx >= data.reminders.length)
                return reply(`❌ Invalid number. Use *${prefix}rem list* to see your reminders.`);
            const removed = data.reminders.splice(idx, 1)[0];
            saveData(data);
            return reply(`🗑️ Cancelled: *${removed.text}*`);
        }

        // ── clear ─────────────────────────────────────────────────────────────
        if (sub === 'clear' || sub === 'reset') {
            const data = loadData();
            const count = data.reminders.length;
            data.reminders = [];
            saveData(data);
            return reply(`🗑️ Cleared *${count}* reminder(s).`);
        }

        // ── timezone ──────────────────────────────────────────────────────────
        if (sub === 'timezone' || sub === 'tz') {
            const raw = args[1] || '';
            const offset = parseFloat(raw.replace(/^UTC/i, ''));
            if (isNaN(offset) || offset < -12 || offset > 14)
                return reply(`❌ Usage: *${prefix}rem timezone +1*\nPass your UTC offset, e.g. +1 for WAT, +3 for EAT, +0 for GMT.`);
            const data = loadData();
            data.utcOffset = offset;
            saveData(data);
            return reply(`✅ Timezone set to *UTC${offset >= 0 ? '+' : ''}${offset}*`);
        }

        // ── help ──────────────────────────────────────────────────────────────
        if (!args.length || sub === 'help') {
            const data = loadData();
            const count = data.reminders.length;
            return reply(
                `╭─⌈ ⏰ *REMINDER* ⌋\n│\n` +
                `│ Pending : ${count}\n` +
                `│ Timezone: UTC${data.utcOffset >= 0 ? '+' : ''}${data.utcOffset}\n│\n` +
                `├─⊷ *${prefix}rem at 10:00 pm Watching a movie*\n│  └⊷ Remind at a specific time\n` +
                `├─⊷ *${prefix}rem in 30 minutes Call boss*\n│  └⊷ Remind after X minutes\n` +
                `├─⊷ *${prefix}rem in 2 hours Gym time*\n│  └⊷ Remind after X hours\n` +
                `├─⊷ *${prefix}rem tomorrow at 8am Gym*\n│  └⊷ Remind tomorrow\n` +
                `├─⊷ *${prefix}rem list*\n│  └⊷ Show all pending reminders\n` +
                `├─⊷ *${prefix}rem cancel 1*\n│  └⊷ Cancel reminder by number\n` +
                `├─⊷ *${prefix}rem clear*\n│  └⊷ Clear all reminders\n` +
                `├─⊷ *${prefix}rem timezone +1*\n│  └⊷ Set your UTC offset (current: UTC${data.utcOffset >= 0 ? '+' : ''}${data.utcOffset})\n` +
                `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            );
        }

        // ── set reminder ──────────────────────────────────────────────────────
        const fullText = args.join(' ');
        const data = loadData();
        const parsed = parseTime(fullText, data.utcOffset);

        if (!parsed) {
            return reply(
                `❌ Couldn't understand the time.\n\n` +
                `*Examples:*\n` +
                `• *${prefix}rem at 10:00 pm I will be watching*\n` +
                `• *${prefix}rem in 30 minutes Call boss*\n` +
                `• *${prefix}rem in 2 hours Meeting*\n` +
                `• *${prefix}rem tomorrow at 8am Gym*`
            );
        }

        const reminderText = parsed.remainder || '(no message)';
        const id = data.nextId++;
        data.reminders.push({
            id,
            text:      reminderText,
            fireAt:    parsed.fireAt,
            chatId:    chatId,
            createdAt: Date.now()
        });
        saveData(data);

        const timeStr = formatFireAt(parsed.fireAt, data.utcOffset);
        const left    = msUntil(parsed.fireAt);

        return reply(
            `╭─⌈ ⏰ *REMINDER SET* ⌋\n│\n` +
            `│ 📝 *Message:* ${reminderText}\n` +
            `│ 🕐 *Time:*    ${timeStr}\n` +
            `│ ⏳ *In:*      ${left}\n│\n` +
            `╰⊷ Cancel: *${prefix}rem cancel ${data.reminders.length}*`
        );
    }
};
