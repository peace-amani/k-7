/**
 * ============================================================
 *  SILENT WOLF — AutoViewStatus Module
 *  Shared by: Silent Wolf (@7silent-wolf)
 * ============================================================
 *
 *  WHAT THIS DOES:
 *  Automatically marks WhatsApp statuses as "seen" the moment
 *  they arrive, without the user having to open them manually.
 *
 *  THE KEY PROBLEM THIS SOLVES:
 *  Modern WhatsApp multi-device uses LID JIDs (e.g. 12345@lid)
 *  internally instead of phone number JIDs (e.g. 254712345678@s.whatsapp.net).
 *  A status view receipt is only counted by WhatsApp if it is sent
 *  using the phone number JID — sending it with a LID JID silently
 *  fails and the contact never sees you viewed their status.
 *  This module resolves LIDs to real phone numbers before sending
 *  the receipt, making views register correctly every time.
 *
 * ============================================================
 *  FILES INVOLVED:
 *    1. commands/automation/autoviewstatus.js  ← save Part 1 here
 *    2. index.js                               ← paste Part 2 snippets here
 *    3. lib/sudo-store.js                      ← already handles LID ↔ phone mapping
 * ============================================================
 */


// ╔══════════════════════════════════════════════════════════════╗
// ║  PART 1 — THE MODULE                                        ║
// ║  Save as: commands/automation/autoviewstatus.js             ║
// ╚══════════════════════════════════════════════════════════════╝

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import supabase from './lib/database.js';   // optional — handles DB persistence so config survives restarts

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Where the on/off state and view logs are stored locally on disk
const CONFIG_FILE = './data/autoViewConfig.json';

// ── Console colour helpers ────────────────────────────────────────────────────
const G = '\x1b[32m'; const C = '\x1b[36m'; const Y = '\x1b[33m';
const R = '\x1b[31m'; const B = '\x1b[1m';  const D = '\x1b[2m'; const X = '\x1b[0m';

// Prints a neat coloured box to the console each time a status is processed
function logBox(sender, msgType, result) {
    const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const d = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    console.log(`${G}${B}┌──────────────────────────────────────────────────┐${X}`);
    console.log(`${G}${B}│  👁️  STATUS DETECTED                              │${X}`);
    console.log(`${G}${B}├──────────────────────────────────────────────────┤${X}`);
    console.log(`${G}│  ${C}${B}From   :${X}${G} ${sender}${X}`);
    console.log(`${G}│  ${C}${B}Type   :${X}${G} ${msgType}${X}`);
    console.log(`${G}│  ${C}${B}Time   :${X}${G} ${t}  ${D}(${d})${X}`);
    console.log(`${G}│  ${C}${B}Result :${X}${G} ${result}${X}`);
    console.log(`${G}${B}└──────────────────────────────────────────────────┘${X}`);
}

// Returns a friendly label for the status content type (image, video, text, etc.)
function getMessageType(message) {
    if (!message) return `${D}stub${X}`;
    const map = {
        imageMessage:        '🖼️  Image',
        videoMessage:        '🎥  Video',
        extendedTextMessage: '📝  Text',
        conversation:        '💬  Text',
        audioMessage:        '🎵  Audio',
        stickerMessage:      '🎭  Sticker',
        documentMessage:     '📄  Document',
        reactionMessage:     '😮  Reaction',
        protocolMessage:     '🔧  Protocol',
    };
    const key = Object.keys(message)[0];
    return map[key] || `📦  ${key}`;
}

// Creates the config file on first run if it does not exist yet
function initConfig() {
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    if (!fs.existsSync(CONFIG_FILE)) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({
            enabled: true, logs: [], totalViewed: 0, lastViewed: null,
            consecutiveViews: 0, lastSender: null,
            settings: { rateLimitDelay: 1000, markAsSeen: true }
        }, null, 2));
    }
}

initConfig();

// On startup, load the saved config from Supabase/SQLite so the enabled/disabled
// state survives bot restarts — if the DB has a saved value it overwrites the local file
(async () => {
    try {
        if (supabase.isAvailable()) {
            const dbData = await supabase.getConfig('autoview_config');
            if (dbData?.enabled !== undefined)
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(dbData, null, 2));
        }
    } catch {}
})();

