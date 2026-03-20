/**
 * xcasperApi.js — xcasper.space downloader integration.
 *
 * Audio download priority (per xcasperAudio):
 *   1. y2mate    → returns occoco.etacloud.org URL — works directly from Replit ✅
 *   2. yt-audio  → returns xcasper proxy stream URL — works if BOT_PROXY_URL set
 *   3. ytmp3     → returns xcasper proxy stream URL — works if BOT_PROXY_URL set
 *
 * Spotify priority (per xcasperSpotify):
 *   1. sportify  → cdn-spotify.zm.io.vn audio URL — works directly from Replit ✅
 *   2. spotify4  → gets YouTube match ID → feeds into y2mate ✅
 *
 * Video download priority (per xcasperVideo):
 *   1. ytmp5 → xcasper proxy URL — accessible from Replit ✅ (returns mp3, skip if not mp4)
 *   2. ytmp6 → xcasper proxy URL — accessible from Replit ✅ (returns mp4 360p)
 *
 * Instagram: ig → ig2 → ig3 → ig4 fallback chain.
 */

import axios from 'axios';
import { proxyFetch } from './proxyFetch.js';

const BASE = 'https://apis.xcasper.space/api/downloader';

// ─────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * y2mate: returns { buf, title, id } or null.
 * Download URL is at occoco.etacloud.org — no IP lock, works from Replit.
 */
async function y2mateDownload(ytUrl) {
    try {
        const res = await axios.get(`${BASE}/y2mate`, {
            params: { url: ytUrl },
            timeout: 30000
        });
        const d = res.data;
        if (!d?.success || !d?.download) {
            console.log(`[xcasper/y2mate] no download URL`);
            return null;
        }
        console.log(`[xcasper/y2mate] got URL, downloading...`);
        const buf = await proxyFetch(d.download, 120_000);
        return buf ? { buf, title: d.title || '', id: d.id || '' } : null;
    } catch (e) {
        console.log(`[xcasper/y2mate] error: ${e.message}`);
        return null;
    }
}

/**
 * yt-audio: returns { buf, title, thumbnail, duration } or null.
 * Picks best m4a from audios[]. Works if BOT_PROXY_URL routes through xcasper's IP.
 */
async function ytAudioDownload(ytUrl) {
    try {
        const res = await axios.get(`${BASE}/yt-audio`, {
            params: { url: ytUrl },
            timeout: 30000
        });
        const d = res.data;
        if (!d?.success || !Array.isArray(d?.audios) || !d.audios.length) return null;

        const m4a  = d.audios.filter(a => a.ext === 'm4a');
        const pool = m4a.length ? m4a : d.audios;
        const best = pool.reduce((a, b) => {
            const bRate = parseInt(b.label) || 0;
            const aRate = parseInt(a.label) || 0;
            return bRate > aRate ? b : a;
        });
        if (!best?.url) return null;

        console.log(`[xcasper/yt-audio] downloading: ${best.label}`);
        const buf = await proxyFetch(best.url, 120_000);
        return buf ? { buf, title: d.title || '', thumbnail: d.thumbnail || '', duration: d.duration || 0 } : null;
    } catch (e) {
        console.log(`[xcasper/yt-audio] error: ${e.message}`);
        return null;
    }
}

/**
 * ytmp3: fallback using xcasper's ytmp3 endpoint.
 * Picks best m4a from downloads[].
 */
