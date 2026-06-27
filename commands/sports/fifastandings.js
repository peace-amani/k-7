import axios from 'axios';
import { getFooter } from '../../lib/menuHelper.js';

const API_URL   = 'https://ravenn.site/fifastandings';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let _cache = null;
let _cacheAt = 0;

async function fetchStandings() {
    if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;
    const res = await axios.get(API_URL, { timeout: 20000 });
    if (!res.data?.status) throw new Error('API returned failure status');
    _cache  = res.data.result;
    _cacheAt = Date.now();
    return _cache;
}

// Map qualColor → emoji indicator
function qualEmoji(color) {
    if (!color) return '🔴';
    if (color === '#2AD572') return '🟢';
    if (color === '#FFD908') return '🟡';
    return '🔴';
}

// Pad a string to fixed width (left-align)
function pad(str, len) {
    const s = String(str ?? '');
    return s.length >= len ? s.substring(0, len) : s + ' '.repeat(len - s.length);
}

// Pad a number right-align
function rpad(num, len) {
    const s = String(num ?? '-');
    return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}

// Build one group block
function buildGroup(group) {
    const rows = group.table?.all ?? [];
    const name = group.leagueName.replace('Grp. ', 'Group ');
    let txt = `┌─ ⚽ *${name}*\n`;
    txt += `│  ${pad('Team', 16)} MP  W  D  L  GD  Pts\n`;
    txt += `│  ${'─'.repeat(44)}\n`;
    for (const r of rows) {
        const q = qualEmoji(r.qualColor);
        txt += `│ ${q} ${pad(r.shortName || r.name, 14)} ${rpad(r.played,2)} ${rpad(r.wins,2)} ${rpad(r.draws,2)} ${rpad(r.losses,2)} ${rpad(r.goalConDiff > 0 ? '+'+r.goalConDiff : r.goalConDiff, 3)}  ${rpad(r.pts,3)}\n`;
    }
    txt += `└${'─'.repeat(46)}`;
    return txt;
}

// Parse group letter arg: "a" → "Grp. A", also accept "groupa", "group a"
function parseGroupArg(arg) {
    const clean = arg.toLowerCase().replace(/^group\s*/i, '').trim();
    return clean.length === 1 && /[a-l]/.test(clean) ? `Grp. ${clean.toUpperCase()}` : null;
}

