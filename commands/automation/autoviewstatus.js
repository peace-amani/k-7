// commands/automation/autoviewstatus.js

import supabase from '../../lib/database.js';
import { getBotName } from '../../lib/botname.js';

const CONFIG_DB_KEY = 'autoview_config';
const DEFAULT_VIEW_CONFIG = {
    enabled: true, logs: [], totalViewed: 0, lastViewed: null,
    consecutiveViews: 0, lastSender: null, excludedContacts: [],
    settings: { rateLimitDelay: 1000, markAsSeen: true }
};

const G = '\x1b[32m'; const C = '\x1b[36m'; const Y = '\x1b[33m';
const R = '\x1b[31m'; const B = '\x1b[1m';  const D = '\x1b[2m'; const X = '\x1b[0m';

function logBox(sender, msgType, result) {
    const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    console.log(`${G}${B}👁️  STATUS${X} ${C}${sender}${X} ${D}${msgType}${X} ${G}${result}${X} ${D}${t}${X}`);
}

function getMessageType(message) {
    if (!message) return `${D}stub${X}`;
    const map = {
        imageMessage: '🖼️  Image', videoMessage: '🎥  Video',
        extendedTextMessage: '📝  Text', conversation: '💬  Text',
        audioMessage: '🎵  Audio', stickerMessage: '🎭  Sticker',
        documentMessage: '📄  Document', reactionMessage: '😮  Reaction',
        protocolMessage: '🔧  Protocol',
    };
    const key = Object.keys(message)[0];
    return map[key] || `📦  ${key}`;
}

class AutoViewManager {
    constructor() {
        this.config = this.loadConfig();
        this.lastViewTime = 0;
        this.queue = [];
        this._draining = false;
        this._saveTimer = null;
    }

    loadConfig() {
        try {
            const c = supabase.getConfigSync(CONFIG_DB_KEY, DEFAULT_VIEW_CONFIG);
            if (!Array.isArray(c.excludedContacts)) c.excludedContacts = [];
            return { ...DEFAULT_VIEW_CONFIG, ...c };
        } catch { return { ...DEFAULT_VIEW_CONFIG }; }
    }

    saveConfig() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            try {
                supabase.setConfig(CONFIG_DB_KEY, this.config).catch(() => {});
            } catch {}
            this._saveTimer = null;
        }, 3000);
    }

    saveConfigImmediate() {
        if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
        try {
            supabase.setConfig(CONFIG_DB_KEY, this.config).catch(() => {});
        } catch {}
    }

    get enabled()     { return this.config.enabled; }
    get logs()        { return this.config.logs; }
    get totalViewed() { return this.config.totalViewed; }

    // ── Exclusion helpers ─────────────────────────────────────────────────────
    // Normalize a user-supplied number (strips spaces, +, dashes)
    _normalizeNum(input) {
        return String(input).replace(/[^0-9]/g, '');
    }

    // Check if a statusKey's sender is on the exclusion list.
    // Checks both the participant number AND the remoteJidAlt phone number
    // so LID-based contacts are handled correctly.
    isExcluded(statusKey) {
        const list = this.config.excludedContacts;
        if (!list || list.length === 0) return false;
        const pNum  = (statusKey.participant || statusKey.remoteJid || '').split('@')[0].split(':')[0];
        const altNum = statusKey.remoteJidAlt ? statusKey.remoteJidAlt.split('@')[0] : null;
        return list.some(n => n === pNum || (altNum && n === altNum));
    }

    excludeContact(input) {
        const num = this._normalizeNum(input);
        if (!num) return false;
        if (!this.config.excludedContacts.includes(num)) {
            this.config.excludedContacts.push(num);
            this.saveConfigImmediate();
            return true;
        }
        return false;
    }

    includeContact(input) {
        const num = this._normalizeNum(input);
        const idx = this.config.excludedContacts.indexOf(num);
        if (idx !== -1) {
            this.config.excludedContacts.splice(idx, 1);
            this.saveConfigImmediate();
            return true;
        }
        return false;
    }

    toggle(forceOff = false) {
        this.config.enabled = !forceOff;
        this.saveConfigImmediate(); return this.config.enabled;
    }

    addLog(sender) {
        const entry = { sender, timestamp: Date.now() };
        this.config.logs.push(entry);
        this.config.totalViewed++;
        this.config.lastViewed = entry;
        this.config.consecutiveViews = this.config.lastSender === sender
            ? this.config.consecutiveViews + 1 : 1;
        this.config.lastSender = sender;
        if (this.config.logs.length > 100) this.config.logs.shift();
        this.saveConfig();
    }

    clearLogs() {
        Object.assign(this.config, { logs: [], totalViewed: 0, lastViewed: null,
            consecutiveViews: 0, lastSender: null });
        this.saveConfigImmediate();
    }

    getStats() {
        return {
            enabled: this.config.enabled, totalViewed: this.config.totalViewed,
            lastViewed: this.config.lastViewed, consecutiveViews: this.config.consecutiveViews,
            excludedCount: this.config.excludedContacts.length,
            settings: { ...this.config.settings }
        };
    }

    async viewStatus(sock, statusKey, message) {
        try {
            if (!statusKey || statusKey.fromMe) return false;

            const msgKey = message ? Object.keys(message)[0] : null;
            if (msgKey === 'reactionMessage' || msgKey === 'protocolMessage') return false;

            const resolvedSender = statusKey.participantPn || statusKey.participant || statusKey.remoteJid;
            const displayId = '+' + resolvedSender.split('@')[0].split(':')[0];
            const msgType   = getMessageType(message);

            if (!this.config.enabled || !this.config.settings.markAsSeen) {
                logBox(displayId, msgType, `${Y}SKIPPED — autoview OFF${X}`);
                return false;
            }

            if (this.isExcluded(statusKey)) {
                logBox(displayId, msgType, `${Y}SKIPPED — excluded${X}`);
                return false;
            }

            this.queue.push({ sock, statusKey, displayId });
            this._drain();
            return true;

        } catch (err) {
            console.error('autoviewstatus error:', err.message);
            return false;
        }
    }

    _drain() {
        if (this._draining) return;
        this._draining = true;
        this._processNext().catch(() => { this._draining = false; });
    }

    async _processNext() {
        while (this.queue.length > 0) {
            const { sock, statusKey, displayId } = this.queue.shift();
            const wait = this.config.settings.rateLimitDelay - (Date.now() - this.lastViewTime);
            if (wait > 0) await new Promise(r => setTimeout(r, wait));
            await this._sendReceipt(sock, statusKey, displayId);
        }
        this._draining = false;
    }

    async _sendReceipt(sock, statusKey, displayId) {
        const participantToUse = statusKey.remoteJidAlt || statusKey.participantPn || statusKey.participant || statusKey.remoteJid;
        const readKey = {
            remoteJid: statusKey.remoteJid,
            id: statusKey.id,
            fromMe: false,
            participant: participantToUse
        };
        try {
            await sock.readMessages([readKey]);
            this.lastViewTime = Date.now();
            this.addLog(displayId);
        } catch (err) {
            console.log(`${R}${B}❌ VIEW FAILED for ${displayId}: ${err.message}${X}`);
        }
    }

    updateSetting(setting, value) {
        if (Object.prototype.hasOwnProperty.call(this.config.settings, setting)) {
            this.config.settings[setting] = value; this.saveConfigImmediate(); return true;
        }
        return false;
    }
}

