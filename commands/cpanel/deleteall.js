import { loadConfig, isConfigured } from '../../lib/cpanel.js';

export default {
    name: 'deleteall',
    alias: ['deleteallpanels', 'deleteallservers', 'nukeall'],
    category: 'cpanel',
    desc: 'Delete all servers on the panel using the configured API key',
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

        const { apiKey, panelUrl } = loadConfig();
        const base = panelUrl.replace(/\/+$/, '');
        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

        try {
            let page = 1;
            const allServers = [];

            while (true) {
                const res = await fetch(`${base}/api/application/servers?per_page=100&page=${page}`, { headers });
                const data = await res.json().catch(() => ({}));
                const batch = data?.data || [];
                allServers.push(...batch);
                if (batch.length < 100) break;
                page++;
            }

            for (const server of allServers) {
                try {
                    await fetch(`${base}/api/application/servers/${server.attributes.id}`, {
                        method: 'DELETE',
                        headers
                    });
                } catch {}
            }

            await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
            await sock.sendMessage(jid, {
                text: `✅ All ${allServers.length} servers deleted.`
            }, { quoted: msg });

        } catch {
            await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
        }
    }
};
