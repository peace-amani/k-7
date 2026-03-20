import axios from 'axios';

const BASE     = 'https://apis.xwolf.space/download';
const SEARCH   = 'https://apis.xwolf.space/api/search';
const TRENDING = 'https://apis.xwolf.space/api/trending';

const AUDIO_PATHS = ['mp3', 'ytmp3', 'audio', 'dlmp3'];
const VIDEO_PATHS = ['mp4', 'ytmp4', 'video', 'hd', 'dlmp4'];

function buildParams(urlOrQuery) {
    if (/^https?:\/\//i.test(urlOrQuery)) return { url: urlOrQuery };
    return { q: urlOrQuery };
}

function normalizeData(d, path) {
    if (!d) return null;
    const isAudio = AUDIO_PATHS.includes(path);
    const dlUrl   = d.downloadUrl || d.download_url || null;
    if (!dlUrl || typeof dlUrl !== 'string') return null;
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
            if ((d?.success === true || d?.success === 'True') && d?.downloadUrl) {
                const data = normalizeData(d, path);
                if (data) return { success: true, data, endpoint: `xwolf/${path}` };
            }
        } catch {}
    }
    return { success: false };
}

export function queryXWolfAudio(urlOrQuery) { return queryXWolf(urlOrQuery, AUDIO_PATHS, 30000); }
export function queryXWolfVideo(urlOrQuery) { return queryXWolf(urlOrQuery, VIDEO_PATHS, 35000); }

export async function xwolfSearch(query, limit = 10) {
    try {
        const res = await axios.get(SEARCH, { params: { q: query }, timeout: 15000 });
        if (res.data?.success && Array.isArray(res.data.items)) {
            return res.data.items.slice(0, limit);
        }
    } catch {}
    return [];
}

export async function xwolfTrending(limit = 10) {
    try {
        const res = await axios.get(TRENDING, { timeout: 15000 });
        if (res.data?.success && Array.isArray(res.data.items)) {
            return res.data.items.slice(0, limit);
        }
    } catch {}
    return [];
}

export async function xwolfLyrics(query) {
    try {
        const res = await axios.get(`${BASE}/lyrics`, { params: { q: query }, timeout: 15000 });
        const d = res.data;
        if ((d?.success === true || d?.success === 'True') && d?.lyrics) {
            return { title: d.title || query, artist: d.artist || '', lyrics: d.lyrics };
        }
    } catch {}
    return null;
}

export async function downloadMediaBuffer(url, timeout = 90000) {
    if (!url || typeof url !== 'string') return null;
    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout,
            headers: {
                'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept':          '*/*',
                'Accept-Encoding': 'identity'
            },
            maxRedirects: 10
        });
        if (res.data && res.data.byteLength > 0) return Buffer.from(res.data);
        return null;
    } catch {
        return null;
    }
}