const autoViewManager = new AutoViewManager();

export async function handleAutoView(sock, statusKey, message) {
    return await autoViewManager.viewStatus(sock, statusKey, message);
}

export { autoViewManager };

export default {
    name: "autoviewstatus",
    alias: ["autoview", "viewstatus", "statusview", "vs", "views"],
    desc: "Automatically view (mark as seen) WhatsApp statuses 👁️",
    category: "Automation",
    ownerOnly: false,

    async execute(sock, m, args, prefix, extra) {
        try {
            const isOwner = extra?.isOwner?.() || false;
            const reply = (text) => sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });

            if (args.length === 0) {
                let text = `╭─⌈ 👁️ *AUTOVIEWSTATUS* ⌋\n│\n`;
                text += `├─⊷ *${prefix}autoviewstatus on/off*\n│  └⊷ Enable / disable\n`;
                text += `├─⊷ *${prefix}autoviewstatus exclude <number>*\n│  └⊷ Skip a contact\n`;
                text += `├─⊷ *${prefix}autoviewstatus include <number>*\n│  └⊷ Remove from skip list\n`;
                text += `├─⊷ *${prefix}autoviewstatus excluded*\n│  └⊷ Show skip list\n`;
                text += `├─⊷ *${prefix}autoviewstatus stats*\n│  └⊷ Statistics\n`;
                text += `╰⊷ *Powered by ${getBotName().toUpperCase()}*`;
                await reply(text);
                return;
            }

            const action = args[0].toLowerCase();

            switch (action) {
                case 'on': case 'enable': case 'start': {
                    if (!isOwner) { await reply("❌ Owner only!"); return; }
                    autoViewManager.toggle(false);
                    await reply(`✅ *AUTOVIEWSTATUS ENABLED*\n\n👁️ Will now automatically view statuses!`);
                    break;
                }
                case 'off': case 'disable': case 'stop': {
                    if (!isOwner) { await reply("❌ Owner only!"); return; }
                    autoViewManager.toggle(true);
                    await reply(`❌ *AUTOVIEWSTATUS DISABLED*`);
                    break;
                }

                case 'exclude': case 'skip': case 'block': {
                    if (!isOwner) { await reply("❌ Owner only!"); return; }
                    const num = args[1];
                    if (!num) { await reply(`Usage: *${prefix}autoviewstatus exclude <number>*\nExample: ${prefix}autoviewstatus exclude 254703123456`); return; }
                    if (autoViewManager.excludeContact(num)) {
                        const clean = num.replace(/[^0-9]/g, '');
                        await reply(`✅ *Excluded from auto-view*\n\n🚫 ${clean}\n\nTheir statuses will be silently skipped.`);
                    } else {
                        await reply(`⚠️ ${num.replace(/[^0-9]/g, '')} is already on the skip list.`);
                    }
                    break;
                }

                case 'include': case 'unexclude': case 'unblock': case 'unskip': {
                    if (!isOwner) { await reply("❌ Owner only!"); return; }
                    const num = args[1];
                    if (!num) { await reply(`Usage: *${prefix}autoviewstatus include <number>*`); return; }
                    if (autoViewManager.includeContact(num)) {
                        const clean = num.replace(/[^0-9]/g, '');
                        await reply(`✅ *Removed from skip list*\n\n👁️ ${clean} will now be auto-viewed again.`);
                    } else {
                        await reply(`⚠️ ${num.replace(/[^0-9]/g, '')} was not on the skip list.`);
                    }
                    break;
                }

                case 'excluded': case 'skiplist': case 'blocklist': case 'exclusions': {
                    const list = autoViewManager.config.excludedContacts;
                    if (!list.length) {
                        await reply(`📭 *No contacts excluded from auto-view.*\n\nUse *${prefix}autoviewstatus exclude <number>* to skip someone.`);
                        return;
                    }
                    let text = `🚫 *AUTOVIEW SKIP LIST (${list.length})*\n\n`;
                    list.forEach((n, i) => { text += `${i + 1}. +${n}\n`; });
                    text += `\nUse *${prefix}autoviewstatus include <number>* to remove.`;
                    await reply(text);
                    break;
                }

                case 'stats': case 'statistics': case 'info': {
                    const s = autoViewManager.getStats();
                    let text = `📊 *AUTOVIEWSTATUS STATS*\n\n`;
                    text += `🟢 Status   : ${s.enabled ? 'ACTIVE ✅' : 'INACTIVE ❌'}\n`;
                    text += `👁️ Viewed   : *${s.totalViewed}*\n`;
                    text += `🔄 Streak   : ${s.consecutiveViews}\n`;
                    text += `🚫 Excluded : ${s.excludedCount}\n`;
                    text += `⚙️ Delay    : ${s.settings.rateLimitDelay}ms\n`;
                    if (s.lastViewed) {
                        const ago = Math.floor((Date.now() - s.lastViewed.timestamp) / 60000);
                        text += `\n🕒 Last: ${s.lastViewed.sender} (${ago < 1 ? 'just now' : ago + ' min ago'})`;
                    }
                    await reply(text);
                    break;
                }

                case 'logs': case 'history': {
                    const logs = autoViewManager.logs.slice(-10).reverse();
                    if (!logs.length) { await reply(`📭 No statuses viewed yet.`); return; }
                    let text = `📋 *RECENT VIEWS*\n\n`;
                    logs.forEach((l, i) => { text += `${i+1}. ${l.sender} — ${new Date(l.timestamp).toLocaleTimeString()}\n`; });
                    text += `\n📊 Total: ${autoViewManager.totalViewed}`;
                    await reply(text);
                    break;
                }

                case 'reset': {
                    if (!isOwner) { await reply("❌ Owner only!"); return; }
                    autoViewManager.clearLogs();
                    await reply(`🗑️ Stats reset.`);
                    break;
                }

                case 'delay': {
                    const ms = parseInt(args[1]);
                    if (isNaN(ms) || ms < 200) { await reply('❌ Min 200ms'); return; }
                    autoViewManager.updateSetting('rateLimitDelay', ms);
                    await reply(`✅ Delay set to ${ms}ms`);
                    break;
                }

                default:
                    await reply(`╭─⌈ ❓ *AUTOVIEWSTATUS* ⌋\n│\n├─⊷ *${prefix}autoviewstatus on/off*\n├─⊷ *${prefix}autoviewstatus exclude <number>*\n├─⊷ *${prefix}autoviewstatus include <number>*\n├─⊷ *${prefix}autoviewstatus excluded*\n├─⊷ *${prefix}autoviewstatus stats*\n├─⊷ *${prefix}autoviewstatus logs*\n├─⊷ *${prefix}autoviewstatus delay <ms>*\n╰⊷ *Powered by ${getBotName().toUpperCase()}*`);
            }
        } catch (error) {
            console.error('AutoViewStatus error:', error);
            await sock.sendMessage(m.key.remoteJid, { text: `❌ ${error.message}` }, { quoted: m });
        }
    }
};
