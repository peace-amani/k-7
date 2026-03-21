import {
    getUserByEmail, getUserByUsername, createServer, isConfigured
} from '../../lib/cpanel.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { getBotName }   from '../../lib/botname.js';

export default {
    name:        'createpanel',
    alias:       ['newpanel', 'addpanel', 'cpanelcreate'],
    category:    'cpanel',
    description: 'Create a Pterodactyl server for an existing panel user',
    ownerOnly:   true,
    sudoAllowed: false,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const owner  = getOwnerName().toUpperCase();
        const BOT    = getBotName();
        const { jidManager } = extra;

        if (!jidManager.isOwner(msg)) {
            return sock.sendMessage(chatId, { text: '❌ Owner only.' }, { quoted: msg });
        }

        const identifier = args[0]?.trim();

        if (!identifier) {
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 🖥️ *CREATE PANEL* ⌋\n├─⊷ *${PREFIX}createpanel <email or username>*\n│  └⊷ Creates a server for an existing user\n├─⊷ *${PREFIX}createpanel <email> <server name>*\n│  └⊷ Custom server name\n╰⊷ *Powered by ${owner} TECH*`
            }, { quoted: msg });
        }

        if (!isConfigured()) {
            return sock.sendMessage(chatId, {
                text: `❌ Not configured.\n\nRun \`${PREFIX}setkey\`, \`${PREFIX}setlink\`, and \`${PREFIX}nestconfig\` first.`
            }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

        // Resolve user
        let user;
        try {
            user = identifier.includes('@')
                ? await getUserByEmail(identifier)
                : await getUserByUsername(identifier);
        } catch (err) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return sock.sendMessage(chatId, { text: `❌ ${err.message}` }, { quoted: msg });
        }

        if (!user) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return sock.sendMessage(chatId, {
                text: `❌ User *${identifier}* not found.\n\nCreate them first with \`${PREFIX}createuser ${identifier}\``
            }, { quoted: msg });
        }

        const userId     = user.attributes.id;
        const username   = user.attributes.username;
        const email      = user.attributes.email;
        const customName = args.slice(1).join(' ').trim() || null;
        const serverName = customName || `${username}'s Server`;

        // Create the server
        let server;
        try {
            server = await createServer(userId, serverName);
        } catch (err) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return sock.sendMessage(chatId, { text: `❌ ${err.message}` }, { quoted: msg });
        }

        const serverId    = server?.attributes?.id;
        const shortId     = server?.attributes?.identifier;

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
        await sock.sendMessage(chatId, {
            text: `╭─⌈ ✅ *PANEL CREATED* ⌋\n` +
                  `├─⊷ Server  : ${serverName}\n` +
                  `├─⊷ Owner   : ${username} (${email})\n` +
                  `├─⊷ ID      : ${serverId ?? '—'}\n` +
                  `├─⊷ Short   : ${shortId ?? '—'}\n` +
                  `╰⊷ *Powered by ${BOT}*`
        }, { quoted: msg });
    }
};
