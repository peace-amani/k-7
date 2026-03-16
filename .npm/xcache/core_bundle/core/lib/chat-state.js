import fs from 'fs';
import path from 'path';

const STATE_FILE = './data/chat-state.json';

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 2000;

function loadState() {
  const now = Date.now();
  if (_cache !== null && (now - _cacheTime) < CACHE_TTL) return _cache;
  try {
    if (fs.existsSync(STATE_FILE)) {
      _cache = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      _cacheTime = now;
      return _cache;
    }
  } catch {}
  _cache = { archived: [], muted: {}, pinned: [], starred: [], favourites: [] };
  _cacheTime = now;
  return _cache;
}

function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    _cache = state;
    _cacheTime = Date.now();
  } catch {}
}

export function isArchived(jid) {
  return loadState().archived.includes(jid);
}

export function setArchived(jid, val) {
  const state = loadState();
  if (val) { if (!state.archived.includes(jid)) state.archived.push(jid); }
  else { state.archived = state.archived.filter(j => j !== jid); }
  saveState(state);
}

export function isMuted(jid) {
  const state = loadState();
  if (!state.muted[jid]) return false;
  if (state.muted[jid] < Date.now()) {
    delete state.muted[jid];
    saveState(state);
    return false;
  }
  return true;
}

export function setMuted(jid, muteUntil) {
  const state = loadState();
  if (muteUntil) state.muted[jid] = muteUntil;
  else delete state.muted[jid];
  saveState(state);
}

export function isPinned(jid) {
  return loadState().pinned.includes(jid);
}

export function setPinned(jid, val) {
  const state = loadState();
  if (val) { if (!state.pinned.includes(jid)) state.pinned.push(jid); }
  else { state.pinned = state.pinned.filter(j => j !== jid); }
  saveState(state);
}

export function isFavourite(jid) {
  return loadState().favourites.includes(jid);
}

export function setFavourite(jid, val) {
  const state = loadState();
  if (val) { if (!state.favourites.includes(jid)) state.favourites.push(jid); }
  else { state.favourites = state.favourites.filter(j => j !== jid); }
  saveState(state);
}

export function getArchivedList() { return loadState().archived; }
export function getMutedList() {
  const state = loadState();
  const now = Date.now();
  const active = Object.entries(state.muted)
    .filter(([, ts]) => ts > now)
    .map(([jid]) => jid);
  return active;
}
export function getPinnedList() { return loadState().pinned; }
export function getFavouritesList() { return loadState().favourites; }
