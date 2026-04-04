// ====== lib/pgAdapter.js ======
// Optional PostgreSQL layer for WOLFBOT.
//
// If DATABASE_URL is set in .env, this module opens a connection pool to
// that PostgreSQL server and creates the standard bot tables.
// If DATABASE_URL is NOT set, every exported function is a safe no-op so
// the rest of the bot (which uses SQLite via database.js) is completely
// unaffected.
//
// Usage in other modules:
//   import pg from './pgAdapter.js';
//
//   if (pg.isReady) {
//       await pg.query('INSERT INTO bot_logs (event) VALUES ($1)', ['started']);
//   }
//
// Supported DATABASE_URL formats:
//   postgresql://user:password@host:5432/dbname
//   postgres://user:password@host:5432/dbname?sslmode=require   (Neon / Supabase / Railway)

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ── State ──────────────────────────────────────────────────────────────────

let pool        = null;   // pg.Pool instance, null when disabled
let _ready      = false;  // true once tables are verified
let _tableCount = 0;      // number of tables confirmed in public schema

// ── Boot ───────────────────────────────────────────────────────────────────

async function init() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.log('[PG] No DATABASE_URL set — running on SQLite only (set DATABASE_URL in .env to enable PostgreSQL)');
        return;
    }

    try {
        const { Pool } = require('pg');

        pool = new Pool({
            connectionString: url,
            // Most cloud providers (Neon, Supabase, Railway) require SSL
            ssl: url.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
            max: 5,              // max connections in the pool
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
        });

        // Verify the connection is live
        const client = await pool.connect();
        client.release();

        await createTables();
        _ready = true;
        console.log('[PG] ✅ PostgreSQL connected and tables verified');
    } catch (err) {
        // Sanitize: only show the first line of the error — strips Node.js
        // "Require stack" lines that expose internal file paths on hosted platforms
        const rawMsg  = err.message || String(err);
        const firstLine = rawMsg.split('\n')[0].trim();
        const isModuleErr = err.code === 'MODULE_NOT_FOUND' || firstLine.includes("Cannot find module");
        const cleanMsg = isModuleErr
            ? "pg module not installed — install it with: npm install pg"
            : firstLine;
        console.log(`[PG] ❌ PostgreSQL connection failed: ${cleanMsg}`);
        console.log('[PG] Falling back to SQLite only');
        pool = null;
        _ready = false;
    }
}

// ── Table setup ────────────────────────────────────────────────────────────

async function createTables() {
    const ddl = `
        -- Bot-wide settings (mirrors SQLite bot_configs)
        CREATE TABLE IF NOT EXISTS bot_configs (
            bot_id      TEXT    NOT NULL,
            key         TEXT    NOT NULL,
            value       TEXT,
            updated_at  TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (bot_id, key)
        );

        -- Sudo (trusted admin) users
        CREATE TABLE IF NOT EXISTS sudoers (
            bot_id      TEXT    NOT NULL,
            phone       TEXT    NOT NULL,
            added_at    TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (bot_id, phone)
        );

        -- Per-user warnings
        CREATE TABLE IF NOT EXISTS warnings (
            bot_id      TEXT    NOT NULL,
            chat_id     TEXT    NOT NULL,
            phone       TEXT    NOT NULL,
            count       INTEGER NOT NULL DEFAULT 0,
            updated_at  TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (bot_id, chat_id, phone)
        );

        -- Group-level feature flags (antilink, antidelete, etc.)
        CREATE TABLE IF NOT EXISTS group_features (
            bot_id      TEXT    NOT NULL,
            chat_id     TEXT    NOT NULL,
            feature     TEXT    NOT NULL,
            enabled     BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at  TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (bot_id, chat_id, feature)
        );

        -- LID → phone number mapping
        CREATE TABLE IF NOT EXISTS lid_map (
            lid         TEXT PRIMARY KEY,
            phone       TEXT NOT NULL,
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        );

        -- General event / audit log
        CREATE TABLE IF NOT EXISTS bot_logs (
            id          BIGSERIAL PRIMARY KEY,
            bot_id      TEXT,
            event       TEXT        NOT NULL,
            detail      TEXT,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );
    `;

    await pool.query(ddl);

    // Confirm which tables were created — expose count for startup block
    const check = await pool.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const names = check.rows.map(r => r.tablename).join(', ');
    _tableCount = check.rows.length;
    console.log(`[PG] 🗄️  Tables in DB: ${names || '(none — check Neon branch)'}`);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run a parameterised query against PostgreSQL.
 * Returns null (not an error) when PostgreSQL is disabled.
 *
 * @param {string} text   - SQL query with $1 … $N placeholders
 * @param {any[]}  params - parameter values
 * @returns {Promise<import('pg').QueryResult | null>}
 */
async function query(text, params = []) {
    if (!pool || !_ready) return null;
    try {
        return await pool.query(text, params);
    } catch (err) {
        console.log(`[PG] Query error: ${err.message}\n  SQL: ${text}`);
        return null;
    }
}

/**
 * Acquire a raw pg client for multi-statement transactions.
 * Always call client.release() when done.
 * Returns null when PostgreSQL is disabled.
 *
 * @returns {Promise<import('pg').PoolClient | null>}
 */
async function getClient() {
    if (!pool || !_ready) return null;
    try {
        return await pool.connect();
    } catch (err) {
        console.log(`[PG] getClient error: ${err.message}`);
        return null;
    }
}

/**
 * Gracefully close the connection pool.
 * Called on process exit.
 */
async function close() {
    if (pool) {
        await pool.end().catch(() => {});
        pool   = null;
        _ready = false;
    }
}

// ── Start ──────────────────────────────────────────────────────────────────

// Boot immediately — module is loaded once at startup
init().catch(() => {});

// Clean shutdown
process.on('exit',    () => { close(); });
process.on('SIGTERM', () => { close(); });

// ── Exports ────────────────────────────────────────────────────────────────

export default {
    /** true only after a successful connection + table setup */
    get isReady() { return _ready; },

    /** Number of tables confirmed in the public schema at startup */
    get tableCount() { return _tableCount; },

    /** Run a parameterised SQL query. Returns null if PG is disabled. */
    query,

    /** Get a raw pool client for transactions. Returns null if PG is disabled. */
    getClient,

    /** Close the pool gracefully */
    close,

    /** The raw pg Pool — use only if you need low-level access */
    get pool() { return pool; },
};
