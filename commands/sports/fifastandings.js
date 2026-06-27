import axios from 'axios';
import { createRequire } from 'module';
import { getFooter } from '../../lib/menuHelper.js';
import { getBotName } from '../../lib/botname.js';

const _require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = _require('gifted-btns'); } catch {}

const API_URL   = 'https://ravenn.site/fifastandings';
const CACHE_TTL = 5 * 60 * 1000;

let _cache   = null;
let _cacheAt = 0;

async function fetchStandings() {
    if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;
    const res = await axios.get(API_URL, { timeout: 20000 });
    if (!res.data?.status) throw new Error('API returned failure status');
    _cache   = res.data.result;
    _cacheAt = Date.now();
    return _cache;
}

function qualEmoji(color) {
    if (!color)              return '🔴';
    if (color === '#2AD572') return '🟢';
    if (color === '#FFD908') return '🟡';
    return '🔴';
}

const POS_ICON = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];

function buildGroup(group) {
    const rows = group.table?.all ?? [];
    const name = group.leagueName.replace('Grp. ', 'Group ');
    let txt = `╭─ ⚽ *${name}*\n│\n`;
    rows.forEach((r, i) => {
        const q   = qualEmoji(r.qualColor);
        const pos = POS_ICON[i] ?? `${i + 1}.`;
        const gd  = r.goalConDiff > 0 ? `+${r.goalConDiff}` : `${r.goalConDiff}`;
        const rec = `${r.wins}W ${r.draws}D ${r.losses}L`;
        txt += `│ ${pos} ${q} *${r.shortName || r.name}*\n`;
        txt += `│    🏅 *${r.pts}pts*  ·  ${rec}  ·  GD ${gd}\n`;
    });
    txt += `╰${'─'.repeat(24)}`;
    return txt;
}

function parseGroupArg(arg) {
    if (!arg) return null;
    const clean = arg.toLowerCase().replace(/^group\s*/i, '').trim();
    return clean.length === 1 && /[a-l]/.test(clean) ? `Grp. ${clean.toUpperCase()}` : null;
}

