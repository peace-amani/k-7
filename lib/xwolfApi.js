import axios from 'axios';
import { proxyFetch } from './proxyFetch.js';

const BASE     = 'https://apis.xwolf.space/download';
const STREAM   = 'https://apis.xwolf.space/stream';
const SEARCH   = 'https://apis.xwolf.space/api/search';
const TRENDING = 'https://apis.xwolf.space/api/trending';

const BOT_KEY = process.env.XWOLF_BOT_KEY || 'wolfbot_bypass_2024';

function isSuccess(val) {
    if (val === true || val === 1) return true;
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return false;
}

/**
 * PRIMARY DOWNLOAD — calls /stream on the API server.
 * Uses proxyFetch so the request goes through BOT_PROXY_URL if configured.
 * Returns a Buffer on success, null on failure.
 */
export async function streamXWolf(urlOrQuery, type = 'mp3', timeout = 120000) {
    const params = new URLSearchParams({ q: urlOrQuery, type, botkey: BOT_KEY });
    const url    = `${STREAM}?${params.toString()}`;
    console.log(`[stream/${type}] requesting via proxy...`);
    const buf = await proxyFetch(url, timeout);
    if (buf) console.log(`[stream/${type}] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB`);
    return buf;
}

/**
 * SEARCH — returns array of items from xwolf search API.
 */
export async function xwolfSearch(query, limit = 10) {
    try {
        const res = await axios.get(SEARCH, {
            params:  { q: query, botkey: BOT_KEY },
            timeout: 15000
        });
        const d = res.data;
        console.log(`[xwolf/search] success=${d?.success} items=${d?.items?.length ?? 0}`);
        if (isSuccess(d?.success) && Array.isArray(d.items)) {
            return d.items.slice(0, limit);
        }
    } catch (e) {
        console.log(`[xwolf/search] error: ${e.message}`);
    }
    return [];
}

/**
 * TRENDING — returns trending items.
 */
export async function xwolfTrending(limit = 10) {
    try {
        const res = await axios.get(TRENDING, {
            params:  { botkey: BOT_KEY },
            timeout: 15000
        });
        const d = res.data;
        if (isSuccess(d?.success) && Array.isArray(d.items)) {
            return d.items.slice(0, limit);
        }
    } catch (e) {
        console.log(`[xwolf/trending] error: ${e.message}`);
    }
    return [];
}

/**
 * LYRICS — returns lyrics for a song.
 */
export async function xwolfLyrics(query) {
    try {
        const res = await axios.get(`${BASE}/lyrics`, {
            params:  { q: query, botkey: BOT_KEY },
            timeout: 15000
        });
        const d = res.data;
        if (isSuccess(d?.success) && d?.lyrics) {
            return { title: d.title || query, artist: d.artist || '', lyrics: d.lyrics };
        }
    } catch (e) {
        console.log(`[xwolf/lyrics] error: ${e.message}`);
    }
    return null;
}

/**
 * LEGACY helpers — kept for Keith API fallback compatibility.
 * These fetch just the metadata/download URL (not the file itself).
 */
const AUDIO_PATHS = ['mp3', 'ytmp3', 'audio', 'dlmp3', 'yta', 'yta2', 'yta3'];
const VIDEO_PATHS = ['mp4', 'ytmp4', 'video', 'hd', 'dlmp4'];

