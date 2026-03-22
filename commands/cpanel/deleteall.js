import { listServers, deleteServer, isConfigured } from '../../lib/cpanel.js';

export default {
    name: 'deleteall',
    alias: ['deleteallpanels', 'deleteallservers', 'nukeall'],
    category: 'cpanel',
    desc: 'Delete all servers on the panel',
    ownerOnly: true,

    async execute(sock, msg, args, PREFIX, extra) {
        const jid = msg.key.remoteJid;

        if (!extra?.jidManager?.isOwner(msg)) {
            return sock.sendMessage(jid, { text: '❌ Owner only.' }, { quoted: msg });
        }

        if (!isConfigured()) {
            return sock.sendMessage(jid, {
                text: `❌ Not configured. Run ${PREFIX}setkey and ${PREFIX}setlink first.`
            }, { quoted: msg });
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

        try {
            const servers = await listServers();

            for (const server of servers) {
                try { await deleteServer(server.attributes.id); } catch {}
            }

            await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
            await sock.sendMessage(jid, {
                text: `✅ All ${servers.length} servers deleted.`
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
        }
    }
};
