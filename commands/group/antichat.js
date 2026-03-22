import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOwnerName } from '../../lib/menuHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configFile = path.join(__dirname, '../../data/antichat/config.json');

function ensureDir() {
    const dir = path.dirname(configFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadConfig() {
    try {
        if (fs.existsSync(configFile)) {
            return JSON.parse(fs.readFileSync(configFile, 'utf8'));
        }
    } catch {}
    return {};
}

function saveConfig(data) {
    ensureDir();
    fs.writeFileSync(configFile, JSON.stringify(data, null, 2));
}

function cleanJid(jid) {
    if (!jid) return jid;
    const clean = jid.split(':')[0];
    return clean.includes('@') ? clean : clean + '@s.whatsapp.net';
}

export function isAntiChatEnabled(groupJid) {
    return loadConfig()[groupJid]?.enabled || false;
}

function getAction(groupJid) {
    return loadConfig()[groupJid]?.action || 'delete';
}

function isRestricted(groupJid, userJid) {
    const restricted = loadConfig()[groupJid]?.restricted || [];
    const cleanUser = cleanJid(userJid);
    return restricted.some(u => cleanJid(u) === cleanUser);
}

// ── Auto-enforcement handler (wired in index.js) ─────────────────────────────
export async function handleAntiChat(sock, msg) {
    try {
        if (!msg.message || msg.key?.fromMe) return;

        const chatJid = msg.key.remoteJid;
        if (!chatJid?.endsWith('@g.us')) return;
        if (!isAntiChatEnabled(chatJid)) return;

        const senderJid = cleanJid(msg.key.participant || chatJid);
        if (!isRestricted(chatJid, senderJid)) return;

        const userName = senderJid.split('@')[0];
        const action   = getAction(chatJid);

        // Always delete the message first
        try { await sock.sendMessage(chatJid, { delete: msg.key }); } catch {}

        switch (action) {
            case 'delete': {
                await sock.sendMessage(chatJid, {
                    text: `🚫 @${userName} is restricted from chatting in this group.`,
                    mentions: [senderJid]
                });
                break;
            }
            case 'warn': {
                await sock.sendMessage(chatJid, {
                    text: `⚠️ *Warning:* @${userName}, you are restricted from chatting here. Continued violations may result in removal.`,
                    mentions: [senderJid]
                });
                break;
            }
            case 'kick': {
                try {
                    await sock.sendMessage(chatJid, {
                        text: `🚨 @${userName} has been removed — restricted from chatting in this group.`,
                        mentions: [senderJid]
                    });
                    await sock.groupParticipantsUpdate(chatJid, [senderJid], 'remove');
                } catch {
                    await sock.sendMessage(chatJid, {
                        text: `❌ Failed to remove @${userName}. Make sure I have admin permissions.`,
                        mentions: [senderJid]
                    });
                }
                break;
            }
        }
    } catch (err) {
        console.error('[ANTICHAT] Handler error:', err.message);
    }
}

// ── Command ──────────────────────────────────────────────────────────────────
export default {
    name:        'antichat',
    alias:       ['nochat', 'chatblock', 'restrictchat'],
    description: 'Restrict specific users from chatting in the group — delete, warn, or kick',
    category:    'group',
    groupOnly:   true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const owner  = getOwnerName().toUpperCase();
        const { jidManager } = extra;

        const groupMeta = await sock.groupMetadata(chatId);
        const sender    = cleanJid(msg.key.participant || chatId);
        const member    = groupMeta.participants.find(p => cleanJid(p.id) === sender);
        const isAdmin   = member?.admin === 'admin' || member?.admin === 'superadmin';

        if (!isAdmin && !jidManager.isOwner(msg)) {
            return sock.sendMessage(chatId, {
                text: '❌ *Admin Only Command*'
            }, { quoted: msg });
        }

        const config = loadConfig();
        const sub    = (args[0] || '').toLowerCase();

        // ── Default: brief menu ───────────────────────────────────────────────
        if (!sub) {
            const gc     = config[chatId];
            const status = gc?.enabled ? `✅ ON (${gc.action?.toUpperCase()})` : '❌ OFF';
            return sock.sendMessage(chatId, {
                text:
                    `╭─⌈ 💬 *ANTI-CHAT* ⌋\n` +
                    `├⊷ Status: ${status}\n` +
                    `\n` +
                    `├⊷ antichat on\n` +
                    `├⊷ antichat off\n` +
                    `├⊷ antichat action delete/warn/kick\n` +
                    `├⊷ antichat restrict @user\n` +
                    `├⊷ antichat unrestrict @user\n` +
                    `├⊷ antichat list\n` +
                    `╰⊷ *Powered by ${owner} TECH*`
            }, { quoted: msg });
        }

        if (sub === 'on' || sub === 'enable') {
            config[chatId] = {
                ...config[chatId],
                enabled:    true,
                action:     config[chatId]?.action || 'delete',
                restricted: config[chatId]?.restricted || []
            };
            saveConfig(config);
            return sock.sendMessage(chatId, {
                text: `✅ *Anti-Chat ON* — Action: *${config[chatId].action.toUpperCase()}*`
            }, { quoted: msg });
        }

        if (sub === 'off' || sub === 'disable') {
            config[chatId] = { ...config[chatId], enabled: false };
            saveConfig(config);
            return sock.sendMessage(chatId, {
                text: '❌ *Anti-Chat OFF*'
            }, { quoted: msg });
        }

        if (sub === 'action') {
            const action = args[1]?.toLowerCase();
            if (!['delete', 'warn', 'kick'].includes(action)) {
                return sock.sendMessage(chatId, {
                    text: `❌ Specify action: *delete*, *warn*, or *kick*\nExample: ${PREFIX}antichat action warn`
                }, { quoted: msg });
            }
            config[chatId] = { ...config[chatId], action };
            saveConfig(config);
            return sock.sendMessage(chatId, {
                text: `✅ *Action set to: ${action.toUpperCase()}*`
            }, { quoted: msg });
        }

        if (sub === 'restrict') {
            const mentioned  = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            const quoted     = msg.message?.extendedTextMessage?.contextInfo?.participant;
            const target     = cleanJid(quoted || mentioned);

            if (!target) {
                return sock.sendMessage(chatId, {
                    text: `❌ Tag or reply to a user.\nExample: ${PREFIX}antichat restrict @user`
                }, { quoted: msg });
            }

            if (!config[chatId]) config[chatId] = { enabled: true, action: 'delete', restricted: [] };
            if (!config[chatId].restricted) config[chatId].restricted = [];

            if (config[chatId].restricted.some(u => cleanJid(u) === target)) {
                return sock.sendMessage(chatId, {
                    text: `⚠️ @${target.split('@')[0]} is already restricted.`,
                    mentions: [target]
                }, { quoted: msg });
            }

            config[chatId].restricted.push(target);
            saveConfig(config);
            return sock.sendMessage(chatId, {
                text: `🚫 @${target.split('@')[0]} restricted from chatting.`,
                mentions: [target]
            }, { quoted: msg });
        }

        if (sub === 'unrestrict') {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            const quoted    = msg.message?.extendedTextMessage?.contextInfo?.participant;
            const target    = cleanJid(quoted || mentioned);

            if (!target) {
                return sock.sendMessage(chatId, {
                    text: `❌ Tag or reply to a user.\nExample: ${PREFIX}antichat unrestrict @user`
                }, { quoted: msg });
            }

            if (!config[chatId]?.restricted?.length) {
                return sock.sendMessage(chatId, { text: '⚠️ No restricted users in this group.' }, { quoted: msg });
            }

            config[chatId].restricted = config[chatId].restricted.filter(u => cleanJid(u) !== target);
            saveConfig(config);
            return sock.sendMessage(chatId, {
                text: `✅ @${target.split('@')[0]} can chat again.`,
                mentions: [target]
            }, { quoted: msg });
        }

        if (sub === 'list') {
            const restricted = config[chatId]?.restricted || [];
            if (restricted.length === 0) {
                return sock.sendMessage(chatId, { text: '📋 No restricted users in this group.' }, { quoted: msg });
            }
            const lines = restricted.map((jid, i) => `${i + 1}. @${jid.split('@')[0]}`).join('\n');
            return sock.sendMessage(chatId, {
                text: `📋 *Restricted Users:*\n\n${lines}`,
                mentions: restricted
            }, { quoted: msg });
        }

        return sock.sendMessage(chatId, {
            text: `❌ Unknown option. Use \`${PREFIX}antichat\` to see available commands.`
        }, { quoted: msg });
    }
};
