const sessions = new Map();
const TTL = 5 * 60 * 1000;

export function setActionSession(key, data) {
    sessions.set(key, { ...data, ts: Date.now() });
}

export function getActionSession(key) {
    const s = sessions.get(key);
    if (!s) return null;
    if (Date.now() - s.ts > TTL) { sessions.delete(key); return null; }
    return s;
}

export function deleteActionSession(key) {
    sessions.delete(key);
}
