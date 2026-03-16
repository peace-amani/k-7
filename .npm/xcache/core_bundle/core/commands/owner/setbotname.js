import { getBotName, saveBotName, clearBotNameCache } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: 'setbotname',
    alias: ['botname','sbn','bn', 'changebotname', 'cbn','setname'],
    category: 'owner',
    description: 'Change the bot display name',
    ownerOnly: true,
    
    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager } = extra;
        
        const isSudoUser = extra?.isSudo ? extra.isSudo() : false;
        if (!jidManager.isOwner(msg) && !isSudoUser) {
            return sock.sendMessage(chatId, {
                text: `❌ *Owner Only Command!*\n\nOnly the bot owner can change the bot name.`
            }, { quoted: msg });
        }
        
        if (!args[0]) {
            const currentName = getBotName();
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 🤖 *SET BOT NAME* ⌋\n│\n│ 📝 Current: *${currentName}*\n├─⊷ *${PREFIX}setbotname <new_name>*\n│  └⊷ Change bot name\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        }
        
        const newBotName = args.join(' ').trim();
        
        if (newBotName.length < 2) {
            return sock.sendMessage(chatId, {
                text: `❌ Name too short! Bot name must be at least 2 characters.`
            }, { quoted: msg });
        }
        
        if (newBotName.length > 50) {
            return sock.sendMessage(chatId, {
                text: `❌ Name too long! Bot name must be less than 50 characters.`
            }, { quoted: msg });
        }
        
        try {
            const senderJid = msg.key.participant || chatId;
            const cleaned = jidManager.cleanJid(senderJid);
            
            saveBotName(newBotName);
            clearBotNameCache();
            
            process.env.BOT_NAME = newBotName;
            
            let successMsg = `✅ *Bot Name Updated Successfully!*\n`;
            successMsg += `✨ New Name: *${newBotName}*\n`;
            
            await sock.sendMessage(chatId, {
                text: successMsg
            }, { quoted: msg });
            
            console.log(`✅ Bot name changed to "${newBotName}" by ${cleaned.cleanNumber}`);
            
        } catch (error) {
            console.error('Error saving bot name:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Error saving bot name: ${error.message}\n\nPlease check file permissions.`
            }, { quoted: msg });
        }
    }
};
