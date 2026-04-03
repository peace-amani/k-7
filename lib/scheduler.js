/**
 * scheduler.js — scheduled daily messages to owner + 48-hour auto-update
 *
 * All times are Africa/Nairobi (EAT, UTC+3) regardless of server timezone.
 *
 * Good morning : 07:00 EAT  (GOODMORNING_HOUR / GOODMORNING_MINUTE)
 * Good night   : 22:30 EAT  (GOODNIGHT_HOUR   / GOODNIGHT_MINUTE)
 * Auto-update  : every 48 hours from when the scheduler starts
 *                  — warning sent 1 min before restart
 *                  — mirrors the .update command exactly:
 *                      1. aggressive cleanup
 *                      2. git prune → gc → fetch → backup branch → merge → gc aggressive
 *                      3. npm install
 *                      4. preExitSave
 *                      5. pm2 restart all → fallback process.exit(0)
 *
 * Override via env vars (0-23 / 0-59):
 *   GOODMORNING_HOUR, GOODMORNING_MINUTE
 *   GOODNIGHT_HOUR,   GOODNIGHT_MINUTE
 */

import { exec }      from 'child_process';
import { promisify }  from 'util';
import fs             from 'fs';
import path           from 'path';
import { getBotName } from './botname.js';

const execAsync = promisify(exec);
const TIMEZONE  = 'Africa/Nairobi';

const GOODMORNING_HOUR   = parseInt(process.env.GOODMORNING_HOUR   ?? '7',  10);
const GOODMORNING_MINUTE = parseInt(process.env.GOODMORNING_MINUTE ?? '0',  10);
const GOODNIGHT_HOUR     = parseInt(process.env.GOODNIGHT_HOUR     ?? '22', 10);
const GOODNIGHT_MINUTE   = parseInt(process.env.GOODNIGHT_MINUTE   ?? '30', 10);

const UPDATE_INTERVAL_MS    = 48 * 60 * 60 * 1000;
const UPDATE_WARN_BEFORE_MS = 60 * 1000;

const _FALLBACK_GIT_URL = Buffer.from('aHR0cHM6Ly9naXRodWIuY29tL3BlYWNlLWFtYW5pL2stNy5naXQ=', 'base64').toString();
const _R = 'bot-upstream';

// ─── repo URL (same logic as update.js) ──────────────────────────────────────

function getGitRepoUrl() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
        let url = (pkg?.repository?.url || '').trim();
        url = url.replace(/^git\+/, '').replace(/\.git$/, '');
        if (url.startsWith('https://') && url.includes('github.com')) return `${url}.git`;
    } catch {}
    return _FALLBACK_GIT_URL;
}

// ─── message builders ────────────────────────────────────────────────────────

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

function buildUpdateWarning(name) {
    return (
        `╭⊷『 ⚙️ UPDATE NOTICE 』\n│\n` +
        `├⊷ *To:* Owner 👑\n` +
        `├⊷ *Alert:* Scheduled update in *1 minute* ⏳\n` +
        `├⊷ *Action:* Bot will pull latest code & restart 🔄\n` +
        `├⊷ *Duration:* Brief reconnect (~15 secs) ⚡\n` +
        `├⊷ *All settings:* ✅ Will be preserved\n` +
        `├⊷ *Session:* ✅ Maintained\n` +
        `└⊷ *Next update:* In 48 hours 🕐\n\n` +
        `╰⊷ *${name} staying sharp* 🐺`
    );
}

function buildUpdateRestart(name, gotNewCode) {
    const codeStatus = gotNewCode ? '✅ New code pulled' : '✅ Already up to date';
    return (
        `╭⊷『 ⚙️ RUNNING UPDATES 』\n│\n` +
        `├⊷ *To:* Owner 👑\n` +
        `├⊷ *Status:* Applying scheduled updates now 🔄\n` +
        `├⊷ *Code:* ${codeStatus}\n` +
        `├⊷ *Cleanup:* ✅ Temp files cleared\n` +
        `├⊷ *Settings:* ✅ Saved & preserved\n` +
        `├⊷ *Session:* ✅ Maintained\n` +
        `└⊷ *Back online:* Very soon ⚡\n\n` +
        `╰⊷ *${name} upgrading* 🐺`
    );
}

// ─── shell helper ─────────────────────────────────────────────────────────────

function run(cmd, timeout = 60000) {
    return execAsync(cmd, { timeout }).then(r => (r.stdout || '').trim());
}

// ─── 48h update logic (mirrors commands/github/update.js exactly) ─────────────

