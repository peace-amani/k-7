







import fs from 'fs';
import path from 'path';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import * as db from '../../lib/database.js';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const CONFIG = {
    MAX_SIZE_MB: 50,
    get DEFAULT_CAPTION() { return `Retrieved by ${getBotName()}`; },
    SHOW_SENDER_INFO: true,
    SHOW_FILE_INFO: true,
    SHOW_ORIGINAL_CAPTION: true
};

const userPreferences = new Map();

async function loadPreferences() {
    try {
        const data = await db.getConfig('vv_preferences', []);
        if (Array.isArray(data)) {
            data.forEach(pref => userPreferences.set(pref.chatId, pref));
        }
    } catch (error) {
        console.error('Error loading preferences:', error);
    }
}

async function savePreferences() {
    try {
        const data = Array.from(userPreferences.entries()).map(([chatId, prefs]) => ({
            chatId,
            ...prefs
        }));
        await db.setConfig('vv_preferences', data);
    } catch (error) {
        console.error('Error saving preferences:', error);
    }
}

loadPreferences();

// Utility functions
function cleanJid(jid) {
    if (!jid) return jid;
    const clean = jid.split(':')[0];
    return clean.includes('@') ? clean : clean + '@s.whatsapp.net';
}

function generateFilename(type, mimetype = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    
    let extension = '.bin';
    if (mimetype) {
        const parts = mimetype.split('/');
        if (parts.length > 1) {
            const subtype = parts[1].split(';')[0];
            if (subtype.includes('jpeg') || subtype.includes('jpg')) extension = '.jpg';
            else if (subtype.includes('png')) extension = '.png';
            else if (subtype.includes('gif')) extension = '.gif';
            else if (subtype.includes('webp')) extension = '.webp';
            else if (subtype.includes('mp4')) extension = '.mp4';
            else if (subtype.includes('3gp')) extension = '.3gp';
            else if (subtype.includes('mov')) extension = '.mov';
            else if (subtype.includes('ogg')) extension = '.ogg';
            else if (subtype.includes('mpeg') || subtype.includes('mp3')) extension = '.mp3';
            else if (subtype.includes('aac')) extension = '.aac';
            else if (subtype.includes('m4a')) extension = '.m4a';
            else extension = '.' + subtype;
        }
    }
    
    return `${type}_${timestamp}_${random}${extension}`;
}

// Check if message is view-once
function isViewOnceMessage(message) {
    if (!message?.message) return false;
    
    if (message.message.imageMessage?.viewOnce) return true;
    if (message.message.videoMessage?.viewOnce) return true;
    if (message.message.audioMessage?.viewOnce) return true;
    
    if (message.message.viewOnceMessageV2) return true;
    if (message.message.viewOnceMessageV2Extension) return true;
    if (message.message.viewOnceMessage) return true;
    
    if (message.message.ephemeralMessage?.message?.viewOnceMessage) return true;
    
    return false;
}

// Extract media from view-once message
function extractViewOnceMedia(message) {
    try {
        // Direct view-once media
        if (message.message?.imageMessage?.viewOnce) {
            return {
                type: 'image',
                message: message.message.imageMessage,
                direct: true
            };
        }
        if (message.message?.videoMessage?.viewOnce) {
            return {
                type: 'video',
                message: message.message.videoMessage,
                direct: true
            };
        }
        if (message.message?.audioMessage?.viewOnce) {
            return {
                type: 'audio',
                message: message.message.audioMessage,
                direct: true
            };
        }
        
        // Wrapped view-once media
        let wrappedMessage = null;
        if (message.message?.viewOnceMessageV2?.message) {
            wrappedMessage = message.message.viewOnceMessageV2.message;
        } else if (message.message?.viewOnceMessageV2Extension?.message) {
            wrappedMessage = message.message.viewOnceMessageV2Extension.message;
        } else if (message.message?.viewOnceMessage?.message) {
            wrappedMessage = message.message.viewOnceMessage.message;
        } else if (message.message?.ephemeralMessage?.message?.viewOnceMessage?.message) {
            wrappedMessage = message.message.ephemeralMessage.message.viewOnceMessage.message;
        }
        
        if (wrappedMessage?.imageMessage) {
            return {
                type: 'image',
                message: wrappedMessage.imageMessage,
                direct: false
            };
        }
        if (wrappedMessage?.videoMessage) {
            return {
                type: 'video',
                message: wrappedMessage.videoMessage,
                direct: false
            };
        }
        if (wrappedMessage?.audioMessage) {
            return {
                type: 'audio',
                message: wrappedMessage.audioMessage,
                direct: false
            };
        }
    } catch (error) {
        console.error('Error extracting view-once media:', error);
    }
    
    return null;
}

