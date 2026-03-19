import fs from 'fs';

const FILE = './data/chatlocks.json';

function load() {
  try {
    if (fs.existsSync(FILE)) return new Set(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch {}
  return new Set();
}

function save(set) {
  try {
    fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify([...set]));
  } catch {}
}

const locked = load();

export function isChatLocked(chatId) {
  return locked.has(chatId);
}

export function lockChat(chatId) {
  locked.add(chatId);
  save(locked);
}

export function unlockChat(chatId) {
  locked.delete(chatId);
  save(locked);
}

export function toggleChatLock(chatId) {
  if (locked.has(chatId)) {
    locked.delete(chatId);
    save(locked);
    return false; // now unlocked
  }
  locked.add(chatId);
  save(locked);
  return true; // now locked
}
