import fs from 'fs';
import path from 'path';
import { getOwnerName } from '../../lib/menuHelper.js';
import { resolveJid } from '../tools/getjid.js';

const DATA_DIR = './data/antistatusmention';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) return {};
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveConfig(data) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[ANTISTATUSMENTION] Save error:', err.message);
    }
}

function cleanJid(jid) {
    if (!jid) return jid;
    const clean = jid.split(':')[0];
    return clean.includes('@') ? clean : clean + '@s.whatsapp.net';
}

// Find a participant accounting for LID ↔ phone JID mismatch.
// Status messages arrive with phone JIDs but group metadata may store LIDs.
function findParticipant(participants, senderJid) {
    const clean = cleanJid(senderJid);
    // 1. Exact match (most common case)
    const direct = participants.find(p => cleanJid(p.id) === clean);
    if (direct) return direct;
    // 2. Numeric-part match — covers @s.whatsapp.net vs device-qualified JIDs
    const senderNum = clean.split('@')[0];
    for (const p of participants) {
        const pNum = p.id.split(':')[0].split('@')[0];
        if (pNum === senderNum) return p;
    }
    // 3. LID ↔ phone cross-resolution via globalThis cache
    const lidPhoneCache = globalThis.lidPhoneCache;
    const phoneLidCache = globalThis.phoneLidCache;
    if (lidPhoneCache || phoneLidCache) {
        for (const p of participants) {
            const pClean = cleanJid(p.id);
            if (pClean.endsWith('@lid') && lidPhoneCache) {
                // participant is a LID — resolve to phone and compare
                const phone = lidPhoneCache.get(pClean.split('@')[0]);
                if (phone && phone === senderNum) return p;
            } else if (phoneLidCache && !pClean.endsWith('@lid')) {
                // participant is a phone JID — check if sender's phone maps to a LID we hold
                const lid = phoneLidCache.get(senderNum);
                if (lid && (pClean.split('@')[0] === lid)) return p;
            }
        }
    }
    return null;
}

// Resolve a participant to a kickable @s.whatsapp.net JID using the full
// 3-layer resolution (Baileys lidMapping → globalThis cache → contact store).
// Tries participant.id first, then falls back to cleanSender.
async function resolveKickJid(sock, participant, cleanSender) {
    // 1. Try participant.id (may be LID, device-qualified, or clean)
    if (participant?.id) {
        const resolved = await resolveJid(sock, participant.id);
        if (resolved && !resolved.endsWith('@lid')) return resolved;
    }
    // 2. Fall back to cleanSender (phone JID from message key)
    if (cleanSender) {
        const resolved = await resolveJid(sock, cleanSender);
        if (resolved && !resolved.endsWith('@lid')) return resolved;
    }
    return null; // truly unresolvable
}

export function getAntiStatusMentionConfig(groupId) {
    const config = loadConfig();
    return config[groupId] || null;
}

const _processedMentionIds = new Map();
const DEDUP_TTL = 60000;

function isDuplicate(msgId) {
    if (!msgId) return false;
    const now = Date.now();
    if (_processedMentionIds.has(msgId)) return true;
    _processedMentionIds.set(msgId, now);
    if (_processedMentionIds.size > 200) {
        for (const [id, ts] of _processedMentionIds) {
            if (now - ts > DEDUP_TTL) _processedMentionIds.delete(id);
        }
    }
    return false;
}

