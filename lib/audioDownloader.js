import axios from 'axios';
import { keithAudio } from './keithApi.js';
import { xwolfDownloadAudio } from './xwolfApi.js';
import { sigLog } from './sigLog.js';

const DL_TIMEOUT = 180000;

// ── Validate a downloaded buffer is real audio ───────────────────────────────
function validateBuffer(buf, minBytes = 50000) {
    if (!buf || buf.length < minBytes) throw new Error(`file too small (${buf?.length ?? 0} bytes)`);
    const hdr = buf.slice(0, 60).toString('utf8').toLowerCase();
    if (hdr.includes('<!doctype') || hdr.includes('<html') || hdr.includes('bad gateway')) {
        throw new Error('server returned HTML instead of audio');
    }
    return buf;
}

// ── Generic buffer downloader ─────────────────────────────────────────────────
async function downloadBuffer(url) {
    const res = await axios({
        url, method: 'GET', responseType: 'arraybuffer',
        timeout: DL_TIMEOUT, maxRedirects: 10,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        validateStatus: s => s >= 200 && s < 400
    });
    return validateBuffer(Buffer.from(res.data));
}

// ── Source 0: xwolf (PRIMARY — iterates all 7 audio endpoints internally) ────
async function fromXwolf(ytUrl) {
    const buf = await xwolfDownloadAudio(ytUrl);
    if (!buf) throw new Error('xwolf returned null');
    return validateBuffer(buf);
}

// ── Source 1: Keith dlmp3 ─────────────────────────────────────────────────────
async function fromKeith(ytUrl) {
    const buf = await keithAudio(ytUrl);
    if (!buf) throw new Error('Keith returned null');
    return buf;
}

// ── Source 2: GiftedTech ytmp3v2 (has thumbnail + metadata) ──────────────────
async function fromGiftedV2(ytUrl) {
    const res = await axios.get('https://api.giftedtech.co.ke/api/download/ytmp3v2', {
        params: { apikey: 'gifted', url: ytUrl },
        timeout: 25000
    });
    const r = res.data?.result;
    if (!r?.download_url) throw new Error('GiftedTech v2: no download_url');
    return await downloadBuffer(r.download_url);
}

// ── Source 3: GiftedTech ytmp3 ────────────────────────────────────────────────
async function fromGiftedV1(ytUrl) {
    const res = await axios.get('https://api.giftedtech.co.ke/api/download/ytmp3', {
        params: { apikey: 'gifted', url: ytUrl },
        timeout: 25000
    });
    const r = res.data?.result;
    if (!r?.download_url) throw new Error('GiftedTech v1: no download_url');
    return await downloadBuffer(r.download_url);
}

// ── Source 4: XCasper yt-audio (320kbps) ─────────────────────────────────────
async function fromXcasper(ytUrl) {
    const res = await axios.get('https://apis.xcasper.space/api/downloader/yt-audio', {
        params: { url: ytUrl },
        timeout: 25000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const d = res.data;
    if (!d?.success || !Array.isArray(d?.audios) || !d.audios.length) {
        throw new Error('XCasper: no audios in response');
    }
    // Pick highest bitrate mp3
    const sorted = d.audios
        .filter(a => a.url && (a.ext === 'mp3' || a.mimeType?.includes('mpeg')))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    if (!sorted.length) throw new Error('XCasper: no mp3 format available');
    return await downloadBuffer(sorted[0].url);
}

// ── Main export: 4-source fallback chain ─────────────────────────────────────
export async function downloadAudioWithFallback(ytUrl) {
    const sources = [
        { name: 'xwolf',           fn: () => fromXwolf(ytUrl)     },
        { name: 'Keith dlmp3',     fn: () => fromKeith(ytUrl)     },
        { name: 'GiftedTech v2',   fn: () => fromGiftedV2(ytUrl)  },
        { name: 'GiftedTech v1',   fn: () => fromGiftedV1(ytUrl)  },
        { name: 'XCasper',         fn: () => fromXcasper(ytUrl)   },
    ];

    for (const { name, fn } of sources) {
        try {
            sigLog('🔁', 'audioDownloader', `Trying ${name}…`);
            const buf = await fn();
            sigLog('✅', 'audioDownloader', `${name} succeeded`, {
                Size: `${(buf.length / 1024 / 1024).toFixed(1)}MB`,
            });
            return buf;
        } catch (e) {
            sigLog('⚠️', 'audioDownloader', `${name} failed`, { Error: e.message }, 'yellow');
        }
    }

    sigLog('❌', 'audioDownloader', 'All sources exhausted', null, 'red');
    return null;
}
