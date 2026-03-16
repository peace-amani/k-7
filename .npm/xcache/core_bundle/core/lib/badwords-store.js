import fs from 'fs';

const DATA_FILE = './data/badwords.json';

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60 * 1000;

function loadData() {
    const now = Date.now();
    if (_cache !== null && (now - _cacheTime) < CACHE_TTL) return _cache;
    try {
        if (fs.existsSync(DATA_FILE)) {
            _cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            _cacheTime = now;
            return _cache;
        }
    } catch {}
    _cache = { words: [], config: {} };
    _cacheTime = now;
    return _cache;
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        _cache = data;
        _cacheTime = Date.now();
    } catch {}
}

export function addBadWord(word) {
    const data = loadData();
    const clean = word.toLowerCase().trim();
    if (!data.words.includes(clean)) {
        data.words.push(clean);
        saveData(data);
        return true;
    }
    return false;
}

export function removeBadWord(word) {
    const data = loadData();
    const clean = word.toLowerCase().trim();
    const idx = data.words.indexOf(clean);
    if (idx !== -1) {
        data.words.splice(idx, 1);
        saveData(data);
        return true;
    }
    return false;
}

export function getBadWords() {
    return loadData().words;
}

function normalizeText(text) {
    if (!text) return '';
    return text
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u200B-\u200D\u00AD\uFEFF\u200E\u200F]/g, '')
        .replace(/[*_~`]/g, '')
        .toLowerCase();
}

export function checkMessageForBadWord(text) {
    if (!text) return null;
    const normalized = normalizeText(text);
    const plain = normalized.replace(/\s+/g, ' ');
    const nospace = normalized.replace(/\s/g, '');
    const words = loadData().words;
    for (const word of words) {
        if (plain.includes(word) || nospace.includes(word)) return word;
    }
    return null;
}

export function isGroupEnabled(groupJid) {
    const data = loadData();
    if (groupJid === 'global') return data.config['global']?.enabled || false;
    if (data.config['global']?.enabled) return true;
    return data.config[groupJid]?.enabled !== false && (data.config[groupJid]?.enabled === true || false);
}

export function setGroupConfig(groupJid, enabled, action = 'warn') {
    const data = loadData();
    data.config[groupJid] = { enabled, action };
    saveData(data);
}

export function getGroupAction(groupJid) {
    const data = loadData();
    return data.config[groupJid]?.action || data.config['global']?.action || 'warn';
}

export function getFullConfig() {
    return loadData().config;
}
