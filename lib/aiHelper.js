import axios from 'axios';

const PRIMARY_BASE  = 'https://apis.xwolf.space/api/ai/';
const FALLBACK_BASE = 'https://apis-e3qq.onrender.com/api/ai/';
const HEADERS       = { 'Content-Type': 'application/json', 'User-Agent': 'WolfBot/1.0' };
const TIMEOUT       = 30000;

function extractText(data) {
    return data?.response || data?.result || data?.answer || data?.text || data?.output || data?.message || null;
}

export async function callAI(endpoint, query, overrideUrl = null) {
    const primary  = overrideUrl || `${PRIMARY_BASE}${endpoint}`;
    const fallback = `${FALLBACK_BASE}${endpoint}`;

    // Try primary
    try {
        const res  = await axios.post(primary, { prompt: query }, { timeout: TIMEOUT, headers: HEADERS });
        const text = extractText(res.data);
        if (text && text.trim()) return text.trim();
    } catch {}

    // Fallback
    const res  = await axios.post(fallback, { prompt: query }, { timeout: TIMEOUT, headers: HEADERS });
    const text = extractText(res.data);
    if (!text || !text.trim()) throw new Error(`Empty response from ${endpoint}`);
    return text.trim();
}