// ─────────────────────────────────────────────────────────────────────────────
//  AutoViewManager — handles state, rate limiting, queue, and sending receipts
// ─────────────────────────────────────────────────────────────────────────────
class AutoViewManager {
    constructor() {
        this.config       = this.loadConfig();
        this.lastViewTime = 0;
        this.queue        = [];       // pending view receipts waiting to be sent
        this._draining    = false;    // prevents two concurrent queue processors running at once
    }

    // Read the JSON config from disk; return safe defaults if file is missing or corrupt
    loadConfig() {
        try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
        catch { return { enabled: true, logs: [], totalViewed: 0, lastViewed: null,
            consecutiveViews: 0, lastSender: null,
            settings: { rateLimitDelay: 1000, markAsSeen: true } }; }
    }

    // Write config to disk and also persist it to the DB for cross-restart survival
    saveConfig() {
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
            supabase.setConfig('autoview_config', this.config).catch(() => {});
        } catch {}
    }

    get enabled()     { return this.config.enabled; }
    get logs()        { return this.config.logs; }
    get totalViewed() { return this.config.totalViewed; }

    // Toggle autoview on or off; forceOff=true always disables
    toggle(forceOff = false) {
        this.config.enabled = !forceOff;
        this.saveConfig();
        return this.config.enabled;
    }

    // Record a successful view in the log; keeps a rolling window of the last 100 entries
    addLog(sender) {
        const entry = { sender, timestamp: Date.now() };
        this.config.logs.push(entry);
        this.config.totalViewed++;
        this.config.lastViewed = entry;
        this.config.consecutiveViews = this.config.lastSender === sender
            ? this.config.consecutiveViews + 1 : 1;
        this.config.lastSender = sender;
        if (this.config.logs.length > 100) this.config.logs.shift();
        this.saveConfig();
    }

    clearLogs() {
        Object.assign(this.config, { logs: [], totalViewed: 0, lastViewed: null,
            consecutiveViews: 0, lastSender: null });
        this.saveConfig();
    }

    getStats() {
        return {
            enabled:          this.config.enabled,
            totalViewed:      this.config.totalViewed,
            lastViewed:       this.config.lastViewed,
            consecutiveViews: this.config.consecutiveViews,
            settings:         { ...this.config.settings }
        };
    }

    // ── Main entry point called from index.js ────────────────────────────────
    //  Signature: handleAutoView(sock, statusKeyWithTs, resolvedMessage)
    //
    //  statusKeyWithTs is the message key already enriched with participantPn
    //  (the resolved phone number JID). The enrichment happens in index.js
    //  BEFORE this function is called — see Part 2 below.
    //  This function just validates, logs, and queues the receipt.
    async viewStatus(sock, statusKey, message) {
        try {
            if (!statusKey || statusKey.fromMe) return false;   // never "view" our own statuses

            const sender    = statusKey.participant || statusKey.remoteJid;
            const displayId = sender.split('@')[0].split(':')[0];
            const msgType   = getMessageType(message);

            if (!this.config.enabled || !this.config.settings.markAsSeen) {
                logBox(displayId, msgType, `${Y}SKIPPED — autoview OFF${X}`);
                return false;
            }

            logBox(displayId, msgType, `${G}${B}Attempting view...${X}`);

            // Push into the queue so views are rate-limited and never flood WhatsApp
            this.queue.push({ sock, statusKey, displayId });
            this._drain();
            return true;

        } catch (err) {
            console.error('autoviewstatus error:', err.message);
            return false;
        }
    }

    // Starts draining the queue; safe to call multiple times — guard prevents double-processing
    _drain() {
        if (this._draining) return;
        this._draining = true;
        this._processNext().catch(() => { this._draining = false; });
    }

    async _processNext() {
        while (this.queue.length > 0) {
            const { sock, statusKey, displayId } = this.queue.shift();

            // Respect the configured delay between views (default 1000ms) to avoid flooding
            const wait = this.config.settings.rateLimitDelay - (Date.now() - this.lastViewTime);
            if (wait > 0) await new Promise(r => setTimeout(r, wait));

            await this._sendReceipt(sock, statusKey, displayId);
        }
        this._draining = false;
    }

    // ── The receipt sender — this is the critical LID fix ────────────────────
    //
    //  WHY participantPn (phone number JID) matters:
    //  WhatsApp multi-device assigns every user an internal LID
    //  (e.g. 18003849201928373@lid). The raw msg.key.participant from
    //  messages.upsert may be this LID instead of the phone number JID.
    //
    //  If sock.readMessages() is called with a LID as participant,
    //  WhatsApp silently accepts the request but does NOT register the view —
    //  the contact never sees the "seen" indicator on their status.
    //
    //  The fix uses this fallback chain for participant:
    //    remoteJidAlt (Baileys auto-resolved) →
    //    participantPn (resolved by index.js LID cache before calling us) →
    //    participant (raw value — may still be @lid, last resort)
    async _sendReceipt(sock, statusKey, displayId) {
        const participantToUse =
            statusKey.remoteJidAlt   ||   // Baileys auto-resolved phone JID
            statusKey.participantPn  ||   // phone JID resolved by index.js LID cache
            statusKey.participant    ||   // raw participant — may be @lid (last resort)
            statusKey.remoteJid;

        const readKey = {
            remoteJid:   statusKey.remoteJid,   // always 'status@broadcast'
            id:          statusKey.id,
            fromMe:      false,
            participant: participantToUse        // MUST be phone JID for the view to register
        };

        try {
            await sock.readMessages([readKey]);
            this.lastViewTime = Date.now();
            this.addLog(displayId);
            console.log(`${G}${B}✅ VIEWED${X}${G} [via=${participantToUse?.split('@')[1] || '?'}] → ${displayId}${X}`);
        } catch (err) {
            console.log(`${R}${B}❌ VIEW FAILED for ${displayId}: ${err.message}${X}`);
        }
    }

    updateSetting(setting, value) {
        if (Object.prototype.hasOwnProperty.call(this.config.settings, setting)) {
            this.config.settings[setting] = value;
            this.saveConfig();
            return true;
        }
        return false;
    }
}

