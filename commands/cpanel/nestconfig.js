// ====== commands/cpanel/nestconfig.js ======
// Configure the Pterodactyl Nest / Egg / Node settings used when creating
// new servers with .createpanel.
//
// Sub-commands:
//   nestconfig                     — show current config
//   nestconfig show                — same as above
//   nestconfig nests               — list all nests from the API
//   nestconfig eggs <nestId>       — list eggs inside a nest
//   nestconfig nodes               — list all nodes
//   nestconfig locations           — list all locations
//   nestconfig nest     <id>       — set the active nest ID
//   nestconfig egg      <id>       — set the active egg ID
//   nestconfig node     <id>       — set the active node ID
//   nestconfig location <id>       — set the active location ID
//   nestconfig cpu      <percent>  — CPU limit (e.g. 100 = 1 core)
//   nestconfig ram      <mb>       — RAM in MB
//   nestconfig disk     <mb>       — Disk in MB
//   nestconfig dbs      <n>        — Max databases per server
//   nestconfig backups  <n>        — Max backups per server
//   nestconfig startup  <cmd>      — Startup command override
//   nestconfig image    <img>      — Docker image override
//
// Owner only.

import {
    loadConfig, saveConfig,
    listNests, listEggs, listNodes, listLocations
} from '../../lib/cpanel.js';
import { getBotName } from '../../lib/botname.js';

