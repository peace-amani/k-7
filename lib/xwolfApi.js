import axios from 'axios';

const BASE     = 'https://apis.xwolf.space/download';
const STREAM   = 'https://apis.xwolf.space/stream';
const SEARCH   = 'https://apis.xwolf.space/api/search';
const TRENDING = 'https://apis.xwolf.space/api/trending';

const BOT_KEY = process.env.XWOLF_BOT_KEY || 'wolfbot_bypass_2024';

const MIN_MEDIA_BYTES = 50 * 1024;

function isSuccess(val) {
    if (val === true || val === 1) return true;
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return false;
}

function isValidMediaBuffer(buf, contentType) {
    if (!buf || buf.byteLength < MIN_MEDIA_BYTES) return false;
    if (contentType) {
        const ct = contentType.toLowerCase();
        if (ct.includes('text/html') || ct.includes('application/json') || ct.includes('text/plain')) return false;
    }
    return true;
}

/**
 * PRIMARY DOWNLOAD — calls /stream on the API server.
 * The server handles search + CDN fetch in one request on its own IP.
 * Returns a Buffer on success, null on failure.
 */
export async function streamXWolf(urlOrQuery, type = 'mp3', timeout = 120000) {
    try {
        const res = await axios.get(STREAM, {
            params:       { q: urlOrQuery, type, botkey: BOT_KEY },
            responseType: 'arraybuffer',
            timeout,
            maxRedirects: 10,
            headers:      { 'Accept': '*/*' }
        });
        const ct  = res.headers?.['content-type'] || '';
        const buf = res.data;
        console.log(`[stream/${type}] ${buf?.byteLength ?? 0} bytes | ${ct}`);
        if (isValidMediaBuffer(buf, ct)) return Buffer.from(buf);
        try {
            console.log(`[stream/${type}] invalid response: ${Buffer.from(buf).toString('utf8').substring(0, 200)}`);
        } catch {}
        return null;
    } catch (e) {
        console.log(`[stream/${type}] error: ${e.message}`);
        return null;
    }
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
