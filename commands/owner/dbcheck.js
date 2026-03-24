import fs from 'fs';
import { getConfigBotId } from '../../lib/database.js';

const DB_PATH = './data/bot.sqlite';

function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fmtVal(raw) {
    try {
        const obj = JSON.parse(raw);
        if (typeof obj === 'object' && obj !== null) {
            const keys = Object.keys(obj);
            if (keys.length === 0) return '{}';
            if (keys.length <= 3) return JSON.stringify(obj);
            return `{${keys.slice(0, 3).join(', ')}, … +${keys.length - 3} more}`;
        }
        return String(obj);
    } catch {
        const s = String(raw);
        return s.length > 80 ? s.slice(0, 77) + '…' : s;
    }
}

async function readTable(table) {
    try {
        const { default: Database } = await import('better-sqlite3');
        const sqlite = new Database(DB_PATH, { readonly: true });
        const rows = sqlite.prepare(`SELECT * FROM ${table} ORDER BY bot_id, key`).all();
        sqlite.close();
        return rows;
    } catch {
        return null;
    }
}

const JSON_ROOT_FILES = [
    { file: 'prefix_config.json', label: 'prefix',      pick: r => `prefix="${r.prefix ?? '?'}"` },
    { file: 'bot_mode.json',      label: 'bot_mode',    pick: r => `mode="${r.mode ?? '?'}"` },
    { file: 'bot_settings.json',  label: 'bot_settings',pick: r => `prefix="${r.prefix ?? '?'}"` },
    { file: 'last_bot_id.json',   label: 'last_bot_id', pick: r => `id="${r.botId ?? r.bot_id ?? r.id ?? '?'}"` },
    { file: 'owner.json',         label: 'owner',       pick: r => `number="${r.OWNER_NUMBER ?? r.ownerNumber ?? '?'}"` },
];

const JSON_DATA_FILES = [
    { file: 'data/autotyping/config.json',    label: 'autotyping',    pick: r => `mode="${r.mode ?? 'off'}"` },
    { file: 'data/autorecording/config.json', label: 'autorecording', pick: r => `mode="${r.mode ?? 'off'}"` },
    { file: 'data/groupqueue.json',           label: 'group-queue',   pick: r => `${(Array.isArray(r) ? r : r.queue ?? []).length} queued` },
    { file: 'data/exportqueue.json',          label: 'export-queue',  pick: r => `${(Array.isArray(r) ? r : r.queue ?? []).length} queued` },
];

export default {
    name: 'dbcheck',
    aliases: ['db', 'dbstatus'],
    category: 'owner',
    ownerOnly: true,
    desc: 'Show all settings stored in SQLite and JSON fallback files',

    async execute(sock, msg, args, PREFIX) {
        const chatId = msg.key.remoteJid;
        const P = PREFIX || '/';
        const lines = [];

        // ── DB file info ──────────────────────────────────────────────────────────
        let dbSizeLine = '❌ not found';
        try { dbSizeLine = fmtSize(fs.statSync(DB_PATH).size); } catch {}

        const currentBotId = (() => { try { return getConfigBotId() || 'unknown'; } catch { return 'unknown'; } })();

        lines.push(`*🗄️ SQLite Database Check*`);
        lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━`);
        lines.push(`📁 File: data/bot.sqlite`);
        lines.push(`💾 Size: ${dbSizeLine}`);
        lines.push(`🤖 Bot ID: ${currentBotId}`);
        lines.push(``);

        // ── bot_configs table ─────────────────────────────────────────────────────
        lines.push(`*📋 bot_configs*`);
        const botConfigs = await readTable('bot_configs');
        if (!botConfigs) {
            lines.push(`  ❌ Could not read table`);
        } else if (botConfigs.length === 0) {
            lines.push(`  ⚠️ EMPTY — settings will reset on restart!`);
        } else {
            const byBotId = {};
            for (const r of botConfigs) {
                (byBotId[r.bot_id] = byBotId[r.bot_id] || []).push(r);
            }
            for (const [bid, rows] of Object.entries(byBotId)) {
                lines.push(`  *[${bid}]* — ${rows.length} keys`);
                for (const r of rows) {
                    lines.push(`    • ${r.key}: ${fmtVal(r.value)}`);
                }
            }
        }
        lines.push(``);

        // ── auto_configs table ────────────────────────────────────────────────────
        lines.push(`*⚙️ auto_configs*`);
        const autoConfigs = await readTable('auto_configs');
        if (!autoConfigs) {
            lines.push(`  ❌ Could not read table`);
        } else if (autoConfigs.length === 0) {
            lines.push(`  (empty)`);
        } else {
            for (const r of autoConfigs) {
                lines.push(`  • [${r.bot_id}] ${r.key}: ${fmtVal(r.value)}`);
            }
        }
        lines.push(``);

        // ── JSON fallback files ───────────────────────────────────────────────────
        lines.push(`*📄 JSON fallback files*`);
        for (const { file, pick } of JSON_ROOT_FILES) {
            try {
                if (fs.existsSync(file)) {
                    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
                    lines.push(`  ✅ ${file} → ${pick(raw)}`);
                } else {
                    lines.push(`  ❌ ${file} → MISSING`);
                }
            } catch {
                lines.push(`  ⚠️ ${file} → unreadable`);
            }
        }
        lines.push(``);

        // ── JSON-only data files ──────────────────────────────────────────────────
        lines.push(`*📦 data/ JSON files*`);
        for (const { file, pick } of JSON_DATA_FILES) {
            try {
                if (fs.existsSync(file)) {
                    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
                    lines.push(`  ✅ ${file} → ${pick(raw)}`);
                } else {
                    lines.push(`  ➖ ${file} → not created yet`);
                }
            } catch {
                lines.push(`  ⚠️ ${file} → unreadable`);
            }
        }
        lines.push(``);

        // ── Prefix health check ───────────────────────────────────────────────────
        lines.push(`*🩺 Prefix Health*`);

        let prefixInDb = null;
        try {
            const { default: Database } = await import('better-sqlite3');
            const s = new Database(DB_PATH, { readonly: true });
            const r = s.prepare(`SELECT value FROM bot_configs WHERE key='prefix_config' AND bot_id=?`).get(currentBotId);
            s.close();
            if (r) prefixInDb = JSON.parse(r.value).prefix ?? '?';
        } catch {}

        const prefixInFile = (() => {
            try { return JSON.parse(fs.readFileSync('prefix_config.json', 'utf8')).prefix ?? null; }
            catch { return null; }
        })();
        const prefixInMem = global.prefix ?? global.CURRENT_PREFIX ?? null;

        lines.push(`  DB    : ${prefixInDb !== null ? `"${prefixInDb}"` : '❌ not found'}`);
        lines.push(`  File  : ${prefixInFile !== null ? `"${prefixInFile}"` : '❌ not found'}`);
        lines.push(`  Memory: ${prefixInMem !== null ? `"${prefixInMem}"` : '❌ not found'}`);

        const allMatch = prefixInDb !== null && prefixInFile !== null && prefixInMem !== null
            && prefixInDb === prefixInFile && prefixInFile === prefixInMem;
        lines.push(`  ${allMatch ? '✅ All in sync' : `⚠️ Mismatch — run ${P}setprefix to re-sync`}`);

        lines.push(``);
        lines.push(`_Tip: use ${P}getsettings for the full settings overview_`);

        await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: msg });
    }
};
