import supabase from '../../lib/database.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const CONFIG_DB_KEY = 'autotyping_config';

const autoTypingConfig = {
    mode: 'off',
    duration: 10,
    targetJid: null,
    activeTypers: new Map(),
    botSock: null,
    isHooked: false
};

function loadConfig() {
    try {
        const data = supabase.getConfigSync(CONFIG_DB_KEY, { mode: 'off', duration: 10, targetJid: null });
        autoTypingConfig.mode = data.mode || 'off';
        autoTypingConfig.duration = data.duration || 10;
        autoTypingConfig.targetJid = data.targetJid || null;
    } catch {}
}

function saveConfig() {
    try {
        const cfg = {
            mode: autoTypingConfig.mode,
            duration: autoTypingConfig.duration,
            targetJid: autoTypingConfig.targetJid || null
        };
        supabase.setConfig(CONFIG_DB_KEY, cfg).catch(() => {});
    } catch {}
}

function normalizeToJid(input) {
    const cleaned = input.replace(/[^0-9]/g, '');
    if (cleaned.length >= 7) return `${cleaned}@s.whatsapp.net`;
    return null;
}

loadConfig();

function shouldTypeInChat(chatJid) {
    const mode = autoTypingConfig.mode;
    if (mode === 'off') return false;
    if (mode === 'single') return chatJid === autoTypingConfig.targetJid;
    const isGroup = chatJid.endsWith('@g.us');
    if (mode === 'both') return true;
    if (mode === 'groups' && isGroup) return true;
    if (mode === 'dm' && !isGroup) return true;
    return false;
}

class AutoTypingManager {
    static initialize(sock) {
        if (sock && autoTypingConfig.botSock && autoTypingConfig.botSock !== sock) {
            autoTypingConfig.isHooked = false;
        }
        if (!autoTypingConfig.isHooked && sock) {
            autoTypingConfig.botSock = sock;
            this.hookIntoBot();
            autoTypingConfig.isHooked = true;
        }
    }

    static hookIntoBot() {
        if (!autoTypingConfig.botSock?.ev) return;
        autoTypingConfig.botSock.ev.on('messages.upsert', async (data) => {
            await this.handleIncomingMessage(data);
        });
    }

    static async handleIncomingMessage(data) {
        try {
            if (!data?.messages?.length) return;
            const m = data.messages[0];
            const sock = autoTypingConfig.botSock;
            if (!m?.key || m.key.fromMe || autoTypingConfig.mode === 'off') return;

            const messageText = m.message?.conversation ||
                m.message?.extendedTextMessage?.text ||
                m.message?.imageMessage?.caption || '';
            if (messageText.trim().startsWith('.')) return;

            const chatJid = m.key.remoteJid;
            if (!chatJid || !shouldTypeInChat(chatJid)) return;

            const now = Date.now();

            if (autoTypingConfig.activeTypers.has(chatJid)) {
                const typerData = autoTypingConfig.activeTypers.get(chatJid);
                typerData.lastMessageTime = now;
                if (typerData.timeoutId) clearTimeout(typerData.timeoutId);
                typerData.timeoutId = setTimeout(async () => {
                    await this.stopTypingInChat(chatJid, sock);
                }, autoTypingConfig.duration * 1000);
                return;
            }

            await sock.sendPresenceUpdate('composing', chatJid);

            const keepAlive = setInterval(async () => {
                try {
                    if (autoTypingConfig.activeTypers.has(chatJid)) {
                        await sock.sendPresenceUpdate('composing', chatJid);
                    }
                } catch {}
            }, 2000);

            const timeoutId = setTimeout(async () => {
                await this.stopTypingInChat(chatJid, sock);
            }, autoTypingConfig.duration * 1000);

            autoTypingConfig.activeTypers.set(chatJid, {
                intervalId: keepAlive,
                timeoutId,
                startTime: now,
                lastMessageTime: now
            });

        } catch (err) {
            console.error("Auto-typing handler error:", err.message);
        }
    }

    static async stopTypingInChat(chatJid, sock) {
        if (autoTypingConfig.activeTypers.has(chatJid)) {
            const typerData = autoTypingConfig.activeTypers.get(chatJid);
            clearInterval(typerData.intervalId);
            if (typerData.timeoutId) clearTimeout(typerData.timeoutId);
            autoTypingConfig.activeTypers.delete(chatJid);
            try { await sock.sendPresenceUpdate('paused', chatJid); } catch {}
        }
    }

    static clearAllTypers() {
        autoTypingConfig.activeTypers.forEach((typerData) => {
            clearInterval(typerData.intervalId);
            if (typerData.timeoutId) clearTimeout(typerData.timeoutId);
        });
        autoTypingConfig.activeTypers.clear();
    }
}

