/**
 * audioDownloader.js — unified audio download with full fallback chain.
 *
 * Fallback order:
 *   1. yt-dlp      (local binary, downloads directly from YouTube — most reliable)
 *   2. Giftedtech  (api.giftedtech.co.ke) — direct CDN URL, no proxy needed
 *   3. Cobalt      (api.cobalt.tools)      — free open-source, no key needed
 *   4. XWolf       (apis.xwolf.space)      — bot API stream
 *   5. XCasper     (apis.xcasper.space)    — last resort
 *
 * Set GIFTED_API_KEY env var for a real Giftedtech key (default: 'gifted' free key).
 */

import axios from 'axios';
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { streamXWolf } from './xwolfApi.js';
import { xcasperAudio } from './xcasperApi.js';

const GIFTED_BASE      = 'https://api.giftedtech.co.ke/api/download';
const GIFTED_ENDPOINTS = ['yta', 'dlmp3', 'ytmp3'];
const YTDLP_BIN        = '/home/runner/workspace/bin/yt-dlp';

// ─────────────────────────────────────────────────────────────
// 1. YT-DLP (local binary — downloads directly from YouTube)
// ─────────────────────────────────────────────────────────────
export async function ytdlpAudio(ytUrl, timeoutMs = 120000) {
    let tmpDir;
    try {
        tmpDir = await mkdtemp(join(tmpdir(), 'ytdlp-'));
        const outTemplate = join(tmpDir, 'audio.%(ext)s');

        await new Promise((resolve, reject) => {
            const args = [
                '--no-playlist',
                '-x',
                '--audio-format', 'mp3',
                '--audio-quality', '128K',
                '--no-warnings',
                '--no-progress',
                '-o', outTemplate,
                ytUrl
            ];
            const proc = spawn(YTDLP_BIN, args);
            const timer = setTimeout(() => { proc.kill(); reject(new Error('yt-dlp timeout')); }, timeoutMs);
            let stderr = '';
            proc.stderr.on('data', d => { stderr += d.toString(); });
            proc.on('close', code => {
                clearTimeout(timer);
                if (code === 0) resolve();
                else reject(new Error(`yt-dlp exit ${code}: ${stderr.slice(-200)}`));
            });
            proc.on('error', e => { clearTimeout(timer); reject(e); });
        });

        const outFile = join(tmpDir, 'audio.mp3');
        const buf = await readFile(outFile);
        if (buf.length < 10000) throw new Error(`yt-dlp output too small (${buf.length} bytes)`);
        console.log(`[ytdlp] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB`);
        return buf;
    } catch (e) {
        console.log(`[ytdlp] error: ${e.message}`);
        return null;
    } finally {
        if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}

// ─────────────────────────────────────────────────────────────
// 2. GIFTEDTECH
// ─────────────────────────────────────────────────────────────
async function giftedtechAudio(ytUrl) {
    const apikey = process.env.GIFTED_API_KEY || 'gifted';
    for (const endpoint of GIFTED_ENDPOINTS) {
        try {
            const params = { apikey, url: ytUrl };
            if (endpoint === 'ytmp3') params.quality = '128kbps';
            const res = await axios.get(`${GIFTED_BASE}/${endpoint}`, { params, timeout: 25000 });
            if (!res.data?.success || !res.data?.result?.download_url) continue;

            const dlUrl = res.data.result.download_url;
            console.log(`[gifted/${endpoint}] got URL, downloading...`);
            const dlRes = await axios.get(dlUrl, {
                responseType: 'arraybuffer',
                timeout: 90000,
                maxRedirects: 5,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                validateStatus: s => s >= 200 && s < 400
            });
            const buf = Buffer.from(dlRes.data);
            if (buf.length < 10000) { console.log(`[gifted/${endpoint}] buffer too small`); continue; }
            const header = buf.slice(0, 50).toString('utf8').toLowerCase();
            if (header.includes('<!doctype') || header.includes('<html')) { console.log(`[gifted/${endpoint}] got HTML`); continue; }
            console.log(`[gifted/${endpoint}] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB`);
            return buf;
        } catch (e) {
            console.log(`[gifted/${endpoint}] error: ${e.message}`);
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// 3. COBALT
// ─────────────────────────────────────────────────────────────
async function cobaltAudio(ytUrl) {
    try {
        const res = await axios.post('https://api.cobalt.tools/', {
            url: ytUrl,
            downloadMode: 'audio',
            audioFormat: 'mp3',
            filenameStyle: 'pretty'
        }, {
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            timeout: 30000
        });
        const d = res.data;
        if (!d?.url || !['tunnel', 'redirect'].includes(d?.status)) {
            console.log(`[cobalt] unexpected: ${JSON.stringify(d).substring(0, 100)}`);
            return null;
        }
        console.log(`[cobalt] got URL (${d.status}), downloading...`);
        const dlRes = await axios.get(d.url, {
            responseType: 'arraybuffer',
            timeout: 90000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const buf = Buffer.from(dlRes.data);
        if (buf.length < 10000) { console.log(`[cobalt] buffer too small`); return null; }
        console.log(`[cobalt] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB`);
        return buf;
    } catch (e) {
        console.log(`[cobalt] error: ${e.message}`);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC — try all sources in order, return first success
// ─────────────────────────────────────────────────────────────
export async function downloadAudioWithFallback(ytUrl) {
    let buf;

    console.log(`[audioFallback] 1/5 yt-dlp...`);
    buf = await ytdlpAudio(ytUrl);
    if (buf) return buf;

    console.log(`[audioFallback] 2/5 Giftedtech...`);
    buf = await giftedtechAudio(ytUrl);
    if (buf) return buf;

    console.log(`[audioFallback] 3/5 Cobalt...`);
    buf = await cobaltAudio(ytUrl);
    if (buf) return buf;

    console.log(`[audioFallback] 4/5 XWolf...`);
    buf = await streamXWolf(ytUrl, 'mp3');
    if (buf) return buf;

    console.log(`[audioFallback] 5/5 XCasper...`);
    buf = await xcasperAudio(ytUrl);
    if (buf) return buf;

    console.log(`[audioFallback] ❌ all 5 sources failed`);
    return null;
}