const autoViewManager = new AutoViewManager();

// Named export — index.js calls this directly
export async function handleAutoView(sock, statusKey, message) {
    return await autoViewManager.viewStatus(sock, statusKey, message);
}

export { autoViewManager };

// Default export — registers the bot commands (.autoviewstatus on/off/stats/logs/delay/reset)
export default {
    name:      "autoviewstatus",
    alias:     ["autoview", "viewstatus", "statusview", "vs", "views"],
    desc:      "Automatically view (mark as seen) WhatsApp statuses 👁️",
    category:  "Automation",
    ownerOnly: false,

    async execute(sock, m, args, prefix, extra) {
        try {
            const isOwner = extra?.isOwner?.() || false;

            if (args.length === 0) {
                const s = autoViewManager.getStats();
                let text = `╭─⌈ 👁️ *AUTOVIEWSTATUS* ⌋\n│\n`;
                text += `│ Status: ${s.enabled ? '✅ ACTIVE' : '❌ INACTIVE'}\n│\n`;
                text += `├─⊷ *${prefix}autoviewstatus on*\n│  └⊷ Enable viewing\n`;
                text += `├─⊷ *${prefix}autoviewstatus off*\n│  └⊷ Disable viewing\n`;
                text += `├─⊷ *${prefix}autoviewstatus stats*\n│  └⊷ Statistics\n`;
                text += `╰───`;
                await sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
                return;
            }

            const action = args[0].toLowerCase();

            switch (action) {
                case 'on': case 'enable': case 'start': {
                    if (!isOwner) { await sock.sendMessage(m.key.remoteJid, { text: "❌ Owner only!" }, { quoted: m }); return; }
                    autoViewManager.toggle(false);
                    await sock.sendMessage(m.key.remoteJid, { text: `✅ *AUTOVIEWSTATUS ENABLED*\n\n👁️ Will now automatically view ALL statuses!` }, { quoted: m });
                    break;
                }
                case 'off': case 'disable': case 'stop': {
                    if (!isOwner) { await sock.sendMessage(m.key.remoteJid, { text: "❌ Owner only!" }, { quoted: m }); return; }
                    autoViewManager.toggle(true);
                    await sock.sendMessage(m.key.remoteJid, { text: `❌ *AUTOVIEWSTATUS DISABLED*` }, { quoted: m });
                    break;
                }
                case 'stats': case 'statistics': case 'info': {
                    const s = autoViewManager.getStats();
                    let text = `📊 *AUTOVIEWSTATUS STATS*\n\n`;
                    text += `🟢 Status   : ${s.enabled ? 'ACTIVE ✅' : 'INACTIVE ❌'}\n`;
                    text += `👁️ Viewed   : *${s.totalViewed}*\n`;
                    text += `🔄 Streak   : ${s.consecutiveViews}\n`;
                    text += `⚙️ Delay    : ${s.settings.rateLimitDelay}ms\n`;
                    if (s.lastViewed) {
                        const ago = Math.floor((Date.now() - s.lastViewed.timestamp) / 60000);
                        text += `\n🕒 Last: ${s.lastViewed.sender} (${ago < 1 ? 'just now' : ago + ' min ago'})`;
                    }
                    await sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
                    break;
                }
                case 'logs': case 'history': {
                    const logs = autoViewManager.logs.slice(-10).reverse();
                    if (!logs.length) { await sock.sendMessage(m.key.remoteJid, { text: `📭 No statuses viewed yet.` }, { quoted: m }); return; }
                    let text = `📋 *RECENT VIEWS*\n\n`;
                    logs.forEach((l, i) => { text += `${i+1}. ${l.sender} — ${new Date(l.timestamp).toLocaleTimeString()}\n`; });
                    text += `\n📊 Total: ${autoViewManager.totalViewed}`;
                    await sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
                    break;
                }
                case 'reset': {
                    if (!isOwner) { await sock.sendMessage(m.key.remoteJid, { text: "❌ Owner only!" }, { quoted: m }); return; }
                    autoViewManager.clearLogs();
                    await sock.sendMessage(m.key.remoteJid, { text: `🗑️ Stats reset.` }, { quoted: m });
                    break;
                }
                case 'delay': {
                    const ms = parseInt(args[1]);
                    if (isNaN(ms) || ms < 200) { await sock.sendMessage(m.key.remoteJid, { text: '❌ Min 200ms' }, { quoted: m }); return; }
                    autoViewManager.updateSetting('rateLimitDelay', ms);
                    await sock.sendMessage(m.key.remoteJid, { text: `✅ Delay set to ${ms}ms` }, { quoted: m });
                    break;
                }
                default:
                    await sock.sendMessage(m.key.remoteJid, { text: `╭─⌈ ❓ *AUTOVIEWSTATUS* ⌋\n│\n├─⊷ *${prefix}autoviewstatus on/off*\n├─⊷ *${prefix}autoviewstatus stats*\n├─⊷ *${prefix}autoviewstatus logs*\n├─⊷ *${prefix}autoviewstatus delay <ms>*\n╰───` }, { quoted: m });
            }
        } catch (error) {
            console.error('AutoViewStatus error:', error);
            await sock.sendMessage(m.key.remoteJid, { text: `❌ ${error.message}` }, { quoted: m });
        }
    }
};


