import axios from 'axios';
import { createRequire } from 'module';
import { getFooter } from '../../lib/menuHelper.js';
import { getBotName } from '../../lib/botname.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';

const _require = createRequire(import.meta.url);
let sendInteractiveMessage;
try { ({ sendInteractiveMessage } = _require('gifted-btns')); } catch {}

const API_URL   = 'https://ravenn.site/fifastandings';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
    if (!color)               return '🔴';
    if (color === '#2AD572')  return '🟢';
    if (color === '#FFD908')  return '🟡';
    return '🔴';
}

function pad(str, len) {
    const s = String(str ?? '');
    return s.length >= len ? s.substring(0, len) : s + ' '.repeat(len - s.length);
}

function rpad(num, len) {
    const s = String(num ?? '-');
    return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}

function buildGroup(group) {
    const rows = group.table?.all ?? [];
    const name = group.leagueName.replace('Grp. ', 'Group ');
    let txt = `┌─ ⚽ *${name}*\n`;
    txt += `│  ${pad('Team', 16)} MP  W  D  L  GD  Pts\n`;
    txt += `│  ${'─'.repeat(44)}\n`;
    for (const r of rows) {
        const q = qualEmoji(r.qualColor);
        const gd = r.goalConDiff > 0 ? `+${r.goalConDiff}` : `${r.goalConDiff}`;
        txt += `│ ${q} ${pad(r.shortName || r.name, 14)} ${rpad(r.played,2)} ${rpad(r.wins,2)} ${rpad(r.draws,2)} ${rpad(r.losses,2)} ${rpad(gd,3)}  ${rpad(r.pts,3)}\n`;
    }
    txt += `└${'─'.repeat(46)}`;
    return txt;
}

function parseGroupArg(arg) {
    if (!arg) return null;
    const clean = arg.toLowerCase().replace(/^group\s*/i, '').trim();
    return clean.length === 1 && /[a-l]/.test(clean) ? `Grp. ${clean.toUpperCase()}` : null;
}

// Build the quick_reply buttons for all groups + extras
function buildMenuButtons(PREFIX) {
    const groups = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    const buttons = groups.map(g => ({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: `⚽ Group ${g}`,
            id: `${PREFIX}fifastandings ${g.toLowerCase()}`
        })
    }));
    buttons.push({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: '🥇 Top Scorers',
            id: `${PREFIX}fifastandings scorers`
        })
    });
    buttons.push({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: '🎯 Top Assists',
            id: `${PREFIX}fifastandings assists`
        })
    });
    buttons.push({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: '❓ Help',
            id: `${PREFIX}fifastandings help`
        })
    });
    return buttons;
}

