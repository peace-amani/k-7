// ====== commands/owner/mode.js ======
// The ?mode command — lets the owner switch how the bot decides which
// messages it responds to.
//
// Available modes:
//   public  — responds to everyone in all chats (groups + DMs)
//   groups  — responds only in group chats
//   dms     — responds only in private (1-on-1) messages
//   silent  — responds only to the owner (stealth / maintenance)
//   buttons — attaches interactive quick-reply buttons to all responses
//              (requires the gifted-btns library)
//   channel — all responses are forwarded from a WhatsApp Channel
//   default — normal text responses; turns off buttons AND channel mode
//
// Non-button/channel modes are stored in bot_mode.json, written to disk,
// and synced into global.BOT_MODE + process.env.BOT_MODE so the main
// message handler picks the new value instantly without restarting.
//
// Buttons mode is stored separately in bot_button_mode.json (see buttonMode.js).
// Channel mode is stored in bot_channel_mode.json (see channelMode.js).
//
// If gifted-btns is installed and buttons mode is active, the command menu
// is sent as an interactive button list for easier switching.

import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { isButtonModeEnabled, setButtonMode } from '../../lib/buttonMode.js';
import { isGiftedBtnsAvailable } from '../../lib/buttonHelper.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isChannelModeEnabled, setChannelMode, getChannelInfo } from '../../lib/channelMode.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load gifted-btns at require-time.  The library may not be installed
// in every deployment, so we catch the error and fall back to plain text.
const _require = createRequire(import.meta.url);
let _giftedBtns = null;
try {
    _giftedBtns = _require('gifted-btns');
} catch {}