export default {
    name: "autotyping",
    alias: ["autotype", "fake", "typingsim", "typingtoggle", "atype", "typingmode", "typing"],
    desc: "Toggle auto fake typing indicator — can target a specific chat",
    category: "Owner",
    usage: ".autotyping [dm|groups|both|off|status|<number>|<jid>]",

    async execute(sock, m, args, PREFIX, extra) {
        try {
            const targetJid = m.key.remoteJid;

            if (!autoTypingConfig.isHooked) {
                autoTypingConfig.botSock = sock;
                AutoTypingManager.hookIntoBot();
                autoTypingConfig.isHooked = true;
            }

            const isOwner = extra?.jidManager?.isOwner(m) || m.key.fromMe;
            if (!isOwner) {
                return sock.sendMessage(targetJid, {
                    text: '❌ *Owner Only Command*'
                }, { quoted: m });
            }

            const sub = (args[0] || '').toLowerCase().trim();

            if (!sub || sub === 'status' || sub === 'info') {
                const mode = autoTypingConfig.mode;
                const modeLabels = {
                    off: '❌ OFF',
                    dm: '💬 DMs only',
                    groups: '👥 Groups only',
                    both: '🌐 DMs + Groups',
                    single: `🎯 Single chat: ${autoTypingConfig.targetJid || 'none'}`
                };

                return sock.sendMessage(targetJid, {
                    text: `╭─⌈ 🤖 *AUTO-TYPING* ⌋\n│\n│ Mode: ${modeLabels[mode] || mode}\n│ Duration: ${autoTypingConfig.duration}s\n│ Active: ${autoTypingConfig.activeTypers.size}\n│\n├─⊷ *${PREFIX}autotyping <number>*\n│  └⊷ Type only in that person's DM\n│  └⊷ e.g. ${PREFIX}autotyping 254703397679\n├─⊷ *${PREFIX}autotyping dm*\n│  └⊷ All DMs\n├─⊷ *${PREFIX}autotyping groups*\n│  └⊷ All groups\n├─⊷ *${PREFIX}autotyping both*\n│  └⊷ DMs + Groups\n├─⊷ *${PREFIX}autotyping off*\n│  └⊷ Disable\n├─⊷ *${PREFIX}autotyping <1-60>*\n│  └⊷ Set duration\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: m });
            }

            if (['dm', 'dms', 'private'].includes(sub)) {
                autoTypingConfig.mode = 'dm';
                autoTypingConfig.targetJid = null;
                saveConfig();
                AutoTypingManager.clearAllTypers();
                return sock.sendMessage(targetJid, {
                    text: `✅ *Auto-Typing: DMs Only*\n\nTyping indicator will show in all private chats.\nDuration: ${autoTypingConfig.duration}s`
                }, { quoted: m });
            }

            if (['groups', 'group', 'gc'].includes(sub)) {
                autoTypingConfig.mode = 'groups';
                autoTypingConfig.targetJid = null;
                saveConfig();
                AutoTypingManager.clearAllTypers();
                return sock.sendMessage(targetJid, {
                    text: `✅ *Auto-Typing: Groups Only*\n\nTyping indicator will show in all group chats.\nDuration: ${autoTypingConfig.duration}s`
                }, { quoted: m });
            }

            if (['both', 'all', 'on', 'enable'].includes(sub)) {
                autoTypingConfig.mode = 'both';
                autoTypingConfig.targetJid = null;
                saveConfig();
                return sock.sendMessage(targetJid, {
                    text: `✅ *Auto-Typing: DMs + Groups*\n\nTyping indicator will show in all chats.\nDuration: ${autoTypingConfig.duration}s`
                }, { quoted: m });
            }

            if (['off', 'disable', 'stop'].includes(sub)) {
                autoTypingConfig.mode = 'off';
                autoTypingConfig.targetJid = null;
                saveConfig();
                AutoTypingManager.clearAllTypers();
                return sock.sendMessage(targetJid, {
                    text: `❌ *Auto-Typing Disabled*\n\nTyping indicator is now off for all chats.`
                }, { quoted: m });
            }

            const duration = parseInt(sub);
            if (!isNaN(duration) && duration >= 1 && duration <= 60) {
                autoTypingConfig.duration = duration;
                saveConfig();
                return sock.sendMessage(targetJid, {
                    text: `✅ *Duration set to ${duration}s*\n\nCurrent mode: ${autoTypingConfig.mode}${autoTypingConfig.targetJid ? `\nTarget: ${autoTypingConfig.targetJid}` : ''}`
                }, { quoted: m });
            }

            const inputJid = args[0].includes('@') ? args[0].trim() : normalizeToJid(args[0]);
            if (inputJid) {
                autoTypingConfig.mode = 'single';
                autoTypingConfig.targetJid = inputJid;
                saveConfig();
                AutoTypingManager.clearAllTypers();
                const displayNum = inputJid.split('@')[0];
                return sock.sendMessage(targetJid, {
                    text: `✅ *Auto-Typing: Single Chat*\n\n🎯 Target: *+${displayNum}*\n⏱️ Duration: ${autoTypingConfig.duration}s\n\nTyping will only be simulated in that person's DM.\n\n• Change target: \`${PREFIX}autotyping <new_number>\`\n• Disable: \`${PREFIX}autotyping off\``
                }, { quoted: m });
            }

            return sock.sendMessage(targetJid, {
                text: `╭─⌈ 🤖 *AUTO-TYPING* ⌋\n│\n├─⊷ *${PREFIX}autotyping <number>*\n│  └⊷ Target one specific chat\n│  └⊷ e.g. ${PREFIX}autotyping 254703397679\n├─⊷ *${PREFIX}autotyping dm*\n│  └⊷ All DMs\n├─⊷ *${PREFIX}autotyping groups*\n│  └⊷ All groups\n├─⊷ *${PREFIX}autotyping both*\n│  └⊷ DMs + Groups\n├─⊷ *${PREFIX}autotyping off*\n│  └⊷ Disable\n├─⊷ *${PREFIX}autotyping <1-60>*\n│  └⊷ Set duration\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });

        } catch (err) {
            console.error("AutoTyping error:", err);
            await sock.sendMessage(m.key.remoteJid, {
                text: `❌ AutoTyping error: ${err.message}`
            }, { quoted: m });
        }
    }
};

globalThis._autoTypingInit = (sock) => {
    loadConfig();
    if (autoTypingConfig.mode !== 'off') {
        AutoTypingManager.initialize(sock);
    }
};