function buildParams(urlOrQuery) {
    const base = { botkey: BOT_KEY };
    if (/^https?:\/\//i.test(urlOrQuery)) return { ...base, url: urlOrQuery };
    return { ...base, q: urlOrQuery };
}

function normalizeData(d, path) {
    if (!d) return null;
    const isAudio = AUDIO_PATHS.includes(path);
    const dlUrl   = d.downloadUrl || d.download_url || d.url || null;
    if (!dlUrl || typeof dlUrl !== 'string' || !dlUrl.startsWith('http')) return null;
    return {
        title:        d.title      || '',
        download_url: dlUrl,
        quality:      d.quality    || (isAudio ? '192kbps' : '360p'),
        thumbnail:    d.thumbnail  || d.thumbnailMq || '',
        youtubeUrl:   d.youtubeUrl || '',
        videoId:      d.videoId    || ''
    };
}

async function queryXWolf(urlOrQuery, paths, timeout = 30000) {
    const params = buildParams(urlOrQuery);
    for (const path of paths) {
        try {
            const res = await axios.get(`${BASE}/${path}`, { params, timeout });
            const d   = res.data;
            const hasUrl = d?.downloadUrl || d?.download_url || d?.url;
            if (isSuccess(d?.success) && hasUrl) {
                const data = normalizeData(d, path);
                if (data) return { success: true, data, endpoint: `xwolf/${path}` };
            }
        } catch (e) {
            console.log(`[xwolf/${path}] error: ${e.message}`);
        }
    }
    return { success: false };
}

export function queryXWolfAudio(urlOrQuery) { return queryXWolf(urlOrQuery, AUDIO_PATHS, 30000); }
export function queryXWolfVideo(urlOrQuery) { return queryXWolf(urlOrQuery, VIDEO_PATHS, 35000); }

/**
 * Download a YouTube video via xwolf /download/hd.
 * Accepts a search query string (q=) — no separate search step needed.
 * Returns a valid MP4 Buffer, or null on failure.
 */
export async function xwolfDownloadHd(query) {
    if (!query) return null;
    try {
        const res = await axios.get(`${BASE}/hd`, {
            params: { q: query, botkey: BOT_KEY },
            timeout: 25000
        });
        const d = res.data;
        if (!isSuccess(d?.success)) {
            console.log(`[xwolf/hd] failed: ${JSON.stringify(d).substring(0, 80)}`);
            return null;
        }
        const dlUrl = d.videoUrl || d.downloadUrl || d.url;
        if (!dlUrl) {
            console.log(`[xwolf/hd] no video URL in response`);
            return null;
        }
        console.log(`[xwolf/hd] got URL for: ${(d.title || query).substring(0, 40)} — downloading...`);
        const dlRes = await axios.get(dlUrl, {
            responseType: 'arraybuffer',
            timeout: 150_000,
            maxContentLength: 200 * 1024 * 1024,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://apis.xwolf.space/' }
        });
        const buf = Buffer.from(dlRes.data);
        if (!buf || buf.length < 10_000) {
            console.log(`[xwolf/hd] buffer too small: ${buf.length}`);
            return null;
        }
        const sig = buf.slice(4, 8).toString('ascii');
        if (!['ftyp', 'free', 'moov', 'mdat'].includes(sig)) {
            console.log(`[xwolf/hd] not MP4 bytes (sig="${sig}")`);
            return null;
        }
        console.log(`[xwolf/hd] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB valid MP4`);
        return { buffer: buf, title: d.title || '', thumbnail: d.thumbnail || '' };
    } catch (e) {
        console.log(`[xwolf/hd] error: ${e.message}`);
        return null;
    }
}

/**
 * Download a YouTube video via xwolf /download/mp4.
 * Returns a valid MP4 Buffer, or null on failure.
 * Uses the direct downloadUrl from the API — no proxy needed, works from Replit.
 */
export async function xwolfDownloadMp4(youtubeUrl) {
    if (!/^https?:\/\//i.test(youtubeUrl)) return null;
    try {
        const res = await axios.get(`${BASE}/mp4`, {
            params: { url: youtubeUrl, botkey: BOT_KEY },
            timeout: 25000
        });
        const d = res.data;
        if (!isSuccess(d?.success) || !d?.downloadUrl) {
            console.log(`[xwolf/mp4] failed: ${JSON.stringify(d).substring(0, 80)}`);
            return null;
        }
        console.log(`[xwolf/mp4] got URL for: ${(d.title || '').substring(0, 40)} — downloading...`);
        const dlRes = await axios.get(d.downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 150_000,
            maxContentLength: 200 * 1024 * 1024,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://apis.xwolf.space/' }
        });
        const buf = Buffer.from(dlRes.data);
        if (!buf || buf.length < 10_000) {
            console.log(`[xwolf/mp4] buffer too small: ${buf.length}`);
            return null;
        }
        const sig = buf.slice(4, 8).toString('ascii');
        if (!['ftyp', 'free', 'moov', 'mdat'].includes(sig)) {
            console.log(`[xwolf/mp4] not MP4 bytes (sig="${sig}")`);
            return null;
        }
        console.log(`[xwolf/mp4] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB valid MP4`);
        return buf;
    } catch (e) {
        console.log(`[xwolf/mp4] error: ${e.message}`);
        return null;
    }
}
