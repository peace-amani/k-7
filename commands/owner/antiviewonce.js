import fs from 'fs';
import { join } from 'path';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';

const CONFIG_DIR = './data/antiviewonce';
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (raw.gc && raw.pm) return raw;
            // Migrate legacy flat config
            const enabled = raw.mode !== 'off';
            const mode = raw.mode === 'public' ? 'chat' : 'private';
            return {
                gc: { enabled, mode },
                pm: { enabled, mode },
                ownerJid: raw.ownerJid || '',
                sendAsSticker: raw.sendAsSticker || false
            };
        }
    } catch {}
    return {
        gc: { enabled: true, mode: 'private' },
        pm: { enabled: true, mode: 'private' },
        ownerJid: '',
        sendAsSticker: false
    };
}

function saveConfig(config) {
    try {
        if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch {}
}

const modeLabel = (m) =>
    m === 'chat' ? 'same chat' : m === 'both' ? 'DM + chat' : 'private DM';

export default {
    name: 'antiviewonce',
    alias: ['av', 'antiview', 'avonce'],
    desc: 'Capture view-once media automatically',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, prefix, extras) {
        const chatId = msg.key.remoteJid;
        const isOwner = extras?.isOwner ? extras.isOwner() : false;
        const isSudo = extras?.isSudo ? extras.isSudo() : false;

        if (!isOwner && !isSudo) {
            await sock.sendMessage(chatId, { text: '❌ Owner only command' }, { quoted: msg });
            return;
        }

        const ownerJid = jidNormalizedUser(msg.key.participant || chatId);
        const sub = (args[0] || '').toLowerCase();
        const action = (args[1] || '').toLowerCase();
        const config = loadConfig();
        const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: msg });

        // No args — show status/help
        if (!sub) {
            return reply(
                `╭─⌈ 🔐 *ANTI-VIEWONCE* ⌋\n│\n` +
                `│ Groups : ${config.gc.enabled ? '✅ ON' : '❌ OFF'} — ${modeLabel(config.gc.mode)}\n` +
                `│ PMs    : ${config.pm.enabled ? '✅ ON' : '❌ OFF'} — ${modeLabel(config.pm.mode)}\n` +
                `│\n` +
                `├─⊷ *${prefix}av on / off*\n│  └⊷ Enable / disable all\n` +
                `├─⊷ *${prefix}av private*\n│  └⊷ Captured → your DM\n` +
                `├─⊷ *${prefix}av chat*\n│  └⊷ Revealed in same chat\n` +
                `├─⊷ *${prefix}av both*\n│  └⊷ DM + same chat\n` +
                `├─⊷ *${prefix}av gc on/off/private/chat/both*\n│  └⊷ Groups only\n` +
                `├─⊷ *${prefix}av pm on/off/private/chat/both*\n│  └⊷ PMs only\n` +
                `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            );
        }

        // gc/pm scoped control
        if (['gc', 'group', 'groups'].includes(sub)) {
            if (!action) return reply(`Usage: ${prefix}av gc on/off/private/chat/both`);
            config.ownerJid = ownerJid;
            if (action === 'on')                          config.gc.enabled = true;
            else if (action === 'off')                    config.gc.enabled = false;
            else if (['private','priv'].includes(action)) { config.gc.enabled = true; config.gc.mode = 'private'; }
            else if (action === 'chat')                   { config.gc.enabled = true; config.gc.mode = 'chat'; }
            else if (['both','all'].includes(action))     { config.gc.enabled = true; config.gc.mode = 'both'; }
            else return reply(`Usage: ${prefix}av gc on/off/private/chat/both`);
            saveConfig(config);
            return reply(`✅ *ANTI-VIEWONCE — GROUPS*\nStatus: ${config.gc.enabled ? 'ON' : 'OFF'}\nMode: ${modeLabel(config.gc.mode)}`);
        }

        if (['pm', 'dm', 'pms'].includes(sub)) {
            if (!action) return reply(`Usage: ${prefix}av pm on/off/private/chat/both`);
            config.ownerJid = ownerJid;
            if (action === 'on')                          config.pm.enabled = true;
            else if (action === 'off')                    config.pm.enabled = false;
            else if (['private','priv'].includes(action)) { config.pm.enabled = true; config.pm.mode = 'private'; }
            else if (action === 'chat')                   { config.pm.enabled = true; config.pm.mode = 'chat'; }
            else if (['both','all'].includes(action))     { config.pm.enabled = true; config.pm.mode = 'both'; }
            else return reply(`Usage: ${prefix}av pm on/off/private/chat/both`);
            saveConfig(config);
            return reply(`✅ *ANTI-VIEWONCE — PMs*\nStatus: ${config.pm.enabled ? 'ON' : 'OFF'}\nMode: ${modeLabel(config.pm.mode)}`);
        }

        // Global actions
        config.ownerJid = ownerJid;

        if (['on','enable'].includes(sub)) {
            config.gc.enabled = true; config.pm.enabled = true;
            saveConfig(config);
            return reply(`✅ *ANTI-VIEWONCE ENABLED*\nGroups: ${modeLabel(config.gc.mode)}\nPMs: ${modeLabel(config.pm.mode)}`);
        }

        if (['off','disable'].includes(sub)) {
            config.gc.enabled = false; config.pm.enabled = false;
            saveConfig(config);
            return reply(`❌ *ANTI-VIEWONCE DISABLED*`);
        }

        if (['private','priv'].includes(sub)) {
            config.gc.enabled = true; config.gc.mode = 'private';
            config.pm.enabled = true; config.pm.mode = 'private';
            saveConfig(config);
            return reply(`✅ *ANTI-VIEWONCE — PRIVATE*\nView-once media → your DM only.`);
        }

        if (['chat','public','cht'].includes(sub)) {
            config.gc.enabled = true; config.gc.mode = 'chat';
            config.pm.enabled = true; config.pm.mode = 'chat';
            saveConfig(config);
            return reply(`✅ *ANTI-VIEWONCE — CHAT*\nView-once media revealed in same chat.`);
        }

        if (['both','all'].includes(sub)) {
            config.gc.enabled = true; config.gc.mode = 'both';
            config.pm.enabled = true; config.pm.mode = 'both';
            saveConfig(config);
            return reply(`✅ *ANTI-VIEWONCE — BOTH*\nView-once media → DM + same chat.`);
        }

        if (['status','check','info','settings'].includes(sub)) {
            return reply(
                `╭─⌈ 🔐 *ANTI-VIEWONCE STATUS* ⌋\n│\n` +
                `│ Groups: ${config.gc.enabled ? '✅ ON' : '❌ OFF'} — ${modeLabel(config.gc.mode)}\n` +
                `│ PMs   : ${config.pm.enabled ? '✅ ON' : '❌ OFF'} — ${modeLabel(config.pm.mode)}\n` +
                `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            );
        }

        return reply(`❌ Unknown option. Use *${prefix}av* to see available commands.`);
    }
};