// Plain-text fallback menu (when buttons are off or fail)
function buildMenuText(PREFIX, footer) {
    return (
        `╭─⌈ 🏆 *FIFA WORLD CUP 2026* ⌋\n` +
        `│\n` +
        `├─ 📋 *Group Standings*\n` +
        `│  ⊷ ${PREFIX}fifastandings A  •  ${PREFIX}fifastandings B\n` +
        `│  ⊷ ${PREFIX}fifastandings C  •  ${PREFIX}fifastandings D\n` +
        `│  ⊷ ${PREFIX}fifastandings E  •  ${PREFIX}fifastandings F\n` +
        `│  ⊷ ${PREFIX}fifastandings G  •  ${PREFIX}fifastandings H\n` +
        `│  ⊷ ${PREFIX}fifastandings I  •  ${PREFIX}fifastandings J\n` +
        `│  ⊷ ${PREFIX}fifastandings K  •  ${PREFIX}fifastandings L\n` +
        `│\n` +
        `├─⊷ *${PREFIX}fifastandings scorers* — 🥇 Top Scorers\n` +
        `├─⊷ *${PREFIX}fifastandings assists* — 🎯 Top Assists\n` +
        `├─⊷ *${PREFIX}fifastandings help*    — ❓ Full Guide\n` +
        `│\n` +
        `├─ 🟢 Qualified  🟡 Possible  🔴 Eliminated\n` +
        `╰⊷ ${footer}`
    );
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

        // ── No args → show button menu ────────────────────────────────────────
        if (!sub) {
            if (isButtonModeEnabled() && typeof sendInteractiveMessage === 'function') {
                try {
                    await sendInteractiveMessage(sock, jid, {
                        title:  '🏆 FIFA WORLD CUP 2026',
                        text:
                            `*Select a group to view its standings*\n\n` +
                            `🟢 Qualified  🟡 Possible  🔴 Eliminated\n\n` +
                            `_Groups A – L · Top Scorers · Top Assists_`,
                        footer: `⚽ ${getBotName()} • WC 2026`,
                        interactiveButtons: buildMenuButtons(PREFIX)
                    });
                    return;
                } catch {}
            }
            // Plain-text fallback
            return sock.sendMessage(jid, {
                text: buildMenuText(PREFIX, footer)
            }, { quoted: m });
        }

        // ── Help ──────────────────────────────────────────────────────────────
        if (sub === 'help') {
            const helpText =
                `╭─⌈ 🏆 *FIFA WORLD CUP 2026 — GUIDE* ⌋\n` +
                `│\n` +
                `├─⊷ *${PREFIX}fifastandings*\n` +
                `│  └⊷ Opens the group selection menu\n` +
                `│\n` +
                `├─⊷ *${PREFIX}fifastandings <A–L>*\n` +
                `│  └⊷ View a specific group table\n` +
                `│  └⊷ Example: ${PREFIX}fifastandings a\n` +
                `│\n` +
                `├─⊷ *${PREFIX}fifastandings scorers*\n` +
                `│  └⊷ Top goal scorers\n` +
                `│\n` +
                `├─⊷ *${PREFIX}fifastandings assists*\n` +
                `│  └⊷ Top assist providers\n` +
                `│\n` +
                `├─ 🟢 Qualified to next round\n` +
                `├─ 🟡 Possible qualification\n` +
                `├─ 🔴 Eliminated\n` +
                `│\n` +
                `╰⊷ ${footer}`;

            if (isButtonModeEnabled() && typeof sendInteractiveMessage === 'function') {
                try {
                    await sendInteractiveMessage(sock, jid, {
                        title:  '❓ FIFA Standings — Help',
                        text:   helpText,
                        footer: `⚽ ${getBotName()} • WC 2026`,
                        interactiveButtons: [
                            {
                                name: 'quick_reply',
                                buttonParamsJson: JSON.stringify({
                                    display_text: '⚽ View All Groups',
                                    id: `${PREFIX}fifastandings`
                                })
                            },
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
                                    display_text: '🎯 Top Assists',
                                    id: `${PREFIX}fifastandings assists`
                                })
                            }
                        ]
                    });
                    return;
                } catch {}
            }
            return sock.sendMessage(jid, { text: helpText }, { quoted: m });
        }

        // ── From here on all paths fetch from API ─────────────────────────────
        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        try {
            const data   = await fetchStandings();
            const tables = data.table?.[0]?.data?.tables ?? [];

            // ── Top Scorers ───────────────────────────────────────────────────
            if (['scorers', 'topscorers', 'goals'].includes(sub)) {
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

                if (isButtonModeEnabled() && typeof sendInteractiveMessage === 'function') {
                    try {
                        await sendInteractiveMessage(sock, jid, {
                            title:  '🥇 Top Scorers — WC 2026',
                            text:   txt,
                            footer: `⚽ ${getBotName()} • WC 2026`,
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
            if (['assists', 'assist'].includes(sub)) {
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

                if (isButtonModeEnabled() && typeof sendInteractiveMessage === 'function') {
                    try {
                        await sendInteractiveMessage(sock, jid, {
                            title:  '🎯 Top Assists — WC 2026',
                            text:   txt,
                            footer: `⚽ ${getBotName()} • WC 2026`,
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
                        text: `❌ Group *${groupKey}* not found.\n\nAvailable groups: A – L`
                    }, { quoted: m });
                }

                const groupLetter = groupKey.replace('Grp. ', '');
                const allLetters  = ['A','B','C','D','E','F','G','H','I','J','K','L'];
                const currIdx     = allLetters.indexOf(groupLetter);
                const prevLetter  = allLetters[currIdx - 1];
                const nextLetter  = allLetters[currIdx + 1];

                let groupText =
                    `🏆 *FIFA WORLD CUP 2026*\n` +
                    `${'─'.repeat(30)}\n` +
                    `${buildGroup(group)}\n\n` +
                    `🟢 Qualified  🟡 Possible  🔴 Eliminated\n\n` +
                    `${footer}`;

                if (isButtonModeEnabled() && typeof sendInteractiveMessage === 'function') {
                    try {
                        const navButtons = [];
                        if (prevLetter) navButtons.push({
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: `◀ Group ${prevLetter}`,
                                id: `${PREFIX}fifastandings ${prevLetter.toLowerCase()}`
                            })
                        });
                        if (nextLetter) navButtons.push({
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: `Group ${nextLetter} ▶`,
                                id: `${PREFIX}fifastandings ${nextLetter.toLowerCase()}`
                            })
                        });
                        navButtons.push({
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📋 All Groups',
                                id: `${PREFIX}fifastandings`
                            })
                        });

                        await sendInteractiveMessage(sock, jid, {
                            title:  `⚽ Group ${groupLetter} — WC 2026`,
                            text:   groupText,
                            footer: `⚽ ${getBotName()} • WC 2026`,
                            interactiveButtons: navButtons
                        });
                        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                        return;
                    } catch {}
                }

                await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                return sock.sendMessage(jid, { text: groupText }, { quoted: m });
            }

            // ── Unknown sub-command → redirect to menu ────────────────────────
            await sock.sendMessage(jid, { react: { text: '❓', key: m.key } });
            return sock.sendMessage(jid, {
                text: buildMenuText(PREFIX, footer)
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