export async function handleStatusMention(sock, msg) {
    try {
        const message = msg.message;
        if (!message) return;

        const msgId = msg.key?.id;
        if (isDuplicate(msgId)) return;

        const msgKeys = Object.keys(message).filter(k => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage');

        if (message.groupStatusMentionMessage) {
            const gsmMsg = message.groupStatusMentionMessage;
            const groupId = gsmMsg?.groupJid || gsmMsg?.message?.groupJid || msg.key?.remoteJid;

            const senderJid = msg.key?.participant || msg.key?.remoteJid;
            const cleanSender = cleanJid(senderJid);
            const userName = cleanSender?.split('@')[0] || 'unknown';

            console.log(`⚠️ [GSM] groupStatusMentionMessage DETECTED!`);
            console.log(`⚠️ [GSM]    ├─ Group: ${groupId}`);
            console.log(`⚠️ [GSM]    ├─ Sender: ${userName}`);
            console.log(`⚠️ [GSM]    ├─ remoteJid: ${msg.key?.remoteJid}`);
            console.log(`⚠️ [GSM]    ├─ Message keys: ${msgKeys.join(', ')}`);
            console.log(`⚠️ [GSM]    └─ GSM data: ${JSON.stringify(gsmMsg).substring(0, 300)}`);

            if (groupId?.endsWith('@g.us')) {
                await processGroupMention(sock, groupId, cleanSender, userName, msg);
            } else {
                console.log(`⚠️ [GSM] No @g.us group found in GSM payload, logging only`);
            }
            return;
        }

        const senderJid = msg.key?.participant || msg.key?.remoteJid;
        const cleanSender = cleanJid(senderJid);
        const userName = cleanSender?.split('@')[0] || 'unknown';

        let mentionedGroups = [];

        for (const key of msgKeys) {
            const val = message[key];
            if (!val || typeof val !== 'object') continue;

            if (key === 'groupMentionedMessage' || key === 'statusMentionMessage') {
                const gjid = val.groupJid || val.jid;
                if (gjid?.endsWith('@g.us') && !mentionedGroups.includes(gjid)) {
                    mentionedGroups.push(gjid);
                    console.log(`⚠️ [GSM] ${key} detected! Group: ${gjid} | Sender: ${userName}`);
                }
            }

            if (val?.contextInfo) {
                const ctx = val.contextInfo;

                if (ctx.mentionedJid?.length) {
                    const groups = ctx.mentionedJid.filter(jid => jid?.endsWith('@g.us'));
                    for (const g of groups) {
                        if (!mentionedGroups.includes(g)) {
                            mentionedGroups.push(g);
                            console.log(`⚠️ [GSM] contextInfo.mentionedJid group: ${g} | Sender: ${userName}`);
                        }
                    }
                }

                if (ctx.groupMentions?.length) {
                    for (const gm of ctx.groupMentions) {
                        const gjid = gm.groupJid || gm.jid || gm.id;
                        if (gjid?.endsWith('@g.us') && !mentionedGroups.includes(gjid)) {
                            mentionedGroups.push(gjid);
                            console.log(`⚠️ [GSM] contextInfo.groupMentions: ${gjid} | Sender: ${userName}`);
                        }
                    }
                }

                if (ctx.remoteJid?.endsWith('@g.us') && !mentionedGroups.includes(ctx.remoteJid)) {
                    mentionedGroups.push(ctx.remoteJid);
                }
            }
        }

        if (message.groupMentionedMessage) {
            const gmMsg = message.groupMentionedMessage;
            const gjid = gmMsg.groupJid || gmMsg.jid;
            if (gjid?.endsWith('@g.us') && !mentionedGroups.includes(gjid)) {
                mentionedGroups.push(gjid);
                console.log(`⚠️ [GSM] Top-level groupMentionedMessage: ${gjid} | Sender: ${userName}`);
            }
        }

        if (message.statusMentionMessage) {
            const smm = message.statusMentionMessage;
            if (smm.groupJid?.endsWith('@g.us') && !mentionedGroups.includes(smm.groupJid)) {
                mentionedGroups.push(smm.groupJid);
                console.log(`⚠️ [GSM] Top-level statusMentionMessage: ${smm.groupJid} | Sender: ${userName}`);
            }
        }

        if (mentionedGroups.length === 0) {
            return;
        }

        console.log(`⚠️ [GSM] Processing ${mentionedGroups.length} group mention(s) from ${userName}`);

        for (const groupId of mentionedGroups) {
            await processGroupMention(sock, groupId, cleanSender, userName, msg);
        }
    } catch (err) {
        console.error('[ANTISTATUSMENTION] Handler error:', err.message);
    }
}

async function processGroupMention(sock, groupId, cleanSender, userName, msg) {
    const config = loadConfig();
    const groupConfig = config[groupId];
    if (!groupConfig || !groupConfig.enabled) {
        console.log(`🔔 [GSM] Group ${groupId.split('@')[0]} not protected, skipping`);
        return;
    }

    let isGroupMember = false;
    let isAdmin = false;
    let metadata;
    let foundParticipant = null;

    try {
        metadata = await sock.groupMetadata(groupId);
        foundParticipant = findParticipant(metadata.participants, cleanSender);
        if (foundParticipant) {
            isGroupMember = true;
            isAdmin = foundParticipant.admin === 'admin' || foundParticipant.admin === 'superadmin';
        }
    } catch {
        return;
    }

    if (!isGroupMember) return;
    if (groupConfig.exemptAdmins && isAdmin) return;

    const groupName = metadata?.subject || 'the group';

    if (!groupConfig.warnings) groupConfig.warnings = {};
    if (!groupConfig.warnings[cleanSender]) groupConfig.warnings[cleanSender] = 0;
    groupConfig.warnings[cleanSender]++;

    const warningCount = groupConfig.warnings[cleanSender];

    console.log(`⚠️ [ANTISTATUSMENTION] Status mention of "${groupName}" (${groupId.split('@')[0]}) by ${userName} | Mode: ${groupConfig.mode} | Warning #${warningCount}`);

    switch (groupConfig.mode) {
        case 'warn': {
            await sock.sendMessage(groupId, {
                text: `⚠️ *Status Mention Warning*\n\n@${userName}, please don't mention this group in your WhatsApp status.\n\n⚡ Warning: *${warningCount}/${groupConfig.maxWarnings || 3}*${warningCount >= (groupConfig.maxWarnings || 3) ? '\n\n🚨 _Next violation may result in removal!_' : ''}`,
                mentions: [cleanSender]
            });
            break;
        }

        case 'delete': {
            try {
                await sock.sendMessage(groupId, {
                    delete: {
                        remoteJid: groupId,
                        id: msg?.key?.id,
                        participant: msg?.key?.participant,
                        fromMe: false
                    }
                });
                console.log(`🗑️ [GSM] Deleted groupStatusMentionMessage from ${userName} in ${groupId.split('@')[0]}`);
            } catch (delErr) {
                console.error('[GSM] Delete failed:', delErr.message);
            }
            await sock.sendMessage(groupId, {
                text: `🚫 *Status Mention Deleted*\n\n@${userName} mentioned this group in their WhatsApp status — message removed.\n\n⚡ Warning: *${warningCount}/${groupConfig.maxWarnings || 3}*${warningCount >= (groupConfig.maxWarnings || 3) ? '\n\n🚨 _Next violation may result in removal!_' : ''}`,
                mentions: [cleanSender]
            });
            break;
        }

        case 'kick': {
            if (warningCount >= (groupConfig.maxWarnings || 1)) {
                const kickJid = await resolveKickJid(sock, foundParticipant, cleanSender);
                if (!kickJid) {
                    // LID unresolvable — warn group honestly instead of failing silently
                    await sock.sendMessage(groupId, {
                        text: `⚠️ *Status Mention Detected*\n\n@${userName} should be removed but their identity could not be resolved yet.\n\n📋 Violations: *${warningCount}* — Try again after they send a message in the group.`,
                        mentions: [cleanSender]
                    }).catch(() => {});
                } else {
                try {
                    await sock.sendMessage(groupId, {
                        text: `🚨 *Auto-Kick: Status Mention*\n\n@${userName} has been removed for mentioning this group in their WhatsApp status.\n\n📋 Violations: *${warningCount}*`,
                        mentions: [kickJid]
                    });
                    await sock.groupParticipantsUpdate(groupId, [kickJid], 'remove');
                    delete groupConfig.warnings[cleanSender];
                    console.log(`[ANTISTATUSMENTION] Kicked ${userName} from ${groupId.split('@')[0]}`);
                } catch (kickErr) {
                    await sock.sendMessage(groupId, {
                        text: `❌ Failed to remove @${userName}. Make sure I have admin permissions.`,
                        mentions: [kickJid]
                    });
                }
                }
            } else {
                await sock.sendMessage(groupId, {
                    text: `⚠️ *Status Mention Warning*\n\n@${userName}, mentioning this group in your status is not allowed.\n\n⚡ Warning: *${warningCount}/${groupConfig.maxWarnings || 1}*\n🚨 _You will be removed on the next violation!_`,
                    mentions: [cleanSender]
                });
            }
            break;
        }
    }

    config[groupId] = groupConfig;
    saveConfig(config);
}

export default {
    name: 'antistatusmention',
    alias: ['asm', 'antistatusm', 'gsm', 'groupstatusmention', 'antigroupstatusmention'],
    category: 'group',
    description: 'Detect and take action when someone mentions the group in their WhatsApp status',
    groupOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const participant = msg.key.participant;

        try {
            const metadata = await sock.groupMetadata(chatId);
            const cleanParticipant = cleanJid(participant);
            const isAdmin = metadata.participants.find(p => cleanJid(p.id) === cleanParticipant)?.admin || false;

            if (!isAdmin && !extra?.jidManager?.isOwner(msg)) {
                return sock.sendMessage(chatId, {
                    text: '❌ *Admin Only Command*\nYou need to be admin to use this command.'
                }, { quoted: msg });
            }
        } catch {
            return sock.sendMessage(chatId, {
                text: '❌ Failed to check permissions'
            }, { quoted: msg });
        }

        const action = args[0]?.toLowerCase();
        const config = loadConfig();
        const groupConfig = config[chatId] || {
            enabled: false,
            mode: 'warn',
            maxWarnings: 3,
            exemptAdmins: true,
            warnings: {}
        };

        if (!action || action === 'help') {
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 🚫 *ANTI-STATUS MENTION* ⌋\n│\n├─⊷ *${PREFIX}antistatusmention warn*\n│  └⊷ Warn the person\n├─⊷ *${PREFIX}antistatusmention delete*\n│  └⊷ Notify & warn\n├─⊷ *${PREFIX}antistatusmention kick*\n│  └⊷ Auto-kick after warnings\n├─⊷ *${PREFIX}antistatusmention off*\n│  └⊷ Disable protection\n├─⊷ *${PREFIX}antistatusmention maxwarn <number>*\n│  └⊷ Set max warnings\n├─⊷ *${PREFIX}antistatusmention reset <@user>*\n│  └⊷ Reset user warnings\n├─⊷ *${PREFIX}antistatusmention status*\n│  └⊷ View current settings\n│\n├─⊷ *Aliases:* gsm, asm\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        }

        try {
            switch (action) {
                case 'warn': {
                    groupConfig.enabled = true;
                    groupConfig.mode = 'warn';
                    config[chatId] = groupConfig;
                    saveConfig(config);

                    await sock.sendMessage(chatId, {
                        text: `✅ *Anti-Status Mention ENABLED*\nMode: ⚠️ *WARN*\n\nMembers who mention this group in their status will receive a warning.\nMax warnings: *${groupConfig.maxWarnings}*\n\n📡 _Listening for groupStatusMentionMessage..._`
                    }, { quoted: msg });
                    break;
                }

                case 'delete': {
                    groupConfig.enabled = true;
                    groupConfig.mode = 'delete';
                    config[chatId] = groupConfig;
                    saveConfig(config);

                    await sock.sendMessage(chatId, {
                        text: `✅ *Anti-Status Mention ENABLED*\nMode: 🗑️ *DELETE*\n\nMembers who mention this group in their status will be notified and warned.\nMax warnings: *${groupConfig.maxWarnings}*\n\n📡 _Listening for groupStatusMentionMessage..._`
                    }, { quoted: msg });
                    break;
                }

                case 'kick': {
                    groupConfig.enabled = true;
                    groupConfig.mode = 'kick';
                    groupConfig.maxWarnings = 1;
                    config[chatId] = groupConfig;
                    saveConfig(config);

                    await sock.sendMessage(chatId, {
                        text: `✅ *Anti-Status Mention ENABLED*\nMode: 🦶 *KICK*\n\nMembers who mention this group in their status will be removed after *${groupConfig.maxWarnings}* warning(s).\n\n⚠️ _Make sure I have admin permissions!_\n📡 _Listening for groupStatusMentionMessage..._`
                    }, { quoted: msg });
                    break;
                }

                case 'off':
                case 'disable': {
                    groupConfig.enabled = false;
                    config[chatId] = groupConfig;
                    saveConfig(config);

                    await sock.sendMessage(chatId, {
                        text: '❌ *Anti-Status Mention DISABLED*\nMembers can mention this group in their status freely.'
                    }, { quoted: msg });
                    break;
                }

                case 'maxwarn':
                case 'maxwarnings': {
                    const num = parseInt(args[1]);
                    if (!num || num < 1 || num > 10) {
                        return sock.sendMessage(chatId, {
                            text: `❌ Please provide a number between 1 and 10.\nExample: \`${PREFIX}antistatusmention maxwarn 3\``
                        }, { quoted: msg });
                    }

                    groupConfig.maxWarnings = num;
                    config[chatId] = groupConfig;
                    saveConfig(config);

                    await sock.sendMessage(chatId, {
                        text: `✅ *Max warnings set to ${num}*\n\nMembers will receive ${num} warning(s) before further action.`
                    }, { quoted: msg });
                    break;
                }

                case 'reset': {
                    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
                    if (mentioned && mentioned.length > 0) {
                        const targetJid = cleanJid(mentioned[0]);
                        if (groupConfig.warnings?.[targetJid]) {
                            delete groupConfig.warnings[targetJid];
                            config[chatId] = groupConfig;
                            saveConfig(config);
                            await sock.sendMessage(chatId, {
                                text: `✅ Warnings reset for @${targetJid.split('@')[0]}`,
                                mentions: [targetJid]
                            }, { quoted: msg });
                        } else {
                            await sock.sendMessage(chatId, {
                                text: '⚠️ That user has no warnings to reset.'
                            }, { quoted: msg });
                        }
                    } else if (args[1] === 'all') {
                        groupConfig.warnings = {};
                        config[chatId] = groupConfig;
                        saveConfig(config);
                        await sock.sendMessage(chatId, {
                            text: '✅ All warnings have been reset for this group.'
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(chatId, {
                            text: `❌ Tag a user or use \`${PREFIX}antistatusmention reset all\``
                        }, { quoted: msg });
                    }
                    break;
                }

                case 'status':
                case 'settings': {
                    const modeEmoji = { warn: '⚠️', delete: '🗑️', kick: '🦶' };
                    const warningsList = Object.entries(groupConfig.warnings || {});
                    let warnText = '';
                    if (warningsList.length > 0) {
                        warnText = '\n\n📋 *Warning Log:*\n' + warningsList.map(([jid, count]) =>
                            `• @${jid.split('@')[0]}: ${count} warning(s)`
                        ).join('\n');
                    }

                    await sock.sendMessage(chatId, {
                        text: `📊 *ANTI-STATUS MENTION STATUS*\n\nEnabled: ${groupConfig.enabled ? '✅ YES' : '❌ NO'}\nMode: ${modeEmoji[groupConfig.mode] || '❓'} *${(groupConfig.mode || 'none').toUpperCase()}*\nMax Warnings: *${groupConfig.maxWarnings || 3}*\nAdmins Exempt: ${groupConfig.exemptAdmins ? '✅ Yes' : '❌ No'}\nDetection: groupStatusMentionMessage${warnText}`,
                        mentions: warningsList.map(([jid]) => jid)
                    }, { quoted: msg });
                    break;
                }

                default: {
                    await sock.sendMessage(chatId, {
                        text: `❌ Unknown option. Use \`${PREFIX}antistatusmention help\` for usage.`
                    }, { quoted: msg });
                }
            }
        } catch (error) {
            console.error('[ANTISTATUSMENTION] Command error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Error: ${error.message}`
            }, { quoted: msg });
        }
    }
};