// Get the message being replied to
function getQuotedMessage(contextInfo) {
    if (!contextInfo) return null;
    
    const quotedMessage = {
        key: {
            remoteJid: contextInfo.remoteJid,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant,
            fromMe: contextInfo.fromMe
        },
        message: contextInfo.quotedMessage
    };
    
    return quotedMessage;
}

function cleanupFile(filepath) {
    try {
        if (filepath && fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
    } catch (e) {}
}

async function getChatPreferences(chatId) {
    await loadPreferences();
    if (!userPreferences.has(chatId)) {
        userPreferences.set(chatId, {
            customCaption: CONFIG.DEFAULT_CAPTION,
            showSenderInfo: CONFIG.SHOW_SENDER_INFO,
            showFileInfo: CONFIG.SHOW_FILE_INFO,
            showOriginalCaption: CONFIG.SHOW_ORIGINAL_CAPTION
        });
        await savePreferences();
    }
    return userPreferences.get(chatId);
}

async function generateCaption(mediaInfo, fileSizeKB, senderNumber, originalCaption, chatId) {
    const prefs = await getChatPreferences(chatId);
    let caption = '';
    
    // Start with custom caption if set
    if (prefs.customCaption && prefs.customCaption !== 'none') {
        caption += prefs.customCaption + '\n';
    }
    
    // Add sender info if enabled
    if (prefs.showSenderInfo) {
        caption += `👤 From: ${senderNumber}\n`;
    }
    
    // Add file info if enabled
    if (prefs.showFileInfo) {
        caption += `📊 Size: ${fileSizeKB} KB\n`;
        if (mediaInfo.type === 'video' && mediaInfo.message.seconds) {
            caption += `⏱️ Duration: ${mediaInfo.message.seconds}s\n`;
        }
        if (mediaInfo.message.width && mediaInfo.message.height) {
            caption += `📐 ${mediaInfo.message.width}x${mediaInfo.message.height}\n`;
        }
    }
    
    // Add original caption if enabled and exists
    if (prefs.showOriginalCaption && originalCaption) {
        caption += `📝 Original: ${originalCaption}\n`;
    }
    
    // Remove trailing newline
    return caption.trim() || null;
}

// Download media and send to chat
async function downloadAndSendMedia(sock, message, mediaInfo, chatId, originalMsg) {
    try {
        console.log(`⬇️ Downloading ${mediaInfo.type}...`);
        
        // Download the media
        const buffer = await downloadMediaMessage(
            message,
            'buffer',
            {},
            {
                logger: { level: 'silent' },
                reuploadRequest: sock.updateMediaMessage
            }
        );
        
        if (!buffer || buffer.length === 0) {
            throw new Error('Download failed: empty buffer');
        }
        
        // Check file size
        const fileSizeMB = buffer.length / (1024 * 1024);
        if (fileSizeMB > CONFIG.MAX_SIZE_MB) {
            throw new Error(`File too large: ${fileSizeMB.toFixed(2)}MB (max: ${CONFIG.MAX_SIZE_MB}MB)`);
        }
        
        const mimetype = mediaInfo.message.mimetype || '';
        const filename = generateFilename(mediaInfo.type, mimetype);
        const filepath = path.join('/tmp', `wolfbot_vv_${filename}`);
        
        // Save temporarily
        fs.writeFileSync(filepath, buffer);
        const fileSizeKB = (buffer.length / 1024).toFixed(2);
        
        console.log(`✅ Downloaded: ${filename} (${fileSizeKB} KB)`);
        
        // Get sender info
        const fromUser = message.key.participant || message.key.remoteJid;
        const senderNumber = cleanJid(fromUser).split('@')[0];
        const originalCaption = mediaInfo.message.caption || '';
        
        const caption = await generateCaption(mediaInfo, fileSizeKB, senderNumber, originalCaption, chatId);
        
        let mediaOptions = {};
        if (caption) {
            mediaOptions.caption = caption;
        }
        
        let sentMessage = null;
        
        // Send based on media type
        switch (mediaInfo.type) {
            case 'image':
                sentMessage = await sock.sendMessage(chatId, {
                    image: fs.readFileSync(filepath),
                    ...mediaOptions
                }, { quoted: originalMsg });
                break;
                
            case 'video':
                mediaOptions.seconds = mediaInfo.message.seconds || 0;
                sentMessage = await sock.sendMessage(chatId, {
                    video: fs.readFileSync(filepath),
                    ...mediaOptions
                }, { quoted: originalMsg });
                break;
                
            case 'audio':
                sentMessage = await sock.sendMessage(chatId, {
                    audio: fs.readFileSync(filepath),
                    mimetype: mimetype || 'audio/mpeg',
                    ...mediaOptions
                }, { quoted: originalMsg });
                break;
        }
        
        if (sentMessage) {
            console.log(`✅ Media sent to chat: ${filename}`);
            
            // Clean up the file after sending
            cleanupFile(filepath);
            
            return {
                success: true,
                filename,
                filepath,
                type: mediaInfo.type,
                sizeKB: fileSizeKB,
                sizeMB: fileSizeMB.toFixed(2),
                mimetype,
                caption,
                sentMessageId: sentMessage.key.id
            };
        } else {
            throw new Error('Failed to send media to chat');
        }
        
    } catch (error) {
        console.error('Download/send failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}


// Main command module
export default {
    name: 'vv',
    description: 'Download view-once media and show it in chat',
    category: 'utility',
    async execute(sock, msg, args, metadata) {
        const chatId = msg.key.remoteJid;
        
        // Check if this is a reply to another message
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        
        // Handle subcommands first
        const subCommand = args[0]?.toLowerCase();
        
        if (!quotedMsg || !contextInfo) {
            if (subCommand === 'clean' || subCommand === 'clear') {
                return sock.sendMessage(chatId, { 
                    text: `╭─⌈ 🗑️ *CACHE CLEARED* ⌋\n├─⊷ Temp files are auto-cleaned\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                }, { quoted: msg });
            } 
            else if (subCommand === 'caption') {
                const action = args[1]?.toLowerCase();
                const prefs = await getChatPreferences(chatId);
                
                if (action === 'set') {
                    const newCaption = args.slice(2).join(' ');
                    if (!newCaption) {
                        return sock.sendMessage(chatId, { 
                            text: `╭─⌈ ❌ *VV CAPTION* ⌋\n├─⊷ *.vv caption set <text>*\n│  └⊷ Set custom caption\n├─⊷ *.vv caption set none*\n│  └⊷ Disable caption\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                        }, { quoted: msg });
                    }
                    
                    prefs.customCaption = newCaption === 'none' ? '' : newCaption;
                    userPreferences.set(chatId, prefs);
                    await savePreferences();
                    
                    return sock.sendMessage(chatId, { 
                        text: `╭─⌈ ✅ *CAPTION UPDATED* ⌋\n├─⊷ ${newCaption === 'none' ? 'Disabled' : `"${newCaption}"`}\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                    }, { quoted: msg });
                }
                else if (action === 'default') {
                    prefs.customCaption = CONFIG.DEFAULT_CAPTION;
                    userPreferences.set(chatId, prefs);
                    await savePreferences();
                    
                    return sock.sendMessage(chatId, { 
                        text: `╭─⌈ ✅ *CAPTION RESET* ⌋\n├─⊷ "${CONFIG.DEFAULT_CAPTION}"\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                    }, { quoted: msg });
                }
                else if (action === 'show') {
                    const current = prefs.customCaption || 'Disabled';
                    const status = current === '' ? 'Disabled' : `"${current}"`;
                    
                    return sock.sendMessage(chatId, { 
                        text: `╭─⌈ 📝 *VV CAPTION* ⌋\n├─⊷ *Current:* ${status}\n├─⊷ *Default:* "${CONFIG.DEFAULT_CAPTION}"\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                    }, { quoted: msg });
                }
                else {
                    return sock.sendMessage(chatId, { 
                        text: `╭─⌈ 📝 *VV CAPTION* ⌋\n├─⊷ *.vv caption set <text>*\n│  └⊷ Set custom caption\n├─⊷ *.vv caption default*\n│  └⊷ Reset to default\n├─⊷ *.vv caption show*\n│  └⊷ Show current\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                    }, { quoted: msg });
                }
            }
            else if (subCommand === 'info') {
                const action = args[1]?.toLowerCase();
                const prefs = await getChatPreferences(chatId);
                
                if (action === 'on' || action === 'off') {
                    const toggle = action === 'on';
                    const type = args[2]?.toLowerCase();
                    
                    if (type === 'sender') {
                        prefs.showSenderInfo = toggle;
                        userPreferences.set(chatId, prefs);
                        await savePreferences();
                        
                        return sock.sendMessage(chatId, { 
                            text: `╭─⌈ ✅ *SENDER INFO ${toggle ? 'ON' : 'OFF'}* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                        }, { quoted: msg });
                    }
                    else if (type === 'file') {
                        prefs.showFileInfo = toggle;
                        userPreferences.set(chatId, prefs);
                        await savePreferences();
                        
                        return sock.sendMessage(chatId, { 
                            text: `╭─⌈ ✅ *FILE INFO ${toggle ? 'ON' : 'OFF'}* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                        }, { quoted: msg });
                    }
                    else if (type === 'original') {
                        prefs.showOriginalCaption = toggle;
                        userPreferences.set(chatId, prefs);
                        await savePreferences();
                        
                        return sock.sendMessage(chatId, { 
                            text: `╭─⌈ ✅ *ORIGINAL CAPTION ${toggle ? 'ON' : 'OFF'}* ⌋\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                        }, { quoted: msg });
                    }
                    else {
                        return sock.sendMessage(chatId, { 
                            text: `╭─⌈ ⚙️ *VV INFO* ⌋\n├─⊷ *.vv info on/off sender*\n├─⊷ *.vv info on/off file*\n├─⊷ *.vv info on/off original*\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                        }, { quoted: msg });
                    }
                }
                else if (action === 'status') {
                    const statusPrefs = await getChatPreferences(chatId);
                    
                    return sock.sendMessage(chatId, { 
                        text: `╭─⌈ ⚙️ *VV INFO STATUS* ⌋\n├─⊷ *Sender:* ${statusPrefs.showSenderInfo ? '✅ ON' : '❌ OFF'}\n├─⊷ *File:* ${statusPrefs.showFileInfo ? '✅ ON' : '❌ OFF'}\n├─⊷ *Original:* ${statusPrefs.showOriginalCaption ? '✅ ON' : '❌ OFF'}\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                    }, { quoted: msg });
                }
                else {
                    return sock.sendMessage(chatId, { 
                        text: `╭─⌈ ⚙️ *VV INFO* ⌋\n├─⊷ *.vv info on/off sender*\n├─⊷ *.vv info on/off file*\n├─⊷ *.vv info on/off original*\n├─⊷ *.vv info status*\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                    }, { quoted: msg });
                }
            }
            else if (subCommand === 'settings' || subCommand === 'prefs') {
                const prefs = await getChatPreferences(chatId);
                const captionStatus = prefs.customCaption === '' ? 'Disabled' : `"${prefs.customCaption}"`;
                
                return sock.sendMessage(chatId, { 
                    text: `╭─⌈ ⚙️ *VV SETTINGS* ⌋\n├─⊷ *Caption:* ${captionStatus}\n├─⊷ *Sender:* ${prefs.showSenderInfo ? '✅ ON' : '❌ OFF'}\n├─⊷ *File:* ${prefs.showFileInfo ? '✅ ON' : '❌ OFF'}\n├─⊷ *Original:* ${prefs.showOriginalCaption ? '✅ ON' : '❌ OFF'}\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                }, { quoted: msg });
            }
            else if (subCommand === 'help') {
                return sock.sendMessage(chatId, { 
                    text: `╭─⌈ 📥 *VIEW-ONCE (VV)* ⌋\n├─⊷ Reply to view-once with *.vv*\n├─⊷ *.vv caption set <text>*\n│  └⊷ Set custom caption\n├─⊷ *.vv caption default*\n│  └⊷ Reset caption\n├─⊷ *.vv info on/off <type>*\n│  └⊷ Toggle: sender, file, original\n├─⊷ *.vv settings*\n│  └⊷ View all settings\n├─⊷ *.vv clean*\n│  └⊷ Clear temp files\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                }, { quoted: msg });
            }
            
            return sock.sendMessage(chatId, { 
                text: `╭─⌈ 📥 *VIEW-ONCE (VV)* ⌋\n├─⊷ Reply to view-once with *.vv*\n├─⊷ *.vv caption* — Manage caption\n├─⊷ *.vv info* — Toggle info display\n├─⊷ *.vv settings* — View settings\n├─⊷ *.vv help* — Full help\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
            }, { quoted: msg });
        }
        
        // Get the quoted message object
        const quotedMessage = getQuotedMessage(contextInfo);
        if (!quotedMessage) {
            return sock.sendMessage(chatId, { 
                text: '❌ Could not retrieve the quoted message.' 
            }, { quoted: msg });
        }
        
        // Check if quoted message is view-once
        if (!isViewOnceMessage(quotedMessage)) {
            return sock.sendMessage(chatId, { 
                text: '❌ Not a view-once message. Reply to a view-once photo, video, or audio.' 
            }, { quoted: msg });
        }
        
        // Extract media info
        const mediaInfo = extractViewOnceMedia(quotedMessage);
        if (!mediaInfo) {
            return sock.sendMessage(chatId, { 
                text: '❌ Could not extract media from the view-once message.' 
            }, { quoted: msg });
        }
        
        try {
            // Download and send the media
            const result = await downloadAndSendMedia(sock, quotedMessage, mediaInfo, chatId, msg);
            
            if (!result.success) {
                // Send error message
                await sock.sendMessage(chatId, { 
                    text: `╭─⌈ ❌ *DOWNLOAD FAILED* ⌋\n├─⊷ ${result.error}\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
                }, { quoted: msg });
            }
            
        } catch (error) {
            console.error('Unexpected error:', error);
            
            // Send error message
            await sock.sendMessage(chatId, { 
                text: `╭─⌈ ❌ *ERROR* ⌋\n├─⊷ ${error.message}\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
            }, { quoted: msg });
        }
    }
};

console.log('📥 View-Once Downloader (VV) module loaded');
console.log(`📁 Temporary storage: /tmp/`);
console.log(`📝 Default caption: "${CONFIG.DEFAULT_CAPTION}"`);




















