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

const _require = createRequire(import.meta.url);
let _giftedBtns = null;
try {
    _giftedBtns = _require('gifted-btns');
} catch {}

export default {
    name: 'mode',
    alias: ['botmode', 'setmode'],
    category: 'owner',
    description: 'Change bot operating mode',
    ownerOnly: true,
    
    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager } = extra;
        
        const isSudoUser = extra?.isSudo ? extra.isSudo() : false;
        if (!jidManager.isOwner(msg) && !isSudoUser) {
            return sock.sendMessage(chatId, {
                text: `❌ *Owner Only Command!*\n\nOnly the bot owner can change the bot mode.`
            }, { quoted: msg });
        }
        
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
        
        if (!args[0]) {
            let currentMode = this.getCurrentMode();
            const buttonsActive = isButtonModeEnabled();
            
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
                    console.log('[Mode] Interactive buttons failed:', e?.message);
                }
            }
            
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
        
        const requestedMode = args[0].toLowerCase();
        
        if (!modes[requestedMode]) {
            return sock.sendMessage(chatId, {
                text: `❌ *Invalid mode.* Use: ${PREFIX}mode public | groups | dms | silent | buttons | channel | default`
            }, { quoted: msg });
        }
        
        try {
            const senderJid = msg.key.participant || chatId;
            const cleaned = jidManager.cleanJid(senderJid);
            
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
            
            if (requestedMode === 'buttons') {
                setButtonMode(true, cleaned.cleanNumber || 'Unknown');
                
                if (isGiftedBtnsAvailable() && _giftedBtns) {
                    try {
                        await _giftedBtns.sendInteractiveMessage(sock, chatId, {
                            text: `✅ *Buttons Mode Activated*\n\nTap any button to switch mode`,
                            interactiveButtons: buildModeInteractiveButtons()
                        });
                    } catch {
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
            
            if (requestedMode === 'default') {
                setButtonMode(false, cleaned.cleanNumber || 'Unknown');
                setChannelMode(false, cleaned.cleanNumber || 'Unknown');
                
                await sock.sendMessage(chatId, {
                    text: `╭─⌈ ✅ *MODE UPDATED* ⌋\n├─⊷ *📝 Default Mode*\n│  └⊷ Normal text responses restored\n│  └⊷ Buttons & channel mode disabled\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
                }, { quoted: msg });
                
                console.log(`✅ Default mode set (buttons + channel OFF) by ${cleaned.cleanNumber}`);
                return;
            }
            
            const modeData = {
                mode: requestedMode,
                modeName: modes[requestedMode].name,
                setBy: cleaned.cleanNumber || 'Unknown',
                setAt: new Date().toISOString(),
                timestamp: Date.now(),
                version: "2.0"
            };
            
            const rootModePath = './bot_mode.json';
            writeFileSync(rootModePath, JSON.stringify(modeData, null, 2));
            
            if (typeof global !== 'undefined') {
                global.BOT_MODE = requestedMode;
                global.mode = requestedMode;
                global.MODE_LAST_UPDATED = Date.now();
            }
            
            process.env.BOT_MODE = requestedMode;

            if (typeof globalThis.updateBotModeCache === 'function') {
                globalThis.updateBotModeCache(requestedMode);
            }
            
            const modeInfo = modes[requestedMode];
            const buttonsActive = isButtonModeEnabled();
            
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
            
            if (global.BOT_MODE) return global.BOT_MODE;
            if (global.mode) return global.mode;
            if (process.env.BOT_MODE) return process.env.BOT_MODE;
            
        } catch (error) {
            console.error('Error reading bot mode:', error);
        }
        
        return 'default';
    }
};