export default {
    name: 'fifastandings',
    aliases: ['fifa', 'wcstandings', 'worldcupstandings', 'fifawc', 'wc2026'],
    category: 'Sports',
    description: 'FIFA World Cup 2026 group standings, top scorers & assists',

    async execute(sock, m, args, PREFIX) {
        const jid = m.key.remoteJid;
        const sub = (args[0] || '').toLowerCase();

        // ── Help ─────────────────────────────────────────────────────────────
        if (sub === 'help') {
            return sock.sendMessage(jid, {
                text:
                    `╭─⌈ 🏆 *FIFA WORLD CUP 2026* ⌋\n` +
                    `│\n` +
                    `├─⊷ *${PREFIX}fifastandings*\n` +
                    `│  └⊷ All group standings\n` +
                    `├─⊷ *${PREFIX}fifastandings <A–L>*\n` +
                    `│  └⊷ Specific group (e.g. ${PREFIX}fifastandings a)\n` +
                    `├─⊷ *${PREFIX}fifastandings scorers*\n` +
                    `│  └⊷ Top goal scorers\n` +
                    `├─⊷ *${PREFIX}fifastandings assists*\n` +
                    `│  └⊷ Top assist providers\n` +
                    `│\n` +
                    `├─ 🟢 Qualified  🟡 Possible  🔴 Eliminated\n` +
                    `╰⊷ ${getFooter(m.key.participant || jid)}`
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            const data = await fetchStandings();
            const tables = data.table?.[0]?.data?.tables ?? [];

            // ── Top Scorers ───────────────────────────────────────────────────
            if (sub === 'scorers' || sub === 'topscorers' || sub === 'goals') {
                const players = data.overview?.topPlayers?.byRating?.players ?? [];
                const scorers = data.overview?.topPlayers?.byGoals?.players ?? [];

                let txt = `╭─⌈ 🥇 *FIFA WC 2026 — TOP SCORERS* ⌋\n│\n`;
                if (!scorers.length) {
                    txt += `├─⊷ No data available yet\n`;
                } else {
                    scorers.forEach((p, i) => {
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                        txt += `├─⊷ ${medal} *${p.name}*\n`;
                        txt += `│     🏳️ ${p.teamName}  ⚽ *${p.goals} goal${p.goals !== 1 ? 's' : ''}*\n`;
                    });
                }
                txt += `│\n╰⊷ ${getFooter(m.key.participant || jid)}`;

                await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                return sock.sendMessage(jid, { text: txt }, { quoted: m });
            }

            // ── Top Assists ───────────────────────────────────────────────────
            if (sub === 'assists' || sub === 'assist') {
                const assists = data.overview?.topPlayers?.byAssists?.players ?? [];

                let txt = `╭─⌈ 🎯 *FIFA WC 2026 — TOP ASSISTS* ⌋\n│\n`;
                if (!assists.length) {
                    txt += `├─⊷ No data available yet\n`;
                } else {
                    assists.forEach((p, i) => {
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                        txt += `├─⊷ ${medal} *${p.name}*\n`;
                        txt += `│     🏳️ ${p.teamName}  🎯 *${p.assists} assist${p.assists !== 1 ? 's' : ''}*\n`;
                    });
                }
                txt += `│\n╰⊷ ${getFooter(m.key.participant || jid)}`;

                await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                return sock.sendMessage(jid, { text: txt }, { quoted: m });
            }

            // ── Single Group ──────────────────────────────────────────────────
            const groupKey = parseGroupArg(sub);
            if (groupKey) {
                const group = tables.find(t => t.leagueName === groupKey);
                if (!group) {
                    await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                    return sock.sendMessage(jid, {
                        text: `❌ Group *${groupKey}* not found.\n\nAvailable groups: A – L`
                    }, { quoted: m });
                }

                const rows = group.table?.all ?? [];
                let txt = `🏆 *FIFA WORLD CUP 2026*\n`;
                txt += `${'─'.repeat(30)}\n`;
                txt += `${buildGroup(group)}\n\n`;
                txt += `🟢 Qualified  🟡 Possible  🔴 Eliminated\n`;
                txt += `\n${getFooter(m.key.participant || jid)}`;

                await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                return sock.sendMessage(jid, { text: txt }, { quoted: m });
            }

            // ── All Groups (default) ──────────────────────────────────────────
            // Filter out "Best 3rd placed teams" for the overview, show it at end
            const mainGroups  = tables.filter(t => /^Grp\. [A-L]$/.test(t.leagueName));
            const thirdPlaced = tables.find(t => t.leagueName.toLowerCase().includes('3rd') || t.leagueName.toLowerCase().includes('best'));

            // Split into two messages to keep each under WhatsApp's 65k char limit
            const mid   = Math.ceil(mainGroups.length / 2);
            const half1 = mainGroups.slice(0, mid);
            const half2 = mainGroups.slice(mid);

            const header =
                `🏆 *FIFA WORLD CUP 2026 — GROUP STANDINGS*\n` +
                `🟢 Qualified  🟡 Possible  🔴 Eliminated\n` +
                `${'─'.repeat(46)}\n\n`;

            const footer = `\n${getFooter(m.key.participant || jid)}`;

            const msg1 = header + half1.map(buildGroup).join('\n\n');
            let   msg2 = half2.map(buildGroup).join('\n\n');

            // Append Best 3rd placed if available and has data
            if (thirdPlaced && (thirdPlaced.table?.all?.length ?? 0) > 0) {
                msg2 += '\n\n' + buildGroup(thirdPlaced);
            }

            msg2 += footer;

            await sock.sendMessage(jid, { text: msg1 }, { quoted: m });
            await sock.sendMessage(jid, { text: msg2 });
            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

        } catch (err) {
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            const reason = err.response?.status
                ? `API error (HTTP ${err.response.status})`
                : err.message || 'Unknown error';
            await sock.sendMessage(jid, {
                text: `❌ *Failed to fetch FIFA standings*\n\n⚠️ ${reason}\n\n💡 Try again in a moment.`
            }, { quoted: m });
        }
    }
};
