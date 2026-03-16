import axios from 'axios';

const BASE = 'https://apis.xwolf.space/download';
const AUDIO_PATHS = ['mp3', 'audio', 'ytmp3'];
const VIDEO_PATHS = ['mp4', 'ytmp4', 'video'];

async function queryXWolf(url, paths, timeout = 25000) {
    for (const path of paths) {
        try {
            const res = await axios.get(`${BASE}/${path}`, { params: { url }, timeout });
            const d = res.data;
            if (d?.success && d?.downloadUrl) {
                return {
                    success: true,
                    data: {
                        title:        d.title      || '',
                        download_url: d.downloadUrl,
                        quality:      d.quality    || (paths === AUDIO_PATHS ? '128kbps' : 'HD'),
                        thumbnail:    d.thumbnail  || ''
                    },
                    endpoint: `xwolf/${path}`
                };
            }
        } catch {}
    }
    return { success: false };
}

export function queryXWolfAudio(url) { return queryXWolf(url, AUDIO_PATHS, 25000); }
export function queryXWolfVideo(url) { return queryXWolf(url, VIDEO_PATHS, 30000); }
