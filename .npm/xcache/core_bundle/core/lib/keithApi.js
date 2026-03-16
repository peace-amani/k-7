import axios from 'axios';

const BASE = 'https://apiskeith.top/download';
const AUDIO_PATHS = ['ytmp3', 'mp3', 'yta'];
const VIDEO_PATHS = ['ytmp4', 'mp4', 'ytv3', 'ytv5'];

function extractDownloadUrl(d) {
    return d?.download_url || d?.downloadUrl || d?.url || d?.link
        || d?.mp3 || d?.audio || d?.mp4 || d?.video || null;
}

function extractFromResponse(d) {
    if (!d) return null;
    let dlUrl = extractDownloadUrl(d);
    if (dlUrl) return { dlUrl, title: d.title || '', thumbnail: d.thumbnail || '', quality: d.quality || '' };
    const inner = d.result || d.data || d.response;
    if (inner) {
        dlUrl = extractDownloadUrl(inner);
        if (dlUrl) return { dlUrl, title: inner.title || d.title || '', thumbnail: inner.thumbnail || d.thumbnail || '', quality: inner.quality || d.quality || '' };
    }
    return null;
}

async function queryKeith(url, paths, timeout = 25000, isAudio = true) {
    for (const path of paths) {
        try {
            const res = await axios.get(`${BASE}/${path}`, { params: { url }, timeout });
            const parsed = extractFromResponse(res.data);
            if (parsed?.dlUrl) {
                return {
                    success: true,
                    data: {
                        title: parsed.title,
                        download_url: parsed.dlUrl,
                        quality: parsed.quality || (isAudio ? '128kbps' : 'HD'),
                        thumbnail: parsed.thumbnail
                    },
                    endpoint: `keith/${path}`
                };
            }
        } catch {}
    }
    return { success: false };
}

export function queryKeithAudio(url) { return queryKeith(url, AUDIO_PATHS, 25000, true); }
export function queryKeithVideo(url) { return queryKeith(url, VIDEO_PATHS, 30000, false); }
