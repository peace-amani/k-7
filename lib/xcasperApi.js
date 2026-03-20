import axios from 'axios';
import { proxyFetch } from './proxyFetch.js';

const XCASPER = 'https://apis.xcasper.space/api/downloader';

/**
 * Download audio via xcasper ytmp3 endpoint.
 * - axios  → API call to xcasper (gets metadata + proxy download URL)
 * - proxyFetch → actual media download (goes through BOT_PROXY_URL if set)
 */
export async function xcasperAudio(urlOrQuery) {
    if (!/^https?:\/\//i.test(urlOrQuery)) return null;
    try {
        const res = await axios.get(`${XCASPER}/ytmp3`, {
            params: { url: urlOrQuery },
            timeout: 30000
        });
        if (!res.data?.success) return null;
        const downloads = res.data?.data?.downloads;
        if (!Array.isArray(downloads) || !downloads.length) return null;

        const m4a  = downloads.filter(d => d.extension === 'm4a');
        const pool = m4a.length ? m4a : downloads;
        const best = pool.reduce((a, b) => (b.bitrate > a.bitrate ? b : a));
        if (!best?.url) return null;

        console.log(`[xcasper/audio] downloading: ${best.quality}`);
        return await proxyFetch(best.url, 120_000);
    } catch (e) {
        console.log(`[xcasper/audio] error: ${e.message}`);
        return null;
    }
}

/**
 * Download video via xcasper ytmp4 endpoint.
 * Picks hasAudio=true + highest bitrate.
 */
export async function xcasperVideo(urlOrQuery) {
    if (!/^https?:\/\//i.test(urlOrQuery)) return null;
    try {
        const res = await axios.get(`${XCASPER}/ytmp4`, {
            params: { url: urlOrQuery },
            timeout: 30000
        });
        if (!res.data?.success) return null;
        const downloads = res.data?.data?.downloads;
        if (!Array.isArray(downloads) || !downloads.length) return null;

        const withAudio = downloads.filter(d => d.hasAudio);
        const pool = withAudio.length ? withAudio : downloads;
        const best = pool.reduce((a, b) => (b.bitrate > a.bitrate ? b : a));
        if (!best?.url) return null;

        console.log(`[xcasper/video] downloading: ${best.quality}`);
        return await proxyFetch(best.url, 150_000);
    } catch (e) {
        console.log(`[xcasper/video] error: ${e.message}`);
        return null;
    }
}

/**
 * Download a Spotify track via xcasper sportify endpoint.
 * Returns { buf, title, artist, thumbnail, duration } or null.
 */
export async function xcasperSpotify(spotifyUrl) {
    try {
        const res = await axios.get(`${XCASPER}/sportify`, {
            params: { url: spotifyUrl },
            timeout: 30000
        });
        if (!res.data?.success || !res.data?.track?.audio?.url) return null;
        const track = res.data.track;
        console.log(`[xcasper/spotify] downloading: ${track.title}`);
        const buf = await proxyFetch(track.audio.url, 90_000);
        if (!buf) return null;
        return {
            buf,
            title:     track.title     || '',
            artist:    track.artist    || '',
            thumbnail: track.thumbnail || track.album?.cover || '',
            duration:  track.duration  || ''
        };
    } catch (e) {
        console.log(`[xcasper/spotify] error: ${e.message}`);
        return null;
    }
}

/**
 * Download Instagram media via xcasper ig → ig2 fallback chain.
 * Returns { mediaUrl, mediaUrls, isVideo } or null.
 * Note: mediaUrl is downloaded by instagram.js using downloadFile() (stream to disk).
 */
export async function xcasperInstagram(igUrl) {
    for (const ep of ['ig', 'ig2']) {
        try {
            const res = await axios.get(`${XCASPER}/${ep}`, {
                params: { url: igUrl },
                timeout: 20000
            });
            const d = res.data;
            if (!d?.success) { console.log(`[xcasper/${ep}] failed: ${d?.message || d?.error}`); continue; }

            const medias   = d.data?.medias || d.data?.media || d.medias || d.media || [];
            const mediaUrl = d.data?.url || d.url
                || (Array.isArray(medias) && medias[0]?.url)
                || null;

            if (!mediaUrl) { console.log(`[xcasper/${ep}] no media URL in response`); continue; }

            const isVideo = mediaUrl.includes('.mp4')
                || (Array.isArray(medias) && medias[0]?.type === 'video')
                || igUrl.includes('/reel/') || igUrl.includes('/tv/');

            const mediaUrls = Array.isArray(medias)
                ? medias.map(x => x.url).filter(Boolean)
                : [mediaUrl];

            console.log(`[xcasper/${ep}] ✅ ${mediaUrls.length} media item(s)`);
            return { mediaUrl, mediaUrls, isVideo };
        } catch (e) {
            console.log(`[xcasper/${ep}] error: ${e.message}`);
        }
    }
    return null;
}