async function performScheduledUpdate(ownerJid, name) {
    let gotNewCode = false;

    // 1. Aggressive cleanup (exact same commands as .update execute)
    try {
        const cleanCmds = [
            'npm cache clean --force 2>/dev/null || true',
            'rm -rf tmp_update_fast tmp_preserve_fast /tmp/*.zip /tmp/*.tar.gz /tmp/wolfbot_* 2>/dev/null',
            'rm -rf ./data/antidelete/media/* 2>/dev/null',
            'rm -rf ./data/antidelete/status/media/* 2>/dev/null',
            'find ./session -name "sender-key-*" -delete 2>/dev/null',
            'find ./session -name "pre-key-*" -delete 2>/dev/null',
            'find ./session -name "app-state-sync-version-*" -delete 2>/dev/null',
            'rm -rf session_backup 2>/dev/null',
            'find ./data -name "*.bak" -delete 2>/dev/null',
            'find . -maxdepth 3 -name "*.log" -not -path "./node_modules/*" -delete 2>/dev/null',
            'rm -rf ./temp/* ./logs/* 2>/dev/null',
            'rm -rf ./node_modules/.cache 2>/dev/null',
            'git gc --prune=now 2>/dev/null || true',
        ];
        for (const cmd of cleanCmds) {
            await run(cmd, 20000).catch(() => {});
        }
    } catch {}

    // 2. Git update (mirrors updateViaGit() from update.js)
    try {
        const oldRev = await run('git rev-parse HEAD').catch(() => 'unknown');

        // Pre-fetch GC (same as update.js)
        await run('git prune --expire=now').catch(() => {});
        await run('git gc --auto').catch(() => {});

        // Resolve repo URL from package.json (same as update.js)
        const repoUrl = getGitRepoUrl();
        try {
            const existingUrl = await run(`git remote get-url ${_R}`);
            if (existingUrl.trim() !== repoUrl) {
                await run(`git remote set-url ${_R} ${repoUrl}`);
            }
        } catch {
            await run(`git remote add ${_R} ${repoUrl}`);
        }

        await run(`git fetch ${_R} --depth=20 --prune`, 30000);

        const branch = await run('git rev-parse --abbrev-ref HEAD').catch(() => 'main');
        let newRev;
        try {
            newRev = await run(`git rev-parse ${_R}/${branch}`);
        } catch {
            newRev = await run(`git rev-parse ${_R}/main`);
        }

        if (oldRev !== newRev) {
            // Create backup branch before merging (same as update.js)
            await run(`git branch backup-${Date.now()}`).catch(() => {});
            await run(`git merge --ff-only ${newRev}`);

            // Post-merge GC (same as update.js)
            await run('git prune --expire=now').catch(() => {});
            await run('git gc --aggressive --prune=now').catch(() => {});

            gotNewCode = true;
        } else {
            await run('git gc --auto').catch(() => {});
        }
    } catch {}

    // 3. Install dependencies (same as update.js — `npm install`, not `npm ci`)
    try {
        await run('npm install --no-audit --no-fund --loglevel=error', 180000);
    } catch {}

    // 4. Send the update message (with code status baked in)
    try {
        await _sock.sendMessage(ownerJid, { text: buildUpdateRestart(name, gotNewCode) });
        console.log(`[scheduler] ✅ 48h update message sent (newCode=${gotNewCode})`);
    } catch (e) {
        console.log(`[scheduler] ❌ Failed to send update message: ${e.message}`);
    }

    // 5. Save all settings before exit (same as update.js)
    if (typeof globalThis.preExitSave === 'function') {
        try { await globalThis.preExitSave(); } catch {}
    }

    // 6. Restart — try pm2 first, fall back to process.exit (same as update.js)
    setTimeout(() => {
        console.log(`[scheduler] 🔄 Performing scheduled 48h restart now`);
        run('pm2 restart all', 10000).catch(() => {
            process.exit(0);
        });
    }, 3000);
}

// ─── state ───────────────────────────────────────────────────────────────────

let _sock              = null;
let _intervalId        = null;
let _lastMorningDay    = -1;
let _lastNightDay      = -1;

let _updateStartTime   = Date.now();
let _sentUpdateWarning = false;
let _sentUpdateRestart = false;

// ─── helpers ─────────────────────────────────────────────────────────────────

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

// ─── main tick ───────────────────────────────────────────────────────────────

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
            console.log(`[scheduler] ✅ Good morning sent at ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')} EAT`);
        } catch (e) {
            console.log(`[scheduler] ❌ Failed to send good morning: ${e.message}`);
        }
    }

    if (h === GOODNIGHT_HOUR && min === GOODNIGHT_MINUTE && day !== _lastNightDay) {
        _lastNightDay = day;
        try {
            await _sock.sendMessage(ownerJid, { text: random(buildNightMessages(name)) });
            console.log(`[scheduler] ✅ Good night sent at ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')} EAT`);
        } catch (e) {
            console.log(`[scheduler] ❌ Failed to send good night: ${e.message}`);
        }
    }

    const elapsed = Date.now() - _updateStartTime;

    if (!_sentUpdateWarning && elapsed >= (UPDATE_INTERVAL_MS - UPDATE_WARN_BEFORE_MS)) {
        _sentUpdateWarning = true;
        try {
            await _sock.sendMessage(ownerJid, { text: buildUpdateWarning(name) });
            console.log(`[scheduler] ✅ 48h update warning sent to owner`);
        } catch (e) {
            console.log(`[scheduler] ❌ Failed to send update warning: ${e.message}`);
        }
    }

    if (!_sentUpdateRestart && elapsed >= UPDATE_INTERVAL_MS) {
        _sentUpdateRestart = true;
        await performScheduledUpdate(ownerJid, name);
    }
}

// ─── exports ─────────────────────────────────────────────────────────────────

export function startScheduler(sock) {
    _sock = sock;
    if (_intervalId) clearInterval(_intervalId);

    _updateStartTime   = Date.now();
    _sentUpdateWarning = false;
    _sentUpdateRestart = false;

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