async function ytmp3Download(ytUrl) {
    try {
        const res = await axios.get(`${BASE}/ytmp3`, {
            params: { url: ytUrl },
            timeout: 30000
        });
        const d = res.data;
        if (!d?.success) return null;
        const downloads = d?.data?.downloads;
        if (!Array.isArray(downloads) || !downloads.length) return null;

        const m4a  = downloads.filter(x => x.extension === 'm4a');
        const pool = m4a.length ? m4a : downloads;
        const best = pool.reduce((a, b) => (b.bitrate > a.bitrate ? b : a));
        if (!best?.url) return null;

        console.log(`[xcasper/ytmp3] downloading: ${best.quality}`);
        const buf = await proxyFetch(best.url, 120_000);
        return buf ? { buf, title: d?.data?.title || '' } : null;
    } catch (e) {
        console.log(`[xcasper/ytmp3] error: ${e.message}`);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC EXPORTS
// ─────────────────────────────────────────────────────────────

/**
 * Download YouTube audio.
 * Requires a YouTube URL. Returns Buffer or null.
 * Chain: y2mate → yt-audio → ytmp3
 */
export async function xcasperAudio(urlOrQuery) {
    if (!/^https?:\/\//i.test(urlOrQuery)) return null;

    let r;

    r = await y2mateDownload(urlOrQuery);
    if (r?.buf) { console.log(`[xcasper/audio] ✅ y2mate (${(r.buf.byteLength / 1024 / 1024).toFixed(1)}MB)`); return r.buf; }

    r = await ytAudioDownload(urlOrQuery);
    if (r?.buf) { console.log(`[xcasper/audio] ✅ yt-audio (${(r.buf.byteLength / 1024 / 1024).toFixed(1)}MB)`); return r.buf; }

    r = await ytmp3Download(urlOrQuery);
    if (r?.buf) { console.log(`[xcasper/audio] ✅ ytmp3 (${(r.buf.byteLength / 1024 / 1024).toFixed(1)}MB)`); return r.buf; }

    console.log(`[xcasper/audio] ❌ all sources failed`);
    return null;
}

/**
 * Download YouTube video.
 * Chain: ytmp5 → ytmp6 (picks whichever gives format=mp4).
 * Proxy URL is downloaded directly via axios — xcasper proxy works from Replit.
 * Returns Buffer or null.
 */
export async function xcasperVideo(urlOrQuery) {
    if (!/^https?:\/\//i.test(urlOrQuery)) return null;

    for (const ep of ['ytmp5', 'ytmp6']) {
        try {
            const res = await axios.get(`${BASE}/${ep}`, {
                params: { url: urlOrQuery },
                timeout: 30000
            });
            const d = res.data;
            if (!d?.success) { console.log(`[xcasper/${ep}] failed`); continue; }

            // ytmp5 returns mp3, ytmp6 returns mp4 — only accept mp4 for video commands
            if (d.format !== 'mp4') { console.log(`[xcasper/${ep}] skipping: format=${d.format}`); continue; }

            const dlUrl = d.url;
            if (!dlUrl) { console.log(`[xcasper/${ep}] no URL`); continue; }

            console.log(`[xcasper/${ep}] downloading: ${d.quality} mp4...`);

            // Download directly via axios — xcasper proxy URLs work from Replit (unlike old ytmp4)
            const dlRes = await axios.get(dlUrl, {
                responseType: 'arraybuffer',
                timeout: 150_000,
                maxContentLength: 200 * 1024 * 1024,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': 'https://apis.xcasper.space/'
                }
            });

            const buf = Buffer.from(dlRes.data);
            if (!buf || buf.length < 10_000) { console.log(`[xcasper/${ep}] buffer too small: ${buf.length}`); continue; }

            // Quick MP4 magic byte check — bytes 4-7 should be 'ftyp'
            const sig = buf.slice(4, 8).toString('ascii');
            if (!['ftyp', 'free', 'moov', 'mdat'].includes(sig)) {
                console.log(`[xcasper/${ep}] invalid MP4 signature: "${sig}"`);
                continue;
            }

            console.log(`[xcasper/${ep}] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB`);
            return buf;
        } catch (e) {
            console.log(`[xcasper/${ep}] error: ${e.message}`);
        }
    }
    return null;
}

/**
 * Download a Spotify track.
 * Chain:
 *   1. sportify → cdn-spotify.zm.io.vn (works from Replit ✅)
 *   2. spotify4 → youtube_match.video_id → y2mate (works from Replit ✅)
 * Returns { buf, title, artist, thumbnail, duration } or null.
 */
export async function xcasperSpotify(spotifyUrl) {
    // ── 1. sportify endpoint (CDN works directly) ──
    try {
        const res = await axios.get(`${BASE}/sportify`, {
            params: { url: spotifyUrl },
            timeout: 30000
        });
        const d = res.data;
        if (d?.success && d?.track?.audio?.url) {
            const track = d.track;
            console.log(`[xcasper/sportify] found: ${track.title}`);
            const buf = await proxyFetch(track.audio.url, 90_000);
            if (buf) {
                return {
                    buf,
                    title:     track.title     || '',
                    artist:    track.artist    || '',
                    thumbnail: track.thumbnail || track.album?.cover || '',
                    duration:  track.duration  || ''
                };
            }
        }
    } catch (e) {
        console.log(`[xcasper/sportify] error: ${e.message}`);
    }

    // ── 2. spotify4 → youtube_match → y2mate ──
    try {
        const res = await axios.get(`${BASE}/spotify4`, {
            params: { url: spotifyUrl },
            timeout: 30000
        });
        const d = res.data;
        if (d?.success && d?.youtube_match?.video_id) {
            const track  = d.track || {};
            const ytUrl  = `https://youtube.com/watch?v=${d.youtube_match.video_id}`;
            console.log(`[xcasper/spotify4] YouTube match: ${ytUrl}`);
            const r = await y2mateDownload(ytUrl);
            if (r?.buf) {
                return {
                    buf:       r.buf,
                    title:     track.title  || r.title || '',
                    artist:    track.artist || d.youtube_match.channel || '',
                    thumbnail: track.cover  || '',
                    duration:  track.duration || ''
                };
            }
        }
    } catch (e) {
        console.log(`[xcasper/spotify4] error: ${e.message}`);
    }

    return null;
}

/**
 * Download Instagram media via ig → ig2 → ig3 → ig4 fallback chain.
 * Returns { mediaUrl, mediaUrls, isVideo } or null.
 */
export async function xcasperInstagram(igUrl) {
    for (const ep of ['ig', 'ig2', 'ig3', 'ig4']) {
        try {
            const res = await axios.get(`${BASE}/${ep}`, {
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
