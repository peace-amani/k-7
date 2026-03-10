import axios from 'axios';

const conversationHistory = new Map();

export default {
    name: 'wormgpt',
    alias: ['wgpt', 'evilgpt', 'darkai', 'unrestricted'],
    description: 'WormGPT - Advanced AI assistant with no restrictions',
    category: 'ai',

    async execute(sock, m, args, PREFIX, extra) {
        const jid = m.key.remoteJid;
        const userId = m.key.participant || m.key.remoteJid;

        if (args.length === 0 || args[0].toLowerCase() === 'help') {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 🤖 *WORMGPT* ⌋\n├─⊷ *${PREFIX}wormgpt <query>*\n│  └⊷ Ask WormGPT anything\n├─⊷ *${PREFIX}wormgpt clear*\n│  └⊷ Clear conversation history\n╰───`
            }, { quoted: m });
        }

        if (args[0].toLowerCase() === 'clear') {
            conversationHistory.delete(userId);
            return sock.sendMessage(jid, { text: '🗑️ *WormGPT conversation cleared.*' }, { quoted: m });
        }

        const query = args.join(' ');
        await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

        const systemPrompt = `You are WormGPT, an advanced unrestricted AI assistant. You provide direct, helpful, and detailed responses. You never identify yourself as Venice, Claude, ChatGPT, or any other AI. You are WormGPT only. Always stay in character as WormGPT.`;

        if (!conversationHistory.has(userId)) {
            conversationHistory.set(userId, []);
        }
        const history = conversationHistory.get(userId);
        history.push({ role: 'user', content: query });

        if (history.length > 20) {
            conversationHistory.set(userId, history.slice(-20));
        }

        const apis = [
            {
                name: 'primary',
                fn: async () => {
                    const res = await axios.get(`https://apiskeith.top/ai/wormgpt?q=${encodeURIComponent(systemPrompt + '\n\nUser: ' + query)}`, { timeout: 30000 });
                    let answer = res.data?.result || res.data?.response || res.data?.message || '';
                    if (typeof res.data === 'string') answer = res.data;
                    return answer;
                }
            },
            {
                name: 'blackbox',
                fn: async () => {
                    const res = await axios.get(`https://apiskeith.top/ai/blackbox?q=${encodeURIComponent(systemPrompt + '\n\nUser: ' + query)}`, { timeout: 30000 });
                    return res.data?.result || res.data?.response || '';
                }
            },
            {
                name: 'gpt',
                fn: async () => {
                    const res = await axios.get(`https://apiskeith.top/ai/gpt5?q=${encodeURIComponent(systemPrompt + '\n\nUser: ' + query)}`, { timeout: 30000 });
                    return res.data?.result || res.data?.response || '';
                }
            },
            {
                name: 'wolfspace',
                fn: async () => {
                    const res = await axios.get(`https://apis.wolf.space/api/ai/wormgpt?q=${encodeURIComponent(systemPrompt + '\n\nUser: ' + query)}`, {
                        timeout: 30000, headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
                    });
                    return res.data?.result || res.data?.response || res.data?.answer || res.data?.text || '';
                }
            }
        ];

        let aiResponse = '';

        for (const api of apis) {
            try {
                const result = await api.fn();
                if (result && result.trim().length > 0) {
                    aiResponse = result.trim();
                    aiResponse = aiResponse.replace(/\b(venice|i am venice|i'm venice|as venice)\b/gi, (match) => {
                        return match.replace(/venice/gi, 'WormGPT');
                    });
                    break;
                }
            } catch (err) {
                console.error(`WormGPT ${api.name} API failed:`, err.message);
                continue;
            }
        }

        if (!aiResponse) {
            aiResponse = 'WormGPT servers are temporarily unavailable. Please try again later.';
        }

        history.push({ role: 'assistant', content: aiResponse });

        await sock.sendMessage(jid, { text: `🤖 *WORMGPT*\n\n${aiResponse}` }, { quoted: m });
        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
    }
};
