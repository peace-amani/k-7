import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const BOT_NAME_FILE = join(PROJECT_ROOT, 'bot_name.json');
const DEFAULT_NAME = 'WOLFBOT';
let _cachedName = null;
let _cacheTime = 0;
const CACHE_TTL = 5000;

function readBotNameFile() {
    try {
        if (existsSync(BOT_NAME_FILE)) {
            const data = JSON.parse(readFileSync(BOT_NAME_FILE, 'utf8'));
            if (data.botName && data.botName.trim()) {
                return data.botName.trim();
            }
        }
    } catch {}
    return null;
}

function writeBotNameFile(name) {
    try {
        writeFileSync(BOT_NAME_FILE, JSON.stringify({ botName: name, updatedAt: new Date().toISOString() }, null, 2));
        return true;
    } catch (err) {
        console.warn('⚠️ Could not save bot name to file:', err.message);
        return false;
    }
}

export function getBotName() {
    const now = Date.now();
    if (_cachedName && (now - _cacheTime) < CACHE_TTL) {
        return _cachedName;
    }

    const fromFile = readBotNameFile();
    if (fromFile) {
        _cachedName = fromFile;
        _cacheTime = now;
        global.BOT_NAME = fromFile;
        return _cachedName;
    }

    if (process.env.BOT_NAME && process.env.BOT_NAME.trim()) {
        const envName = process.env.BOT_NAME.trim();
        _cachedName = envName;
        _cacheTime = now;
        global.BOT_NAME = envName;
        writeBotNameFile(envName);
        return _cachedName;
    }

    _cachedName = DEFAULT_NAME;
    _cacheTime = now;
    global.BOT_NAME = DEFAULT_NAME;
    writeBotNameFile(DEFAULT_NAME);
    return _cachedName;
}

export function clearBotNameCache() {
    _cachedName = null;
    _cacheTime = 0;
}

export function saveBotName(name) {
    writeBotNameFile(name);
    global.BOT_NAME = name;
    _cachedName = name;
    _cacheTime = Date.now();
    return true;
}

export function loadBotName() {
    const name = readBotNameFile();
    if (name) {
        global.BOT_NAME = name;
        _cachedName = name;
        _cacheTime = Date.now();
        return name;
    }

    const fallback = (process.env.BOT_NAME && process.env.BOT_NAME.trim()) || DEFAULT_NAME;
    global.BOT_NAME = fallback;
    _cachedName = fallback;
    _cacheTime = Date.now();
    writeBotNameFile(fallback);
    console.log(`✅ Bot name initialized: "${fallback}" (saved to bot_name.json)`);
    return fallback;
}
