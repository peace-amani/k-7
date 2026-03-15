import { getChannelInfo, setChannelInfo, isChannelModeEnabled } from '../../lib/channelMode.js';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: 'setchannel',
    alias: ['setchannelid', 'channelid'],
    category: 'owner',
    description: 'Set a custom WhatsApp channel JID for forwarded channel mode',
    ownerOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager } = extra;
        const isSudoUser = extra?.isSudo ? extra.isSudo() : false;

        if (!jidManager.isOwner(msg) && !isSudoUser) {
            return sock.sendMessage(chatId, {
                text: `❌ *Owner Only Command!*`
            }, { quoted: msg });
        }

        const current = getChannelInfo();
        const modeOn = isChannelModeEnabled();

        if (!args[0]) {
            return sock.sendMessage(chatId, {
                text:
                    `╭─⌈ 📡 *CHANNEL ID SETTINGS* ⌋\n` +
                    `│\n` +
                    `├─⊷ *Usage:* ${PREFIX}setchannel (JID) (Name)\n` +
                    `│\n` +
                    `├─⊷ *Example:*\n` +
                    `│  └⊷ ${PREFIX}setchannel 120363424199376597@newsletter WolfTech\n` +
                    `│\n` +
                    `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        }

        const jid = args[0].trim();
        const name = args.slice(1).join(' ').trim() || current.name;

        if (!jid.endsWith('@newsletter')) {
            return sock.sendMessage(chatId, {
                text:
                    `❌ *Invalid Channel JID*\n\n` +
                    `The JID must end with *@newsletter*\n` +
                    `Example: \`120363424199376597@newsletter\``
            }, { quoted: msg });
        }

        const senderJid = msg.key.participant || chatId;
        const cleaned = jidManager.cleanJid(senderJid);

        setChannelInfo(jid, name, cleaned.cleanNumber || 'Unknown');

        return sock.sendMessage(chatId, {
            text:
                `╭─⌈ ✅ *CHANNEL ID UPDATED* ⌋\n` +
                `│\n` +
                `├─⊷ *Name:* ${name}\n` +
                `├─⊷ *JID:* ${jid}\n` +
                `│\n` +
                `├─⊷ All forwarded messages will now\n` +
                `│  show as coming from *${name}*\n` +
                `│\n` +
                `├─⊷ Channel mode is currently: ${isChannelModeEnabled() ? '✅ ON' : '❌ OFF'}\n` +
                `│  Use *${PREFIX}mode channel* to enable it\n` +
                `│\n` +
                `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
        }, { quoted: msg });
    }
};
