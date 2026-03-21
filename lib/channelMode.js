// ====== lib/channelMode.js ======
// Tracks whether "Channel Mode" is currently active.
//
// When Channel Mode is ON, every bot response is forwarded as a message
// from a WhatsApp Channel (newsletter JID) instead of being sent directly.
// This makes replies appear to come from the configured channel rather than
// the bot's own number — useful for broadcast-style bots.
//
// State (on/off + channel JID + channel name) is persisted in
// bot_channel_mode.json so it survives restarts.
// An in-memory cache (2 s TTL) avoids disk reads on every message.

import fs from 'fs';
import path from 'path';

// Where channel mode state is stored between restarts
const CHANNEL_MODE_PATH = path.join(process.cwd(), 'bot_channel_mode.json');

// ── In-memory cache ────────────────────────────────────────────────────────
let _cachedData = null;   // the parsed JSON object, or null if cache is empty
let _cacheTime = 0;
const CACHE_TTL = 2000; // 2 seconds

// Read bot_channel_mode.json, using the cache when fresh.
// Falls back to a sensible default (disabled, WOLF TECH channel) if the
// file doesn't exist yet.
function _load() {
    const now = Date.now();

    // Return cached object while still fresh
    if (_cachedData !== null && (now - _cacheTime) < CACHE_TTL) return _cachedData;

    try {
        if (fs.existsSync(CHANNEL_MODE_PATH)) {
            _cachedData = JSON.parse(fs.readFileSync(CHANNEL_MODE_PATH, 'utf8'));
            _cacheTime = now;
            return _cachedData;
        }
    } catch {}

    // File absent or corrupt — use defaults
    _cachedData = { enabled: false, channelJid: '120363424199376597@newsletter', channelName: 'WOLF TECH' };
    _cacheTime = now;
    return _cachedData;
}

// ── Public API ─────────────────────────────────────────────────────────────

// Returns true if Channel Mode is currently active.
// Checks global.CHANNEL_MODE first (set at runtime by setChannelMode), then
// falls back to reading the JSON file.
export function isChannelModeEnabled() {
    if (global.CHANNEL_MODE === true) return true;
    return _load().enabled === true;
}

// Returns the currently configured channel's JID and display name.
// The channel JID ends in @newsletter — WhatsApp's newsletter/channel format.
export function getChannelInfo() {
    const d = _load();
    return {
        jid: d.channelJid || '120363424199376597@newsletter',
        name: d.channelName || 'WOLF TECH'
    };
}

// Enable or disable Channel Mode.
// Merges the new state with the existing data (preserving channelJid/name),
// writes to disk, and updates the cache and global flag.
export function setChannelMode(enabled, setBy = 'Unknown') {
    const existing = _load();
    const data = { ...existing, enabled, setBy, setAt: new Date().toISOString(), timestamp: Date.now() };
    fs.writeFileSync(CHANNEL_MODE_PATH, JSON.stringify(data, null, 2));
    global.CHANNEL_MODE = enabled;
    _cachedData = data;
    _cacheTime = Date.now();
}

// Change which channel responses are forwarded from.
// Called by ?setchannel <JID> <Name>.
// Preserves the current enabled/disabled state.
export function setChannelInfo(jid, name, setBy = 'Unknown') {
    const existing = _load();
    const data = { ...existing, channelJid: jid, channelName: name, updatedBy: setBy, updatedAt: new Date().toISOString() };
    fs.writeFileSync(CHANNEL_MODE_PATH, JSON.stringify(data, null, 2));
    _cachedData = data;
    _cacheTime = Date.now();
}

// Invalidate the in-memory cache so the next read re-loads from disk.
export function clearChannelModeCache() {
    _cachedData = null;
    _cacheTime = 0;
}
