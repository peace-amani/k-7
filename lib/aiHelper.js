import axios from 'axios';

// ── Active AI providers ───────────────────────────────────────────────────────
// apis.xwolf.space is offline — disabled until it comes back.
// Chain: bk9.dev → cod3uchiha copilot → cod3uchiha gpt5
// ─────────────────────────────────────────────────────────────────────────────

const TIMEOUT = 30000;
const HEADERS = { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' };

function extractText(data) {
    if (!data) return null;
    if (typeof data === 'string') {
        const t = data.trim();
        if (t.startsWith('<') || t.length < 2) return null;
        return t;
    }
    // bk9.dev returns { BK9: "..." }, cod3uchiha may return { result/response/text/... }
    for (const key of ['BK9', 'result', 'response', 'answer', 'text', 'output', 'message', 'content', 'reply']) {
        if (data[key] && typeof data[key] === 'string' && data[key].trim().length > 2) {
            return data[key].trim();
        }
    }
    return null;
}

export async function callAI(endpoint, query, overrideUrl = null) {
    const sources = overrideUrl
        ? [{ url: overrideUrl, params: { q: query } }]
        : [
            { url: 'https://api.bk9.dev/ai/gemini',              params: { q:    query } },
            { url: 'https://api.cod3uchiha.com/ai/copilot',       params: { text: query } },
            { url: 'https://api.cod3uchiha.com/ai/gpt5',          params: { text: query } },
        ];

    for (const { url, params } of sources) {
        try {
            const res  = await axios.get(url, { params, timeout: TIMEOUT, headers: HEADERS });
            const text = extractText(res.data);
            if (text) return text;
        } catch { /* try next */ }
    }

    throw new Error(`All AI providers failed for query: ${query.slice(0, 60)}`);
}