export default {
    name: 'fifastandings',
    aliases: ['fifa', 'wcstandings', 'worldcupstandings', 'fifawc', 'wc2026'],
    category: 'Sports',
    description: 'FIFA World Cup 2026 group standings, top scorers & assists',

    async execute(sock, m, args, PREFIX) {
        const jid    = m.key.remoteJid;
        const sub    = (args[0] || '').toLowerCase();
        const footer = getFooter(m.key.participant || jid);
        const bot    = getBotName();

        // ── No args → show button menu ────────────────────────────────────────
        if (!sub) {
            if (giftedBtns?.sendInteractiveMessage) {
                try {
                    await giftedBtns.sendInteractiveMessage(sock, jid, {
                        text:
                            `🏆 *FIFA WORLD CUP 2026*\n\n` +
                            `Tap *Select Group* to pick a group and view its standings.\n\n` +
                            `🟢 Qualified  🟡 Possible  🔴 Eliminated`,
                        footer: `⚽ ${bot} • WC 2026`,
                        interactiveButtons: [
                            {
                                name: 'single_select',
                                buttonParamsJson: JSON.stringify({
                                    title: '⚽ Select Group',
                                    sections: [
                                        {
                                            title: '📋 Group Standings (A – F)',
                                            rows: ['A','B','C','D','E','F'].map(g => ({
                                                id:          `${PREFIX}fifastandings ${g.toLowerCase()}`,
                                                title:       `⚽ Group ${g}`,
                                                description: `View Group ${g} standings`
                                            }))
                                        },
                                        {
                                            title: '📋 Group Standings (G – L)',
                                            rows: ['G','H','I','J','K','L'].map(g => ({
                                                id:          `${PREFIX}fifastandings ${g.toLowerCase()}`,
                                                title:       `⚽ Group ${g}`,
                                                description: `View Group ${g} standings`
                                            }))
                                        },
                                        {
                                            title: '📊 Stats & Info',
                                            rows: [
                                                {
                                                    id:          `${PREFIX}fifastandings scorers`,
                                                    title:       '🥇 Top Scorers',
                                                    description: 'Top goal scorers'
                                                },
                                                {
                                                    id:          `${PREFIX}fifastandings assists`,
                                                    title:       '🎯 Top Assists',
                                                    description: 'Top assist providers'
                                                },
                                                {
                                                    id:          `${PREFIX}fifastandings help`,
                                                    title:       '❓ Help',
                                                    description: 'How to use this command'
                                                }
                                            ]
                                        }
                                    ]
                                })
                            }
                        ]
                    });
                    return;
                } catch (err) {
                    console.log('[FIFA] Button send failed:', err.message);
                }
            }

            // Plain-text fallback
            return sock.sendMessage(jid, {
                text:
                    `╭─⌈ 🏆 *FIFA WORLD CUP 2026* ⌋\n│\n` +
                    `├─ 📋 *Group Standings*\n` +
                    `│  ⊷ ${PREFIX}fifastandings A  •  ${PREFIX}fifastandings B\n` +
                    `│  ⊷ ${PREFIX}fifastandings C  •  ${PREFIX}fifastandings D\n` +
                    `│  ⊷ ${PREFIX}fifastandings E  •  ${PREFIX}fifastandings F\n` +
                    `│  ⊷ ${PREFIX}fifastandings G  •  ${PREFIX}fifastandings H\n` +
                    `│  ⊷ ${PREFIX}fifastandings I  •  ${PREFIX}fifastandings J\n` +
                    `│  ⊷ ${PREFIX}fifastandings K  •  ${PREFIX}fifastandings L\n│\n` +
                    `├─⊷ *${PREFIX}fifastandings scorers* — 🥇 Top Scorers\n` +
                    `├─⊷ *${PREFIX}fifastandings assists* — 🎯 Top Assists\n` +
                    `├─⊷ *${PREFIX}fifastandings help*    — ❓ Full Guide\n│\n` +
                    `├─ 🟢 Qualified  🟡 Possible  🔴 Eliminated\n` +
                    `╰⊷ ${footer}`
            }, { quoted: m });
        }

        // ── Help ──────────────────────────────────────────────────────────────
        if (sub === 'help') {
            const helpText =
                `╭─⌈ 🏆 *FIFA WC 2026 — GUIDE* ⌋\n│\n` +
                `├─⊷ *${PREFIX}fifastandings*\n` +
                `│  └⊷ Opens the group selection menu\n│\n` +
                `├─⊷ *${PREFIX}fifastandings <A–L>*\n` +
                `│  └⊷ Specific group table\n` +
                `│  └⊷ e.g. ${PREFIX}fifastandings a\n│\n` +
                `├─⊷ *${PREFIX}fifastandings scorers*\n` +
                `│  └⊷ Top goal scorers\n│\n` +
                `├─⊷ *${PREFIX}fifastandings assists*\n` +
                `│  └⊷ Top assist providers\n│\n` +
                `├─ 🟢 Qualified  🟡 Possible  🔴 Eliminated\n` +
                `╰⊷ ${footer}`;

            if (giftedBtns?.sendInteractiveMessage) {
                try {
                    await giftedBtns.sendInteractiveMessage(sock, jid, {
                        text:   helpText,
                        footer: `⚽ ${bot} • WC 2026`,
                        interactiveButtons: [
                            {
                                name: 'quick_reply',
                                buttonParamsJson: JSON.stringify({
                                    display_text: '⚽ Group Menu',
                                    id: `${PREFIX}fifastandings`
                                })
                            },
                            {
                                name: 'quick_reply',
                                buttonParamsJson: JSON.stringify({
                                    display_text: '🥇 Top Scorers',
                                    id: `${PREFIX}fifastandings scorers`
                                })
                            }
                        ]
                    });
                    return;
                } catch {}
            }
            return sock.sendMessage(jid, { text: helpText }, { quoted: m });
        }

        // ── From here all paths fetch from API ────────────────────────────────
        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            const data   = await fetchStandings();
            const tables = data.table?.[0]?.data?.tables ?? [];

            // ── Top Scorers ───────────────────────────────────────────────────
            if (['scorers','topscorers','goals'].includes(sub)) {
                const scorers = data.overview?.topPlayers?.byGoals?.players ?? [];

                let txt = `╭─⌈ 🥇 *FIFA WC 2026 — TOP SCORERS* ⌋\n│\n`;
                if (!scorers.length) {
                    txt += `├─⊷ No data available yet\n`;
                } else {
                    scorers.forEach((p, i) => {
                        const medal = ['🥇','🥈','🥉'][i] ?? `${i+1}.`;
                        txt += `├─⊷ ${medal} *${p.name}*\n`;
                        txt += `│     🏳️ ${p.teamName}  ⚽ *${p.goals} goal${p.goals !== 1 ? 's' : ''}*\n`;
                    });
                }
                txt += `│\n╰⊷ ${footer}`;

                if (giftedBtns?.sendInteractiveMessage) {
                    try {
                        await giftedBtns.sendInteractiveMessage(sock, jid, {
                            text:   txt,
                            footer: `⚽ ${bot} • WC 2026`,
                            interactiveButtons: [
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '🎯 Top Assists',
                                        id: `${PREFIX}fifastandings assists`
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '⚽ Group Menu',
                                        id: `${PREFIX}fifastandings`
                                    })
                                }
                            ]
                        });
                        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                        return;
                    } catch {}
                }
                await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                return sock.sendMessage(jid, { text: txt }, { quoted: m });
            }

            // ── Top Assists ───────────────────────────────────────────────────
            if (['assists','assist'].includes(sub)) {
                const assists = data.overview?.topPlayers?.byAssists?.players ?? [];

                let txt = `╭─⌈ 🎯 *FIFA WC 2026 — TOP ASSISTS* ⌋\n│\n`;
                if (!assists.length) {
                    txt += `├─⊷ No data available yet\n`;
                } else {
                    assists.forEach((p, i) => {
                        const medal = ['🥇','🥈','🥉'][i] ?? `${i+1}.`;
                        txt += `├─⊷ ${medal} *${p.name}*\n`;
                        txt += `│     🏳️ ${p.teamName}  🎯 *${p.assists} assist${p.assists !== 1 ? 's' : ''}*\n`;
                    });
                }
                txt += `│\n╰⊷ ${footer}`;

                if (giftedBtns?.sendInteractiveMessage) {
                    try {
                        await giftedBtns.sendInteractiveMessage(sock, jid, {
                            text:   txt,
                            footer: `⚽ ${bot} • WC 2026`,
                            interactiveButtons: [
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '🥇 Top Scorers',
                                        id: `${PREFIX}fifastandings scorers`
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '⚽ Group Menu',
                                        id: `${PREFIX}fifastandings`
                                    })
                                }
                            ]
                        });
                        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                        return;
                    } catch {}
                }
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
                        text: `❌ Group *${groupKey}* not found.\n\nAvailable: A – L`
                    }, { quoted: m });
                }

                const letter   = groupKey.replace('Grp. ', '');
                const allLetters = ['A','B','C','D','E','F','G','H','I','J','K','L'];
                const idx      = allLetters.indexOf(letter);
                const prev     = allLetters[idx - 1];
                const next     = allLetters[idx + 1];

                const groupText =
                    `🏆 *FIFA WORLD CUP 2026*\n` +
                    `${'─'.repeat(30)}\n` +
                    `${buildGroup(group)}\n\n` +
                    `🟢 Qualified  🟡 Possible  🔴 Eliminated\n\n` +
                    `${footer}`;

                if (giftedBtns?.sendInteractiveMessage) {
                    try {
                        const navBtns = [];
                        if (prev) navBtns.push({
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: `◀ Group ${prev}`,
                                id: `${PREFIX}fifastandings ${prev.toLowerCase()}`
                            })
                        });
                        if (next) navBtns.push({
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: `Group ${next} ▶`,
                                id: `${PREFIX}fifastandings ${next.toLowerCase()}`
                            })
                        });
                        navBtns.push({
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📋 All Groups',
                                id: `${PREFIX}fifastandings`
                            })
                        });

                        await giftedBtns.sendInteractiveMessage(sock, jid, {
                            text:   groupText,
                            footer: `⚽ ${bot} • WC 2026`,
                            interactiveButtons: navBtns
                        });
                        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                        return;
                    } catch {}
                }

                await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                return sock.sendMessage(jid, { text: groupText }, { quoted: m });
            }

            // ── Unknown arg → redirect to menu ────────────────────────────────
            await sock.sendMessage(jid, { react: { text: '❓', key: m.key } });
            return sock.sendMessage(jid, {
                text:
                    `❓ Unknown option *"${args[0]}"*\n\n` +
                    `Type *${PREFIX}fifastandings* for the group selector menu.`
            }, { quoted: m });

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