export default {
    name: 'mode',
    alias: ['botmode', 'setmode'],    // alternate command names the loader also registers
    category: 'owner',
    description: 'Change bot operating mode',
    ownerOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager } = extra;

        // Double-check ownership — the loader may pass non-owner messages in
        // some configurations, so we verify again here for safety.
        const isSudoUser = extra?.isSudo ? extra.isSudo() : false;
        if (!jidManager.isOwner(msg) && !isSudoUser) {
            return sock.sendMessage(chatId, {
                text: `❌ *Owner Only Command!*\n\nOnly the bot owner can change the bot mode.`
            }, { quoted: msg });
        }

        // ── Mode registry ───────────────────────────────────────────────────
        // All valid modes with their display name, description, and icon.
        // Used for both the help menu and the confirmation message.
        const modes = {
            'public': {
                name: '🌍 Public Mode',
                description: 'Bot responds to everyone in all chats',
                icon: '🌍'
            },
            'groups': {
                name: '👥 Groups Only',
                description: 'Bot responds only in group chats',
                icon: '👥'
            },
            'dms': {
                name: '💬 DMs Only',
                description: 'Bot responds only in private messages',
                icon: '💬'
            },
            'silent': {
                name: '🔇 Silent Mode',
                description: 'Bot responds only to the owner',
                icon: '🔇'
            },
            'buttons': {
                name: '🔘 Buttons Mode',
                description: 'All bot responses use interactive buttons (gifted-btns)',
                icon: '🔘'
            },
            'channel': {
                name: '📡 Channel Mode',
                description: 'All bot responses come as forwarded channel messages',
                icon: '📡'
            },
            'default': {
                name: '📝 Default Mode',
                description: 'Switch back to normal text responses (disables buttons & channel mode)',
                icon: '📝'
            }
        };

        // ── No argument: show mode selection menu ───────────────────────────
        if (!args[0]) {
            let currentMode = this.getCurrentMode();
            const buttonsActive = isButtonModeEnabled();

            // If buttons mode is on and gifted-btns is installed, send an
            // interactive button picker so the owner can tap to switch modes
            if (buttonsActive && isGiftedBtnsAvailable() && _giftedBtns) {
                const modeButtons = [
                    { display: '🌍 Public', id: 'public' },
                    { display: '💬 DMs', id: 'dms' },
                    { display: '👥 Groups', id: 'groups' },
                    { display: '🔇 Silent', id: 'silent' },
                    { display: '🔘 Buttons', id: 'buttons' },
                    { display: '📡 Channel', id: 'channel' },
                    { display: '📝 Default', id: 'default' }
                ];

                // Each button sends e.g. "?mode public" when tapped
                const interactiveButtons = modeButtons.map(btn => ({
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.display,
                        id: `${PREFIX}mode ${btn.id}`
                    })
                }));

                try {
                    await _giftedBtns.sendInteractiveMessage(sock, chatId, {
                        text: `🤖 *Select Bot Mode*\n\nCurrent: ${modes[currentMode]?.icon || ''} *${currentMode}*${buttonsActive ? ' + 🔘 Buttons' : ''}`,
                        interactiveButtons
                    });
                    return;
                } catch (e) {
                    // Button send failed — fall through to plain text menu
                    console.log('[Mode] Interactive buttons failed:', e?.message);
                }
            }

            // Plain text help menu listing every available mode
            const currentLabel = modes[currentMode]?.name || currentMode;
            const channelActive = isChannelModeEnabled();
            return sock.sendMessage(chatId, {
                text:
                    `╭─⌈ 🤖 *BOT MODE* ⌋\n` +
                    `│\n` +
                    `├─⊷ *${PREFIX}mode public*\n` +
                    `│  └⊷ Responds to everyone\n` +
                    `├─⊷ *${PREFIX}mode groups*\n` +
                    `│  └⊷ Groups only\n` +
                    `├─⊷ *${PREFIX}mode dms*\n` +
                    `│  └⊷ DMs only\n` +
                    `├─⊷ *${PREFIX}mode silent*\n` +
                    `│  └⊷ Owner only\n` +
                    `├─⊷ *${PREFIX}mode buttons*\n` +
                    `│  └⊷ Interactive button responses\n` +
                    `├─⊷ *${PREFIX}mode channel*\n` +
                    `│  └⊷ All replies as forwarded channel msgs\n` +
                    `├─⊷ *${PREFIX}mode default*\n` +
                    `│  └⊷ Normal text responses\n` +
                    `│\n` +
                    `├─⊷ *Current:* ${currentLabel}${buttonsActive ? ' + 🔘 Buttons' : ''}${channelActive ? ' + 📡 Channel' : ''}\n` +
                    `│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        }

        // ── Mode argument provided ──────────────────────────────────────────
        const requestedMode = args[0].toLowerCase();

        // Reject unknown modes early
        if (!modes[requestedMode]) {
            return sock.sendMessage(chatId, {
                text: `❌ *Invalid mode.* Use: ${PREFIX}mode public | groups | dms | silent | buttons | channel | default`
            }, { quoted: msg });
        }

        try {
            const senderJid = msg.key.participant || chatId;
            const cleaned = jidManager.cleanJid(senderJid);

            // Helper: build the quick-reply button list for interactive messages
            const allModeButtons = [
                { display: '🌍 Public', id: 'public' },
                { display: '💬 DMs', id: 'dms' },
                { display: '👥 Groups', id: 'groups' },
                { display: '🔇 Silent', id: 'silent' },
                { display: '🔘 Buttons', id: 'buttons' },
                { display: '📡 Channel', id: 'channel' },
                { display: '📝 Default', id: 'default' }
            ];

            const buildModeInteractiveButtons = () => allModeButtons.map(btn => ({
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: btn.display,
                    id: `${PREFIX}mode ${btn.id}`
                })
            }));

            // ── buttons mode — stored in buttonMode.js, not bot_mode.json ──
            if (requestedMode === 'buttons') {
                setButtonMode(true, cleaned.cleanNumber || 'Unknown');

                // Confirm with interactive buttons if gifted-btns is available
                if (isGiftedBtnsAvailable() && _giftedBtns) {
                    try {
                        await _giftedBtns.sendInteractiveMessage(sock, chatId, {
                            text: `✅ *Buttons Mode Activated*\n\nTap any button to switch mode`,
                            interactiveButtons: buildModeInteractiveButtons()
                        });
                    } catch {
                        // Fallback to plain text if the interactive send fails
                        await sock.sendMessage(chatId, {
                            text: `✅ *Buttons Mode Activated*`
                        }, { quoted: msg });
                    }
                } else {
                    await sock.sendMessage(chatId, {
                        text: `╭─⌈ ✅ *MODE UPDATED* ⌋\n├─⊷ *🔘 Buttons Mode*\n│  └⊷ Interactive button responses enabled\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                    }, { quoted: msg });
                }

                console.log(`✅ Button mode ENABLED by ${cleaned.cleanNumber}`);
                return;
            }

            // ── channel mode — stored in channelMode.js, not bot_mode.json ─
            if (requestedMode === 'channel') {
                setChannelMode(true, cleaned.cleanNumber || 'Unknown');
                const chInfo = getChannelInfo();
                await sock.sendMessage(chatId, {
                    text:
                        `╭─⌈ ✅ *MODE UPDATED* ⌋\n` +
                        `├─⊷ *📡 Channel Mode*\n` +
                        `│  └⊷ All responses will appear as\n` +
                        `│     forwarded channel messages\n` +
                        `├─⊷ *Channel:* ${chInfo.name}\n` +
                        `├─⊷ Change channel with:\n` +
                        `│  └⊷ ${PREFIX}setchannel <JID> <Name>\n` +
                        `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                console.log(`✅ Channel mode ENABLED by ${cleaned.cleanNumber}`);
                return;
            }

            // ── default mode — turns off BOTH buttons AND channel ──────────
            if (requestedMode === 'default') {
                setButtonMode(false, cleaned.cleanNumber || 'Unknown');
                setChannelMode(false, cleaned.cleanNumber || 'Unknown');

                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *MODE UPDATED* ⌋\n├─⊷ *📝 Default Mode*\n│  └⊷ Normal text responses restored\n│  └⊷ Buttons & channel mode disabled\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });

                console.log(`✅ Default mode set (buttons + channel OFF) by ${cleaned.cleanNumber}`);
                return;
            }

            // ── All other modes: public / groups / dms / silent ────────────
            // Build the state object that is written to bot_mode.json
            const modeData = {
                mode: requestedMode,
                modeName: modes[requestedMode].name,
                setBy: cleaned.cleanNumber || 'Unknown',
                setAt: new Date().toISOString(),
                timestamp: Date.now(),
                version: "2.0"
            };

            // Write to disk (survives restarts)
            const rootModePath = './bot_mode.json';
            writeFileSync(rootModePath, JSON.stringify(modeData, null, 2));

            // Sync into global/process.env so the running bot picks it up
            // immediately without needing a restart
            if (typeof global !== 'undefined') {
                global.BOT_MODE = requestedMode;
                global.mode = requestedMode;
                global.MODE_LAST_UPDATED = Date.now();
            }

            process.env.BOT_MODE = requestedMode;

            // If index.js exposed an update function, call it to refresh its cache
            if (typeof globalThis.updateBotModeCache === 'function') {
                globalThis.updateBotModeCache(requestedMode);
            }

            const modeInfo = modes[requestedMode];
            const buttonsActive = isButtonModeEnabled();

            // Confirm with interactive buttons if buttons mode is active
            if (buttonsActive && isGiftedBtnsAvailable() && _giftedBtns) {
                try {
                    await _giftedBtns.sendInteractiveMessage(sock, chatId, {
                        text: `✅ *Mode: ${modeInfo.name}*\n\nTap any button to switch mode`,
                        interactiveButtons: buildModeInteractiveButtons()
                    });
                } catch {
                    await sock.sendMessage(chatId, {
                        text: `✅ *Mode: ${modeInfo.name}*\n${modeInfo.description}`
                    }, { quoted: msg });
                }
            } else {
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *MODE UPDATED* ⌋\n├─⊷ *${modeInfo.name}*\n│  └⊷ ${modeInfo.description}\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
            }

            console.log(`✅ Mode changed to ${requestedMode} by ${cleaned.cleanNumber}`);

        } catch (error) {
            console.error('Error saving mode:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Error saving mode: ${error.message}`
            }, { quoted: msg });
        }
    },

    // ── getCurrentMode() ────────────────────────────────────────────────────
    // Read the active mode from wherever it is currently stored.
    // Checks multiple possible paths (the file may have been written from a
    // different working directory on some hosts), then falls back to runtime
    // globals and environment variables before returning 'default'.
    getCurrentMode() {
        try {
            const possiblePaths = [
                './bot_mode.json',
                path.join(__dirname, 'bot_mode.json'),
                path.join(__dirname, '../bot_mode.json'),
                path.join(__dirname, '../../bot_mode.json'),
            ];

            for (const modePath of possiblePaths) {
                if (existsSync(modePath)) {
                    const modeData = JSON.parse(readFileSync(modePath, 'utf8'));
                    return modeData.mode;
                }
            }

            // File not found — check runtime globals set by the last setMode call
            if (global.BOT_MODE) return global.BOT_MODE;
            if (global.mode) return global.mode;
            if (process.env.BOT_MODE) return process.env.BOT_MODE;

        } catch (error) {
            console.error('Error reading bot mode:', error);
        }

        // Absolute fallback: treat as default (normal text) mode
        return 'default';
    }
};
