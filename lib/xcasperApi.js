import axios from 'axios';

const XCASPER = 'https://apis.xcasper.space/api/downloader';
const MIN_BYTES = 50 * 1024;

function validBuf(buf, ct) {
    if (!buf || buf.byteLength < MIN_BYTES) return false;
    if (ct) {
        const c = ct.toLowerCase();
        if (c.includes('text/html') || c.includes('application/json') || c.includes('text/plain')) return false;
    }
    return true;
}

async function fetchBuf(url, timeout = 120000) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout,
        maxRedirects: 10,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const buf = Buffer.from(res.data);
    const ct  = res.headers['content-type'] || '';
    return validBuf(buf, ct) ? buf : null;
}

/**
 * Download audio via xcasper ytmp3 endpoint.
 * Requires a YouTube URL. Picks highest-bitrate m4a.
 * Returns Buffer or null.
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

        const m4a = downloads.filter(d => d.extension === 'm4a');
        const pool = m4a.length ? m4a : downloads;
        const best = pool.reduce((a, b) => (b.bitrate > a.bitrate ? b : a));
        if (!best?.url) return null;

        console.log(`[xcasper/audio] trying: ${best.quality}`);
        const buf = await fetchBuf(best.url, 120000);
        if (buf) console.log(`[xcasper/audio] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB`);
        else      console.log(`[xcasper/audio] ❌ proxy returned no data`);
        return buf;
    } catch (e) {
        console.log(`[xcasper/audio] error: ${e.message}`);
        return null;
    }
}

/**
 * Download video via xcasper ytmp4 endpoint.
 * Requires a YouTube URL. Picks hasAudio=true + highest bitrate.
 * Returns Buffer or null.
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

        console.log(`[xcasper/video] trying: ${best.quality}`);
        const buf = await fetchBuf(best.url, 150000);
        if (buf) console.log(`[xcasper/video] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB`);
        else      console.log(`[xcasper/video] ❌ proxy returned no data`);
        return buf;
    } catch (e) {
        console.log(`[xcasper/video] error: ${e.message}`);
        return null;
    }
}

/**
 * Download a Spotify track via xcasper sportify endpoint.
 * Requires a Spotify track URL.
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
        console.log(`[xcasper/spotify] found: ${track.title}`);
        const buf = await fetchBuf(track.audio.url, 90000);
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

            const medias = d.data?.medias || d.data?.media || d.medias || d.media || [];
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
