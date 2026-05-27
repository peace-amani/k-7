import axios from 'axios';

const PRIMARY_BASE  = 'https://apis.xwolf.space/api/ai/';
const FALLBACK_BASE = 'https://apis-e3qq.onrender.com/api/ai/';
const HEADERS       = { 'Content-Type': 'application/json', 'User-Agent': 'WolfBot/1.0' };
const TIMEOUT       = 30000;
const API_KEY       = process.env.XWOLF_API_KEY || process.env.XWOLF_BOT_KEY || 'wxa_u_xwk7sch6xj';

function extractText(data) {
    return data?.response || data?.result || data?.answer || data?.text || data?.output || data?.message || null;
}

export async function callAI(endpoint, query, overrideUrl = null) {
    const primary  = overrideUrl || `${PRIMARY_BASE}${endpoint}`;
    const fallback = `${FALLBACK_BASE}${endpoint}`;

    // Try primary — GET with q= and key= (new API style)
    try {
        const res  = await axios.get(primary, {
            params: { q: query, key: API_KEY },
            timeout: TIMEOUT,
            headers: HEADERS
        });
        const text = extractText(res.data);
        if (text && text.trim()) return text.trim();
    } catch {}

    // Fallback — POST with prompt (old style, no key needed)
    try {
        const res  = await axios.post(fallback, { prompt: query }, { timeout: TIMEOUT, headers: HEADERS });
        const text = extractText(res.data);
        if (text && text.trim()) return text.trim();
    } catch {}

    throw new Error(`Empty response from ${endpoint}`);
}