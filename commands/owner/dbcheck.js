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

const jsonFallbacks = [
    { file: 'prefix_config.json',   label: 'prefix' },
    { file: 'bot_mode.json',        label: 'bot_mode' },
    { file: 'bot_settings.json',    label: 'bot_settings' },
    { file: 'last_bot_id.json',     label: 'last_bot_id' },
    { file: 'owner.json',           label: 'owner' },
];

const jsonDataFiles = [
    { file: 'data/autotyping/config.json',    label: 'autotyping' },
    { file: 'data/autorecording/config.json', label: 'autorecording' },
    { file: 'data/groupqueue.json',            label: 'group-queue' },
    { file: 'data/exportqueue.json',           label: 'export-queue' },
];

export default {
    command: ['dbcheck', 'db', 'dbstatus'],
    category: 'owner',
    owner: true,
    desc: 'Show all settings stored in SQLite and JSON fallback files',

    async handler({ sock, jid, m, prefix }) {
        const lines = [];
        const P = prefix || '/';

        // ── DB file info ────────────────────────────────────────────────────────
        let dbSizeLine = '❌ not found';
        try {
            const stat = fs.statSync(DB_PATH);
            dbSizeLine = fmtSize(stat.size);
        } catch {}

        const currentBotId = getConfigBotId?.() || 'unknown';

        lines.push(`*🗄️ SQLite Database Check*`);
        lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━`);
        lines.push(`📁 File: \`data/bot.sqlite\``);
        lines.push(`💾 Size: ${dbSizeLine}`);
        lines.push(`🤖 Bot ID (active): \`${currentBotId}\``);
        lines.push(``);

        // ── bot_configs table ────────────────────────────────────────────────────
        lines.push(`*📋 bot_configs table*`);
        const botConfigs = await readTable('bot_configs');
        if (!botConfigs) {
            lines.push(`  ❌ Could not read table`);
        } else if (botConfigs.length === 0) {
            lines.push(`  _(empty — settings will reset on restart!)_`);
        } else {
            const byBotId = {};
            for (const r of botConfigs) {
                if (!byBotId[r.bot_id]) byBotId[r.bot_id] = [];
                byBotId[r.bot_id].push(r);
            }
            for (const [bid, brows] of Object.entries(byBotId)) {
                lines.push(`  *[bot_id: ${bid}]* (${brows.length} keys)`);
                for (const r of brows) {
                    lines.push(`    • ${r.key}: ${fmtVal(r.value)}`);
                }
            }
        }

        lines.push(``);

        // ── auto_configs table ───────────────────────────────────────────────────
        lines.push(`*⚙️ auto_configs table*`);
        const autoConfigs = await readTable('auto_configs');
        if (!autoConfigs) {
            lines.push(`  ❌ Could not read table`);
        } else if (autoConfigs.length === 0) {
            lines.push(`  _(empty)_`);
        } else {
            for (const r of autoConfigs) {
                lines.push(`  • [${r.bot_id}] ${r.key}: ${fmtVal(r.value)}`);
            }
        }

        lines.push(``);

        // ── JSON fallback files ──────────────────────────────────────────────────
        lines.push(`*📄 JSON fallback files (root)*`);
        for (const { file, label } of jsonFallbacks) {
            try {
                if (fs.existsSync(file)) {
                    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
                    let summary = '';
                    if (label === 'prefix') summary = `prefix="${raw.prefix ?? '?'}"`;
                    else if (label === 'bot_mode') summary = `mode="${raw.mode ?? '?'}"`;
                    else if (label === 'last_bot_id') summary = `id="${raw.botId ?? raw.bot_id ?? raw.id ?? '?'}"`;
                    else if (label === 'owner') summary = `number="${raw.OWNER_NUMBER ?? raw.ownerNumber ?? '?'}"`;
                    else summary = fmtVal(JSON.stringify(raw));
                    lines.push(`  ✅ ${file} → ${summary}`);
                } else {
                    lines.push(`  ❌ ${file} → *MISSING* (will use DB/default)`);
                }
            } catch {
                lines.push(`  ⚠️ ${file} → unreadable`);
            }
        }

        lines.push(``);

        // ── JSON data files (not in DB) ──────────────────────────────────────────
        lines.push(`*📦 JSON-only settings (data/ folder)*`);
        for (const { file, label } of jsonDataFiles) {
            try {
                if (fs.existsSync(file)) {
                    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
                    let summary = '';
                    if (label === 'autotyping') summary = `mode="${raw.mode ?? 'off'}"`;
                    else if (label === 'autorecording') summary = `mode="${raw.mode ?? 'off'}"`;
                    else if (label === 'group-queue') {
                        const q = Array.isArray(raw) ? raw : (raw.queue ?? []);
                        summary = `${q.length} queued group(s)`;
                    } else if (label === 'export-queue') {
                        const q = Array.isArray(raw) ? raw : (raw.queue ?? []);
                        summary = `${q.length} queued export(s)`;
                    } else summary = fmtVal(JSON.stringify(raw));
                    lines.push(`  ✅ ${file} → ${summary}`);
                } else {
                    lines.push(`  ➖ ${file} → not created yet`);
                }
            } catch {
                lines.push(`  ⚠️ ${file} → unreadable`);
            }
        }

        lines.push(``);

        // ── Quick health summary ─────────────────────────────────────────────────
        lines.push(`*🩺 Health Summary*`);

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

        lines.push(`  Prefix in DB    : ${prefixInDb !== null ? `"${prefixInDb}"` : '❌ not found'}`);
        lines.push(`  Prefix in file  : ${prefixInFile !== null ? `"${prefixInFile}"` : '❌ not found'}`);
        lines.push(`  Prefix in memory: ${prefixInMem !== null ? `"${prefixInMem}"` : '❌ not found'}`);

        const allMatch = prefixInDb !== null && prefixInFile !== null && prefixInMem !== null
            && prefixInDb === prefixInFile && prefixInFile === prefixInMem;
        lines.push(`  Status: ${allMatch ? '✅ All in sync' : '⚠️ Mismatch — run ' + P + 'setprefix to re-sync'}`);

        lines.push(``);
        lines.push(`_Use ${P}getsettings for full bot settings overview_`);

        await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: m });
    }
};