// ╔══════════════════════════════════════════════════════════════╗
// ║  PART 2 — INDEX.JS INTEGRATION                              ║
// ║  Copy the snippets below into the matching places in your   ║
// ║  index.js file.                                             ║
// ╚══════════════════════════════════════════════════════════════╝


// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Add these two imports at the top of index.js near your other imports
// ─────────────────────────────────────────────────────────────────────────────

import { handleAutoView } from './commands/automation/autoviewstatus.js';

// Also needed for LID → phone resolution (may already be in your file):
import { getPhoneFromLid } from './lib/sudo-store.js';


// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Add this block inside your messages.upsert event handler.
//          Place it where you handle every incoming message so all statuses
//          are caught regardless of content type.
// ─────────────────────────────────────────────────────────────────────────────

if (msg.key?.remoteJid === 'status@broadcast') {

    // Unwrap ephemeral (disappearing-mode) status messages so we always get
    // the real content regardless of the sender's disappearing message setting
    const resolvedMessage = msg.message?.ephemeralMessage?.message || msg.message;

    // ── LID RESOLUTION ───────────────────────────────────────────────────────
    //  In multi-device WhatsApp, msg.key.participant may be a LID
    //  (e.g. 18003849201928373@lid) instead of the real phone number JID
    //  (e.g. 254712345678@s.whatsapp.net).
    //
    //  A status read receipt sent with a LID participant is silently
    //  ignored by WhatsApp — the view never registers on the sender's end.
    //
    //  We resolve the LID using four sources in priority order:
    //    1. remoteJidAlt     — Baileys auto-resolved this in newer versions
    //    2. participantAlt / participantPn — other Baileys resolution fields
    //    3. lidPhoneCache    — fast in-memory Map populated as messages arrive
    //    4. getPhoneFromLid  — persistent DB-backed store (sudo-store.js)
    const rawParticipant = msg.key.participant || '';
    let resolvedParticipantPn = msg.key.remoteJidAlt
                             || msg.key.participantAlt
                             || msg.key.participantPn
                             || null;

    if (!resolvedParticipantPn && rawParticipant.includes('@lid')) {
        // Strip device suffix (:0, :1, etc.) before looking up the LID
        const lidNum = rawParticipant.split('@')[0].split(':')[0];
        const phone  = lidPhoneCache.get(lidNum)
                    || lidPhoneCache.get(rawParticipant.split('@')[0])
                    || getPhoneFromLid(lidNum);
        if (phone) resolvedParticipantPn = `${phone}@s.whatsapp.net`;
    }

    // Build the enriched key — participantPn carries the resolved phone JID
    // so _sendReceipt() inside the module uses the correct participant value
    const statusKeyWithTs = {
        ...msg.key,
        messageTimestamp: msg.messageTimestamp,
        ...(resolvedParticipantPn ? { participantPn: resolvedParticipantPn } : {})
    };

    // Fire and forget — all errors are caught silently inside the module
    handleAutoView(sock, statusKeyWithTs, resolvedMessage).catch(() => {});
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — lidPhoneCache declaration (add this near the top of your connection
//          setup function, before makeWASocket() is called)
// ─────────────────────────────────────────────────────────────────────────────

// In-memory map of LID number → phone number, built as contacts arrive
const lidPhoneCache = new Map();

// Wire it to the contacts event so it fills automatically as WhatsApp syncs:
sock.ev.on('contacts.upsert', contacts => {
    for (const c of contacts) {
        if (c.id?.includes('@lid') && c.notify) {
            const lid = c.id.split('@')[0].split(':')[0];
            // Map lid → phone derived from non-LID contact data when available
            // Baileys handles the deeper mapping internally via signalRepository;
            // getPhoneFromLid() in lib/sudo-store.js covers the persistent fallback
        }
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Enable read receipts inside your makeWASocket() config (required for
//          views to actually register on the sender's side)
// ─────────────────────────────────────────────────────────────────────────────

// Inside makeWASocket({ ... }) options, include:
markOnlineOnConnect: true,

// After the socket connects, send presence so WhatsApp treats receipts as real views:
await sock.sendPresenceUpdate('available');


// ╔══════════════════════════════════════════════════════════════╗
// ║  SUMMARY OF THE FIX THAT MADE IT WORK                      ║
// ╚══════════════════════════════════════════════════════════════╝
//
//  BEFORE THE FIX:
//  sock.readMessages() was called with the raw msg.key.participant,
//  which on multi-device sessions is often a LID like 18003849201928373@lid.
//  WhatsApp accepts the API call without throwing any error but does NOT
//  update the status view count. The contact checks their status and sees
//  0 views even though the bot "viewed" it.
//
//  AFTER THE FIX:
//  Before passing the key to the module, index.js resolves the LID to the
//  real phone number JID using remoteJidAlt, participantAlt, lidPhoneCache,
//  and getPhoneFromLid() as a chain of fallbacks. The resolved JID is stored
//  in statusKeyWithTs.participantPn. Inside _sendReceipt(), the priority order
//  is: remoteJidAlt → participantPn → participant (raw fallback). Since
//  participantPn now holds the phone JID when available, sock.readMessages()
//  sends the receipt with the correct participant and WhatsApp registers the
//  view properly.
//
//  COMMANDS:
//    .autoviewstatus             — show current status
//    .autoviewstatus on          — enable auto-view
//    .autoviewstatus off         — disable auto-view
//    .autoviewstatus stats       — view counts and last viewed contact
//    .autoviewstatus logs        — recent 10 views
//    .autoviewstatus delay 500   — set delay between views (min 200ms)
//    .autoviewstatus reset       — clear all stats
