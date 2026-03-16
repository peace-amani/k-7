import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'bot.sqlite');
const BACKUP_PATH = path.join(DB_DIR, 'critical_backup.json');

let db = null;
let isConnected = false;
let configBotId = 'default';

// ─── sql.js WASM adapter (used when better-sqlite3 native binary unavailable) ─
class SqlJsAdapter {
    constructor(sqlJsDb, dbPath) {
        this._db  = sqlJsDb;
        this._dbPath = dbPath;
        this._dirty  = false;
        this._timer  = setInterval(() => { try { this._flush(); } catch {} }, 3000);
        process.on('exit', () => { try { this._flush(); } catch {} });
    }

    _flush() {
        if (!this._dirty) return;
        const data = this._db.export();
        const dir  = path.dirname(this._dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = this._dbPath + '.tmp';
        fs.writeFileSync(tmp, Buffer.from(data));
        fs.renameSync(tmp, this._dbPath);
        this._dirty = false;
    }

    pragma(str) { try { this._db.run(`PRAGMA ${str}`); } catch {} }

    exec(sql) {
        try { this._db.run(sql); } catch (e) {
            if (!/pragma/i.test(sql)) throw e;
        }
        this._dirty = true;
    }

    prepare(sql) {
        const self = this;
        const _bind = (stmt, args) => {
            const flat = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
            if (flat.length) stmt.bind(flat.map(v => (v === undefined ? null : v)));
        };
        return {
            get(...args) {
                const stmt = self._db.prepare(sql);
                try { _bind(stmt, args); return stmt.step() ? stmt.getAsObject() : undefined; }
                finally { stmt.free(); }
            },
            all(...args) {
                const stmt = self._db.prepare(sql);
                try {
                    _bind(stmt, args);
                    const rows = [];
                    while (stmt.step()) rows.push({ ...stmt.getAsObject() });
                    return rows;
                } finally { stmt.free(); }
            },
            run(...args) {
                const stmt = self._db.prepare(sql);
                try {
                    _bind(stmt, args);
                    stmt.step();
                    self._dirty = true;
                    return { changes: self._db.getRowsModified(), lastInsertRowid: null };
                } finally { stmt.free(); }
            }
        };
    }

    transaction(fn) {
        const self = this;
        return function(...args) {
            self._db.run('BEGIN');
            try {
                const result = fn(...args);
                self._db.run('COMMIT');
                self._dirty = true;
                return result;
            } catch (e) {
                try { self._db.run('ROLLBACK'); } catch {}
                throw e;
            }
        };
    }
}

async function _openSqlJsDb() {
    const wasmJs   = path.join(__dirname, 'vendor', 'sql-wasm.js');
    const wasmBin  = path.join(__dirname, 'vendor', 'sql-wasm.wasm');
    const initSqlJs = require(wasmJs);
    const SQL = await initSqlJs({ locateFile: () => wasmBin });
    let sqlJsDb;
    if (fs.existsSync(DB_PATH)) {
        sqlJsDb = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
        sqlJsDb = new SQL.Database();
    }
    return new SqlJsAdapter(sqlJsDb, DB_PATH);
}

// ─── Prepared statement cache ──────────────────────────────────────────────
// Re-using prepared statements instead of calling db.prepare(sql) on every
// query eliminates continuous Statement object allocation (the root cause of
// the ~10MB/30s V8 heap growth under message load).
const _stmtCache = new Map();
function _prepare(sql) {
    let stmt = _stmtCache.get(sql);
    if (!stmt) {
        stmt = db.prepare(sql);
        _stmtCache.set(sql, stmt);
    }
    return stmt;
}

// ─── In-memory media cache ─────────────────────────────────────────────────
const _mediaCache = new Map();
const MEDIA_CACHE_TTL = 30 * 60 * 1000;
const MEDIA_CACHE_MAX = 30; // hard cap: max 30 entries (at ≤3MB each = ≤90MB total)

// ─── Critical tables backed up to JSON ────────────────────────────────────
const CRITICAL_TABLES = ['bot_configs', 'sudoers', 'sudo_config', 'warnings', 'warning_limits', 'auto_configs'];
let _backupTimer = null;
let _backupDirty = false;

function markBackupDirty() { _backupDirty = true; }

function saveBackup() {
    if (!db || !_backupDirty) return;
    try {
        const snapshot = {};
        for (const table of CRITICAL_TABLES) {
            try { snapshot[table] = db.prepare(`SELECT * FROM ${table}`).all(); }
            catch { snapshot[table] = []; }
        }
        if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
        const tmp = BACKUP_PATH + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
        fs.renameSync(tmp, BACKUP_PATH);
        _backupDirty = false;
    } catch (err) {
        console.error('⚠️ Backup save error:', err.message);
    }
}

async function saveBackupAsync() {
    if (!db || !_backupDirty) return;
    try {
        const snapshot = {};
        for (const table of CRITICAL_TABLES) {
            try { snapshot[table] = db.prepare(`SELECT * FROM ${table}`).all(); }
            catch { snapshot[table] = []; }
        }
        _backupDirty = false;
        const tmp = BACKUP_PATH + '.tmp';
        await fs.promises.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
        await fs.promises.rename(tmp, BACKUP_PATH);
    } catch (err) {
        console.error('⚠️ Backup save error:', err.message);
    }
}

function restoreFromBackup() {
    if (!db || !fs.existsSync(BACKUP_PATH)) return;
    try {
        const snapshot = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
        let restored = 0;
        const restoreTx = db.transaction(() => {
            for (const table of CRITICAL_TABLES) {
                const rows = snapshot[table];
                if (!Array.isArray(rows) || rows.length === 0) continue;
                for (const row of rows) {
                    const keys = Object.keys(row);
                    if (keys.length === 0) continue;
                    const placeholders = keys.map(() => '?').join(', ');
                    try {
                        db.prepare(
                            `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`
                        ).run(...Object.values(row));
                        restored++;
                    } catch {}
                }
            }
        });
        restoreTx();
    } catch (err) {
        console.error('⚠️ Backup restore error:', err.message);
    }
}

// ─── Config bot ID ─────────────────────────────────────────────────────────
export function setConfigBotId(botId) {
    if (botId) {
        const cleaned = botId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        configBotId = cleaned || botId.split('@')[0] || 'default';
    }
}

export function getConfigBotId() { return configBotId; }

// ─── Schema ────────────────────────────────────────────────────────────────
const TABLE_SCHEMAS = {
    bot_configs: `
        CREATE TABLE IF NOT EXISTS bot_configs (
            key TEXT NOT NULL,
            value TEXT NOT NULL DEFAULT '{}',
            bot_id TEXT NOT NULL DEFAULT 'default',
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (key, bot_id)
        )`,
    warnings: `
        CREATE TABLE IF NOT EXISTS warnings (
            group_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            bot_id TEXT NOT NULL DEFAULT 'default',
            count INTEGER DEFAULT 0,
            reasons TEXT DEFAULT '[]',
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (group_id, user_id, bot_id)
        )`,
    warning_limits: `
        CREATE TABLE IF NOT EXISTS warning_limits (
            group_id TEXT NOT NULL,
            bot_id TEXT NOT NULL DEFAULT 'default',
            max_warnings INTEGER DEFAULT 3,
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (group_id, bot_id)
        )`,
    sudoers: `
        CREATE TABLE IF NOT EXISTS sudoers (
            phone_number TEXT NOT NULL,
            jid TEXT,
            bot_id TEXT NOT NULL DEFAULT 'default',
            added_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (phone_number, bot_id)
        )`,
    sudo_config: `
        CREATE TABLE IF NOT EXISTS sudo_config (
            id TEXT NOT NULL DEFAULT 'main',
            bot_id TEXT NOT NULL DEFAULT 'default',
            sudomode INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (id, bot_id)
        )`,
    lid_map: `
        CREATE TABLE IF NOT EXISTS lid_map (
            lid TEXT PRIMARY KEY,
            phone_number TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
    chatbot_conversations: `
        CREATE TABLE IF NOT EXISTS chatbot_conversations (
            user_id TEXT NOT NULL,
            bot_id TEXT NOT NULL DEFAULT 'default',
            conversation TEXT DEFAULT '[]',
            last_updated TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, bot_id)
        )`,
    chatbot_config: `
        CREATE TABLE IF NOT EXISTS chatbot_config (
            key TEXT NOT NULL DEFAULT 'main',
            bot_id TEXT NOT NULL DEFAULT 'default',
            config TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (key, bot_id)
        )`,
    antidelete_messages: `
        CREATE TABLE IF NOT EXISTS antidelete_messages (
            message_id TEXT NOT NULL,
            bot_id TEXT NOT NULL DEFAULT 'default',
            chat_id TEXT,
            sender_id TEXT,
            message_data TEXT,
            timestamp INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (message_id, bot_id)
        )`,
    antidelete_statuses: `
        CREATE TABLE IF NOT EXISTS antidelete_statuses (
            status_id TEXT NOT NULL,
            bot_id TEXT NOT NULL DEFAULT 'default',
            sender_id TEXT,
            sender_number TEXT,
            push_name TEXT,
            status_type TEXT,
            status_data TEXT,
            media_meta TEXT,
            has_media INTEGER DEFAULT 0,
            text_content TEXT,
            timestamp INTEGER,
            deleted INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (status_id, bot_id)
        )`,
    welcome_goodbye: `
        CREATE TABLE IF NOT EXISTS welcome_goodbye (
            group_id TEXT NOT NULL,
            bot_id TEXT NOT NULL DEFAULT 'default',
            welcome TEXT DEFAULT NULL,
            goodbye TEXT DEFAULT NULL,
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (group_id, bot_id)
        )`,
    group_features: `
        CREATE TABLE IF NOT EXISTS group_features (
            group_id TEXT NOT NULL,
            feature TEXT NOT NULL,
            bot_id TEXT NOT NULL DEFAULT 'default',
            config TEXT NOT NULL DEFAULT '{}',
            enabled INTEGER DEFAULT 1,
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (group_id, feature, bot_id)
        )`,
    auto_configs: `
        CREATE TABLE IF NOT EXISTS auto_configs (
            key TEXT NOT NULL,
            bot_id TEXT NOT NULL DEFAULT 'default',
            value TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (key, bot_id)
        )`
};

const ALLOWED_TABLES = new Set(Object.keys(TABLE_SCHEMAS));
const ALLOWED_COLUMNS = new Set([
    'key', 'value', 'updated_at', 'group_id', 'user_id', 'count', 'reasons',
    'max_warnings', 'phone_number', 'jid', 'added_at', 'id', 'sudomode',
    'lid', 'conversation', 'last_updated', 'config', 'message_id', 'chat_id',
    'sender_id', 'message_data', 'timestamp', 'created_at', 'status_id',
    'sender_number', 'push_name', 'status_type', 'status_data', 'media_meta',
    'has_media', 'text_content', 'deleted', 'welcome', 'goodbye', 'feature',
    'enabled', 'bot_id'
]);

function validateTable(name) {
    if (!ALLOWED_TABLES.has(name)) throw new Error(`Unknown table: ${name}`);
    return name;
}

function validateColumn(name) {
    if (!ALLOWED_COLUMNS.has(name) && !(/^[a-z_][a-z0-9_]*$/).test(name)) {
        throw new Error(`Invalid column: ${name}`);
    }
    return name;
}

// ─── Value helpers ─────────────────────────────────────────────────────────
function serializeValue(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object' && !(v instanceof Buffer) && !(v instanceof Uint8Array)) return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
}

function deserializeRow(row) {
    if (!row) return null;
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        let val = v;
        if (typeof val === 'string') {
            if ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']'))) {
                try { val = JSON.parse(val); } catch {}
            }
        }
        if (k === 'has_media' || k === 'deleted' || k === 'enabled' || k === 'sudomode') {
            val = !!val;
        }
        out[k] = val;
    }
    return out;
}

// ─── Init ──────────────────────────────────────────────────────────────────
let _usingWasm = false;

async function _openDb() {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    // Try native better-sqlite3 first (fast, zero overhead)
    try {
        const Database = require('better-sqlite3');
        const instance = new Database(DB_PATH);
        instance.pragma('journal_mode = WAL');
        instance.pragma('synchronous = NORMAL');
        instance.pragma('foreign_keys = ON');
        instance.pragma('temp_store = MEMORY');
        instance.pragma('mmap_size = 30000000');
        instance.pragma('cache_size = -8000');
        _usingWasm = false;
        return instance;
    } catch {
        // Native binary unavailable (e.g. pterodactyl/Katabump) — use WASM SQLite
        _usingWasm = true;
        return await _openSqlJsDb();
    }
}

export async function initTables() {
    // Attempt 1
    try { db = await _openDb(); }
    catch (firstErr) {
        // Possibly corrupt DB file — delete and retry once
        try {
            if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
            db = await _openDb();
        } catch (secondErr) {
            isConnected = false;
            throw new Error(`SQLite: cannot open database — ${secondErr.message}`);
        }
    }

    for (const [name, sql] of Object.entries(TABLE_SCHEMAS)) {
        try { db.exec(sql); }
        catch (err) { console.error(`⚠️ SQLite: table ${name}:`, err.message); }
    }

    try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_antidelete_messages_timestamp ON antidelete_messages(timestamp)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_antidelete_statuses_timestamp ON antidelete_statuses(timestamp)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_antidelete_messages_chat ON antidelete_messages(chat_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_group_features_group ON group_features(group_id)');
    } catch {}

    restoreFromBackup();

    isConnected = true;

    if (_backupTimer) clearInterval(_backupTimer);
    _backupTimer = setInterval(() => saveBackupAsync().catch(() => {}), 5 * 60 * 1000);

    startPeriodicCleanup();

    return true;
}

export function getClient() { return db; }

export async function checkHealth() {
    if (!db || !isConnected) return false;
    try { _prepare('SELECT 1').get(); return true; } catch { return false; }
}

export function isAvailable() { return isConnected && !!db; }
export function isUsingWasm()  { return _usingWasm; }

// ─── CRUD ──────────────────────────────────────────────────────────────────
export async function get(table, key, keyColumn = 'key') {
    try {
        if (!isConnected || !db) return null;
        const t = validateTable(table);
        const col = validateColumn(keyColumn);
        const row = _prepare(`SELECT * FROM ${t} WHERE ${col} = ? LIMIT 1`).get(key);
        return deserializeRow(row) || null;
    } catch { return null; }
}

export async function getAll(table, filters = {}) {
    try {
        if (!isConnected || !db) return null;
        const t = validateTable(table);
        const keys = Object.keys(filters);
        let sql = `SELECT * FROM ${t}`;
        const params = [];
        if (keys.length > 0) {
            const conditions = keys.map(k => `${validateColumn(k)} = ?`);
            sql += ` WHERE ${conditions.join(' AND ')}`;
            params.push(...Object.values(filters));
        }
        const rows = _prepare(sql).all(...params);
        return rows.map(deserializeRow);
    } catch { return null; }
}

export async function upsert(table, data, onConflict = undefined) {
    try {
        if (!isConnected || !db) return false;
        const t = validateTable(table);
        const keys = Object.keys(data).map(k => validateColumn(k));
        const values = Object.values(data).map(serializeValue);
        const placeholders = keys.map(() => '?');

        const conflictCols = onConflict
            ? onConflict.split(',').map(c => validateColumn(c.trim()))
            : [keys[0]];
        const conflictTarget = conflictCols.join(', ');
        const conflictSet = new Set(conflictCols);
        const updateCols = keys.filter(k => !conflictSet.has(k));
        const updateSet = updateCols.map(k => `${k} = excluded.${k}`).join(', ');

        let sql;
        if (updateCols.length > 0) {
            sql = `INSERT INTO ${t} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})
                   ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet}`;
        } else {
            sql = `INSERT INTO ${t} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})
                   ON CONFLICT (${conflictTarget}) DO NOTHING`;
        }

        _prepare(sql).run(...values);
        if (CRITICAL_TABLES.includes(t)) markBackupDirty();
        return true;
    } catch { return false; }
}

export async function remove(table, key, keyColumn = 'key') {
    try {
        if (!isConnected || !db) return false;
        const t = validateTable(table);
        const col = validateColumn(keyColumn);
        _prepare(`DELETE FROM ${t} WHERE ${col} = ?`).run(key);
        if (CRITICAL_TABLES.includes(t)) markBackupDirty();
        return true;
    } catch { return false; }
}

export async function removeWhere(table, filters = {}) {
    try {
        if (!isConnected || !db) return false;
        const t = validateTable(table);
        const keys = Object.keys(filters);
        if (keys.length === 0) return false;
        const conditions = keys.map(k => `${validateColumn(k)} = ?`);
        _prepare(`DELETE FROM ${t} WHERE ${conditions.join(' AND ')}`).run(...Object.values(filters));
        if (CRITICAL_TABLES.includes(t)) markBackupDirty();
        return true;
    } catch { return false; }
}

export async function count(table, filters = {}) {
    try {
        if (!isConnected || !db) return null;
        const t = validateTable(table);
        const keys = Object.keys(filters);
        let sql = `SELECT COUNT(*) AS cnt FROM ${t}`;
        const params = [];
        if (keys.length > 0) {
            const conditions = keys.map(k => `${validateColumn(k)} = ?`);
            sql += ` WHERE ${conditions.join(' AND ')}`;
            params.push(...Object.values(filters));
        }
        const row = _prepare(sql).get(...params);
        return row ? row.cnt : null;
    } catch { return null; }
}

export async function cleanOlderThan(table, timestampColumn, maxAgeMs) {
    try {
        if (!isConnected || !db) return 0;
        const t = validateTable(table);
        const col = validateColumn(timestampColumn);
        const cutoff = Date.now() - maxAgeMs;
        const botId = configBotId;
        const result = _prepare(`DELETE FROM ${t} WHERE ${col} < ? AND bot_id = ?`).run(cutoff, botId);
        return result.changes || 0;
    } catch { return 0; }
}

// ─── JSON file helpers ─────────────────────────────────────────────────────
export function readJSON(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {}
    return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
}

export function writeJSON(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch { return false; }
}

// ─── Config helpers ────────────────────────────────────────────────────────
export async function getConfig(key, defaultValue = {}) {
    const botId = getConfigBotId();
    try {
        if (!isConnected || !db) return defaultValue;
        const row = _prepare(`SELECT value FROM bot_configs WHERE key = ? AND bot_id = ? LIMIT 1`).get(key, botId);
        if (row) {
            const v = row.value;
            if (typeof v === 'string') {
                try { return JSON.parse(v); } catch { return v; }
            }
            return v;
        }
    } catch {}
    return defaultValue;
}

export async function setConfig(key, value) {
    const botId = getConfigBotId();
    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
    return await upsert('bot_configs', {
        key,
        value: jsonValue,
        bot_id: botId,
        updated_at: new Date().toISOString()
    }, 'key,bot_id');
}

export async function getAutoConfig(key, defaultValue = {}) {
    const botId = getConfigBotId();
    try {
        if (!isConnected || !db) return defaultValue;
        const row = _prepare(`SELECT value FROM auto_configs WHERE key = ? AND bot_id = ? LIMIT 1`).get(key, botId);
        if (row) {
            const v = row.value;
            if (typeof v === 'string') {
                try { return JSON.parse(v); } catch { return v; }
            }
            return v;
        }
    } catch {}
    return defaultValue;
}

export async function setAutoConfig(key, value) {
    const botId = getConfigBotId();
    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
    return await upsert('auto_configs', {
        key,
        value: jsonValue,
        bot_id: botId,
        updated_at: new Date().toISOString()
    }, 'key,bot_id');
}

export async function migrateJSONToConfig(filePath, configKey) {
    if (!isConnected || !db) return false;
    try {
        const botId = getConfigBotId();
        const existing = _prepare('SELECT 1 FROM bot_configs WHERE key = ? AND bot_id = ? LIMIT 1').get(configKey, botId);
        if (existing) return true;
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            await setConfig(configKey, data);
            console.log(`✅ SQLite: Migrated ${filePath} → bot_configs.${configKey}`);
            return true;
        }
    } catch (err) {
        console.error(`⚠️ SQLite: Migration error for ${filePath}:`, err.message);
    }
    return false;
}

// ─── Media store (in-memory cache) ────────────────────────────────────────
export async function uploadMedia(msgId, buffer, mimetype, folder = 'messages') {
    try {
        const ext = mimetype?.split('/')[1]?.split(';')[0] || 'bin';
        const filePath = `${folder}/${msgId}.${ext}`;
        // Enforce size cap: evict oldest entries before adding a new one
        if (_mediaCache.size >= MEDIA_CACHE_MAX) {
            const oldest = _mediaCache.keys().next().value;
            _mediaCache.delete(oldest);
        }
        _mediaCache.set(filePath, {
            data: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
            mimetype: mimetype || 'application/octet-stream',
            ts: Date.now()
        });
        return filePath;
    } catch (err) {
        console.error('⚠️ Media cache: Upload failed:', err.message);
        return null;
    }
}

export async function downloadMedia(storagePath) {
    try {
        const entry = _mediaCache.get(storagePath);
        if (entry) return entry.data;
        return null;
    } catch { return null; }
}

export async function deleteMedia(storagePath) {
    _mediaCache.delete(storagePath);
    return true;
}

// ─── Antidelete helpers ────────────────────────────────────────────────────
export async function storeAntideleteMessage(msgId, messageData) {
    try {
        const botId = configBotId;
        return await upsert('antidelete_messages', {
            message_id: msgId,
            bot_id: botId,
            chat_id: messageData.chatJid || null,
            sender_id: messageData.senderJid || null,
            message_data: JSON.stringify(messageData),
            timestamp: messageData.timestamp || Date.now(),
            created_at: new Date().toISOString()
        }, 'message_id,bot_id');
    } catch { return false; }
}

export async function getAntideleteMessage(msgId) {
    try {
        const botId = configBotId;
        const rows = await getAll('antidelete_messages', { message_id: msgId, bot_id: botId });
        const row = rows?.[0];
        if (!row) return null;
        const data = row.message_data;
        return typeof data === 'string' ? JSON.parse(data) : data;
    } catch { return null; }
}

export async function deleteAntideleteMessage(msgId) {
    try {
        const botId = configBotId;
        return await removeWhere('antidelete_messages', { message_id: msgId, bot_id: botId });
    } catch { return false; }
}

export async function storeAntideleteStatus(statusId, statusData) {
    try {
        const botId = configBotId;
        return await upsert('antidelete_statuses', {
            status_id: statusId,
            bot_id: botId,
            sender_id: statusData.senderJid || null,
            sender_number: statusData.senderNumber || null,
            push_name: statusData.pushName || null,
            status_type: statusData.type || null,
            status_data: JSON.stringify(statusData),
            media_meta: statusData.hasMedia ? JSON.stringify({ mimetype: statusData.mimetype, type: statusData.type }) : null,
            has_media: statusData.hasMedia ? 1 : 0,
            text_content: statusData.text || null,
            timestamp: statusData.timestamp || Date.now(),
            deleted: 0,
            created_at: new Date().toISOString()
        }, 'status_id,bot_id');
    } catch { return false; }
}

export async function getAntideleteStatus(statusId) {
    try {
        const botId = configBotId;
        const rows = await getAll('antidelete_statuses', { status_id: statusId, bot_id: botId });
        const row = rows?.[0];
        if (!row) return null;
        const data = row.status_data;
        return typeof data === 'string' ? JSON.parse(data) : data;
    } catch { return null; }
}

export async function deleteAntideleteStatus(statusId) {
    try {
        const botId = configBotId;
        return await removeWhere('antidelete_statuses', { status_id: statusId, bot_id: botId });
    } catch { return false; }
}

export async function clearAllAntideleteData() {
    const results = { tables: 0, files: 0, errors: [] };
    try {
        if (!isConnected || !db) { results.errors.push('SQLite not connected'); return results; }
        const botId = configBotId;
        try {
            const r1 = db.prepare('DELETE FROM antidelete_messages WHERE bot_id = ?').run(botId);
            results.tables += r1.changes;
        } catch (err) { results.errors.push(`messages: ${err.message}`); }
        try {
            const r2 = _prepare('DELETE FROM antidelete_statuses WHERE bot_id = ?').run(botId);
            results.tables += r2.changes;
        } catch (err) { results.errors.push(`statuses: ${err.message}`); }
        results.files += _mediaCache.size;
        _mediaCache.clear();
        return results;
    } catch (err) {
        results.errors.push(err.message);
        return results;
    }
}

export async function wipeAllTables() {
    const results = { tables: {}, totalRows: 0, errors: [] };
    if (!isConnected || !db) { results.errors.push('SQLite not connected'); return results; }
    for (const table of Object.keys(TABLE_SCHEMAS)) {
        try {
            const r = db.prepare(`DELETE FROM ${table}`).run();
            results.tables[table] = r.changes;
            results.totalRows += r.changes;
        } catch (err) {
            results.tables[table] = 0;
            results.errors.push(`${table}: ${err.message}`);
        }
    }
    _mediaCache.clear();
    markBackupDirty();
    saveBackup();
    return results;
}

// ─── Periodic cleanup ──────────────────────────────────────────────────────
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const MAX_ANTIDELETE_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_ANTIDELETE_ROWS = 150;
const VACUUM_INTERVAL = 24 * 60 * 60 * 1000;
const WAL_CHECKPOINT_INTERVAL = 30 * 60 * 1000;
const KEY_PRUNE_INTERVAL = 24 * 60 * 60 * 1000;
let cleanupTimer = null;
let vacuumTimer = null;
let walTimer = null;
let gcTimer = null;
let _lastKeyPrune = 0;

export async function runPeriodicCleanup() {
    if (!isConnected || !db) return;
    try {
        const msgCleaned = await cleanOlderThan('antidelete_messages', 'timestamp', MAX_ANTIDELETE_AGE_MS);
        const statusCleaned = await cleanOlderThan('antidelete_statuses', 'timestamp', MAX_ANTIDELETE_AGE_MS);

        let rowLimitCleaned = 0;
        try {
            const botId = configBotId;
            const msgCount = db.prepare('SELECT COUNT(*) AS c FROM antidelete_messages WHERE bot_id = ?').get(botId)?.c || 0;
            if (msgCount > MAX_ANTIDELETE_ROWS) {
                const excess = msgCount - MAX_ANTIDELETE_ROWS;
                const r = db.prepare(
                    `DELETE FROM antidelete_messages WHERE bot_id = ? AND message_id IN
                     (SELECT message_id FROM antidelete_messages WHERE bot_id = ? ORDER BY timestamp ASC LIMIT ?)`
                ).run(botId, botId, excess);
                rowLimitCleaned += r.changes;
            }
            const statusCount = db.prepare('SELECT COUNT(*) AS c FROM antidelete_statuses WHERE bot_id = ?').get(botId)?.c || 0;
            if (statusCount > MAX_ANTIDELETE_ROWS) {
                const excess = statusCount - MAX_ANTIDELETE_ROWS;
                const r = db.prepare(
                    `DELETE FROM antidelete_statuses WHERE bot_id = ? AND status_id IN
                     (SELECT status_id FROM antidelete_statuses WHERE bot_id = ? ORDER BY timestamp ASC LIMIT ?)`
                ).run(botId, botId, excess);
                rowLimitCleaned += r.changes;
            }
        } catch {}

        const now = Date.now();
        let mediaCleaned = 0;
        for (const [k, v] of _mediaCache.entries()) {
            if (now - v.ts > MEDIA_CACHE_TTL) { _mediaCache.delete(k); mediaCleaned++; }
        }

        // Prune stale Signal session keys once per day
        let keysPruned = 0;
        const now2 = Date.now();
        if (now2 - _lastKeyPrune > KEY_PRUNE_INTERVAL) {
            try {
                const cutoff = now2 - 30 * 24 * 60 * 60 * 1000;
                const prunable = ['pre-key', 'sender-key', 'sender-key-memory', 'session'];
                for (const type of prunable) {
                    try {
                        const r = db.prepare(
                            `DELETE FROM session_keys WHERE type = ? AND updated_at < ?`
                        ).run(type, cutoff);
                        keysPruned += r.changes;
                    } catch {}
                }
                _lastKeyPrune = now2;
            } catch {}
        }

        const total = msgCleaned + statusCleaned + rowLimitCleaned + mediaCleaned + keysPruned;
        if (total > 0) {
            saveBackupAsync().catch(() => {});
            const parts = [`msgs: ${msgCleaned}`, `statuses: ${statusCleaned}`, `rowLimit: ${rowLimitCleaned}`, `media: ${mediaCleaned}`];
            if (keysPruned > 0) parts.push(`session keys: ${keysPruned}`);
            console.log(`🧹 DB Cleanup: removed ${total} old records (${parts.join(', ')})`);
        }
    } catch (err) {
        console.error('⚠️ DB Cleanup error:', err.message);
    }
}

function runWalCheckpoint() {
    if (!isConnected || !db) return;
    try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        db.pragma('optimize');
    } catch {}
}

function runVacuum() {
    if (!isConnected || !db) return;
    try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        db.exec('VACUUM');
        console.log('🧹 DB: VACUUM completed (reclaimed disk space)');
    } catch (err) {
        console.error('⚠️ DB VACUUM error:', err.message);
    }
}

export function startPeriodicCleanup() {
    if (cleanupTimer) clearInterval(cleanupTimer);
    cleanupTimer = setInterval(runPeriodicCleanup, CLEANUP_INTERVAL);
    setTimeout(runPeriodicCleanup, 60000);

    // WAL checkpoint every 30 minutes to keep WAL file from growing
    if (walTimer) clearInterval(walTimer);
    walTimer = setInterval(runWalCheckpoint, WAL_CHECKPOINT_INTERVAL);
    setTimeout(runWalCheckpoint, 10 * 60 * 1000);

    if (vacuumTimer) clearInterval(vacuumTimer);
    vacuumTimer = setInterval(runVacuum, VACUUM_INTERVAL);
    setTimeout(runVacuum, 60 * 60 * 1000);

    // Proactive minor GC every 10 minutes — directly counters the Baileys v7.0.0-rc.9
    // receive-message memory leak (~0.1 MB/msg that V8's auto-GC does not reclaim).
    // Minor GC only sweeps the young generation (short-lived objects) — cheap, <5ms.
    // The existing emergency GC in memoryMonitor fires only above 450 MB; this runs
    // proactively to prevent accumulation from ever reaching that threshold.
    if (gcTimer) clearInterval(gcTimer);
    gcTimer = setInterval(() => {
        try {
            if (typeof global.gc === 'function') {
                // Minor (scavenge) GC first — cheap, targets short-lived allocations
                try { global.gc({ type: 'minor' }); } catch { global.gc(); }
            }
        } catch {}
    }, 10 * 60 * 1000);
}

// ─── Process exit hooks ────────────────────────────────────────────────────
function shutdown() {
    saveBackup();
    if (db) {
        try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
        try { db.close(); } catch {}
    }
}

process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(0); });
process.on('SIGTERM', () => { shutdown(); process.exit(0); });

// ─── Default export (same API surface as old supabase.js) ─────────────────
export default {
    getClient,
    checkHealth,
    initTables,
    isAvailable,
    get,
    getAll,
    upsert,
    remove,
    removeWhere,
    count,
    cleanOlderThan,
    readJSON,
    writeJSON,
    getConfig,
    setConfig,
    getAutoConfig,
    setAutoConfig,
    migrateJSONToConfig,
    setConfigBotId,
    getConfigBotId,
    TABLE_SCHEMAS,
    uploadMedia,
    downloadMedia,
    deleteMedia,
    storeAntideleteMessage,
    getAntideleteMessage,
    deleteAntideleteMessage,
    storeAntideleteStatus,
    getAntideleteStatus,
    deleteAntideleteStatus,
    clearAllAntideleteData,
    wipeAllTables,
    startPeriodicCleanup,
    runPeriodicCleanup
};
