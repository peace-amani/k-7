import fs from 'fs';
import path from 'path';

const CHANNEL_MODE_PATH = path.join(process.cwd(), 'bot_channel_mode.json');

let _cachedData = null;
let _cacheTime = 0;
const CACHE_TTL = 2000;

function _load() {
    const now = Date.now();
    if (_cachedData !== null && (now - _cacheTime) < CACHE_TTL) return _cachedData;
    try {
        if (fs.existsSync(CHANNEL_MODE_PATH)) {
            _cachedData = JSON.parse(fs.readFileSync(CHANNEL_MODE_PATH, 'utf8'));
            _cacheTime = now;
            return _cachedData;
        }
    } catch {}
    _cachedData = { enabled: false, channelJid: '120363424199376597@newsletter', channelName: 'WOLF TECH' };
    _cacheTime = now;
    return _cachedData;
}

export function isChannelModeEnabled() {
    if (global.CHANNEL_MODE === true) return true;
    return _load().enabled === true;
}

export function getChannelInfo() {
    const d = _load();
    return {
        jid: d.channelJid || '120363424199376597@newsletter',
        name: d.channelName || 'WOLF TECH'
    };
}

export function setChannelMode(enabled, setBy = 'Unknown') {
    const existing = _load();
    const data = { ...existing, enabled, setBy, setAt: new Date().toISOString(), timestamp: Date.now() };
    fs.writeFileSync(CHANNEL_MODE_PATH, JSON.stringify(data, null, 2));
    global.CHANNEL_MODE = enabled;
    _cachedData = data;
    _cacheTime = Date.now();
}

export function setChannelInfo(jid, name, setBy = 'Unknown') {
    const existing = _load();
    const data = { ...existing, channelJid: jid, channelName: name, updatedBy: setBy, updatedAt: new Date().toISOString() };
    fs.writeFileSync(CHANNEL_MODE_PATH, JSON.stringify(data, null, 2));
    _cachedData = data;
    _cacheTime = Date.now();
}

export function clearChannelModeCache() {
    _cachedData = null;
    _cacheTime = 0;
}