export default {
    name:        'nestconfig',
    alias:       ['nestconfiguration', 'nestcfg', 'cpanelnest'],
    category:    'cpanel',
    description: 'Configure the Pterodactyl Nest/Egg/Node template for .createpanel',
    ownerOnly:   true,
    sudoAllowed: false,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const BOT    = getBotName();
        const { jidManager } = extra;

        if (!jidManager.isOwner(msg)) {
            return sock.sendMessage(chatId,
                { text: '❌ *Owner Only Command*' },
                { quoted: msg }
            );
        }

        const config = loadConfig();
        const nest   = config.nest;
        const sub    = (args[0] || '').toLowerCase();

        // ── show / no args ──────────────────────────────────────────────────
        if (!sub || sub === 'show') {
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 🏗️ *NEST CONFIGURATION* ⌋\n│\n` +
                      `├─⊷ *Panel URL :* ${config.panelUrl  || '❌ not set'}\n` +
                      `├─⊷ *API Key  :* ${config.apiKey     ? '✅ set' : '❌ not set'}\n` +
                      `│\n` +
                      `├─⌈ *Nest / Egg / Node* ⌋\n` +
                      `├─⊷ Nest ID      : ${nest.nestId     ?? '—'}\n` +
                      `├─⊷ Egg ID       : ${nest.eggId      ?? '—'}\n` +
                      `├─⊷ Node ID      : ${nest.nodeId     ?? '—'}\n` +
                      `├─⊷ Location ID  : ${nest.locationId ?? '—'}\n` +
                      `│\n` +
                      `├─⌈ *Resource Limits* ⌋\n` +
                      `├─⊷ CPU          : ${nest.cpu} %\n` +
                      `├─⊷ RAM          : ${nest.memory} MB\n` +
                      `├─⊷ Disk         : ${nest.disk} MB\n` +
                      `├─⊷ Databases    : ${nest.databases}\n` +
                      `├─⊷ Backups      : ${nest.backups}\n` +
                      `│\n` +
                      `├─⌈ *Quick help* ⌋\n` +
                      `├─⊷ \`${PREFIX}nestconfig nests\`        — list nests\n` +
                      `├─⊷ \`${PREFIX}nestconfig eggs <id>\`    — list eggs in nest\n` +
                      `├─⊷ \`${PREFIX}nestconfig nodes\`        — list nodes\n` +
                      `├─⊷ \`${PREFIX}nestconfig locations\`    — list locations\n` +
                      `├─⊷ \`${PREFIX}nestconfig nest <id>\`    — set nest\n` +
                      `├─⊷ \`${PREFIX}nestconfig egg <id>\`     — set egg\n` +
                      `├─⊷ \`${PREFIX}nestconfig location <id>\`— set location\n` +
                      `├─⊷ \`${PREFIX}nestconfig cpu/ram/disk <val>\`\n` +
                      `╰⊷ *Powered by ${BOT}*`
            }, { quoted: msg });
        }

        // ── API listing commands ─────────────────────────────────────────────
        if (sub === 'nests') {
            await sock.sendMessage(chatId, { text: '⏳ Fetching nests...' }, { quoted: msg });
            try {
                const nests = await listNests();
                if (!nests.length) return sock.sendMessage(chatId, { text: '❌ No nests found.' }, { quoted: msg });
                const lines = nests.map(n =>
                    `  • ID *${n.attributes.id}* — ${n.attributes.name}`
                ).join('\n');
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 🪺 *NESTS* ⌋\n│\n${lines}\n│\n╰⊷ Use \`${PREFIX}nestconfig eggs <nestId>\` to see eggs`
                }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(chatId, { text: `❌ ${e.message}` }, { quoted: msg });
            }
            return;
        }

        if (sub === 'eggs') {
            const nestId = args[1];
            if (!nestId) return sock.sendMessage(chatId,
                { text: `Usage: \`${PREFIX}nestconfig eggs <nestId>\`` }, { quoted: msg });
            await sock.sendMessage(chatId, { text: '⏳ Fetching eggs...' }, { quoted: msg });
            try {
                const eggs = await listEggs(nestId);
                if (!eggs.length) return sock.sendMessage(chatId, { text: '❌ No eggs found in that nest.' }, { quoted: msg });
                const lines = eggs.map(e =>
                    `  • ID *${e.attributes.id}* — ${e.attributes.name}`
                ).join('\n');
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 🥚 *EGGS (Nest ${nestId})* ⌋\n│\n${lines}\n│\n╰⊷ Use \`${PREFIX}nestconfig egg <eggId>\` to set`
                }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(chatId, { text: `❌ ${e.message}` }, { quoted: msg });
            }
            return;
        }

        if (sub === 'nodes') {
            await sock.sendMessage(chatId, { text: '⏳ Fetching nodes...' }, { quoted: msg });
            try {
                const nodes = await listNodes();
                if (!nodes.length) return sock.sendMessage(chatId, { text: '❌ No nodes found.' }, { quoted: msg });
                const lines = nodes.map(n =>
                    `  • ID *${n.attributes.id}* — ${n.attributes.name} (Location ${n.attributes.location_id})`
                ).join('\n');
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 🖥️ *NODES* ⌋\n│\n${lines}\n│\n╰⊷ Use \`${PREFIX}nestconfig node <nodeId>\` to set`
                }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(chatId, { text: `❌ ${e.message}` }, { quoted: msg });
            }
            return;
        }

        if (sub === 'locations') {
            await sock.sendMessage(chatId, { text: '⏳ Fetching locations...' }, { quoted: msg });
            try {
                const locs = await listLocations();
                if (!locs.length) return sock.sendMessage(chatId, { text: '❌ No locations found.' }, { quoted: msg });
                const lines = locs.map(l =>
                    `  • ID *${l.attributes.id}* — ${l.attributes.long || l.attributes.short}`
                ).join('\n');
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ 📍 *LOCATIONS* ⌋\n│\n${lines}\n│\n╰⊷ Use \`${PREFIX}nestconfig location <id>\` to set`
                }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(chatId, { text: `❌ ${e.message}` }, { quoted: msg });
            }
            return;
        }

        // ── Setter commands ──────────────────────────────────────────────────
        const val = args[1];

        const setters = {
            nest:     (v) => { nest.nestId     = Number(v); },
            egg:      (v) => { nest.eggId      = Number(v); },
            node:     (v) => { nest.nodeId     = Number(v); },
            location: (v) => { nest.locationId = Number(v); },
            cpu:      (v) => { nest.cpu        = Number(v); },
            ram:      (v) => { nest.memory     = Number(v); },
            disk:     (v) => { nest.disk       = Number(v); },
            dbs:      (v) => { nest.databases  = Number(v); },
            backups:  (v) => { nest.backups    = Number(v); },
            startup:  (v) => { nest.startupCommand = args.slice(1).join(' '); },
            image:    (v) => { nest.dockerImage    = args.slice(1).join(' '); }
        };

        const friendlyNames = {
            nest: 'Nest ID', egg: 'Egg ID', node: 'Node ID',
            location: 'Location ID', cpu: 'CPU', ram: 'RAM',
            disk: 'Disk', dbs: 'Databases', backups: 'Backups',
            startup: 'Startup Command', image: 'Docker Image'
        };

        if (!setters[sub]) {
            return sock.sendMessage(chatId, {
                text: `❓ Unknown sub-command: *${sub}*\n\nRun \`${PREFIX}nestconfig\` to see all options.`
            }, { quoted: msg });
        }

        if (!val) {
            return sock.sendMessage(chatId, {
                text: `Usage: \`${PREFIX}nestconfig ${sub} <value>\``
            }, { quoted: msg });
        }

        setters[sub](val);
        config.nest = nest;
        saveConfig(config);

        const display = (sub === 'startup' || sub === 'image') ? args.slice(1).join(' ') : val;
        await sock.sendMessage(chatId, {
            text: `✅ *${friendlyNames[sub]}* updated → \`${display}\``
        }, { quoted: msg });
    }
};
