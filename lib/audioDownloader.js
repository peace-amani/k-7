/**
 * audioDownloader.js — unified audio download with fallback chain.
 *
 * Fallback order:
 *   1. Keith    (apiskeith.top)  — primary API
 *   2. yt-dlp   (self-installing binary — downloads direct from YouTube)
 *   3. Cobalt   (api.cobalt.tools) — free, no key needed
 */

import axios from 'axios';
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, access, chmod, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { keithAudio } from './keithApi.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const YTDLP_PATH = join(__dirname, '..', 'bin', 'yt-dlp');
const YTDLP_URL  = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

// ─────────────────────────────────────────────────────────────
// YT-DLP — auto-install + execute
// ─────────────────────────────────────────────────────────────

let ytdlpReady = null; // null = unchecked, true = ready, false = unavailable

async function ensureYtdlp() {
    if (ytdlpReady === true)  return true;
    if (ytdlpReady === false) return false;

    try {
        await access(YTDLP_PATH);
        await chmod(YTDLP_PATH, 0o755);
        ytdlpReady = true;
        return true;
    } catch {}

    console.log(`[ytdlp] binary not found, downloading...`);
    try {
        await mkdir(join(__dirname, '..', 'bin'), { recursive: true });
        const res = await axios.get(YTDLP_URL, {
            responseType: 'arraybuffer',
            timeout: 60000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        await writeFile(YTDLP_PATH, Buffer.from(res.data));
        await chmod(YTDLP_PATH, 0o755);
        console.log(`[ytdlp] ✅ installed successfully`);
        ytdlpReady = true;
        return true;
    } catch (e) {
        console.log(`[ytdlp] ❌ auto-install failed: ${e.message}`);
        ytdlpReady = false;
        return false;
    }
}

ensureYtdlp().catch(() => {});

export async function ytdlpAudio(ytUrl, timeoutMs = 120000) {
    const ready = await ensureYtdlp();
    if (!ready) return null;

    let tmpDir;
    try {
        tmpDir = await mkdtemp(join(tmpdir(), 'ytdlp-'));
        const outTemplate = join(tmpDir, 'audio.%(ext)s');

        await new Promise((resolve, reject) => {
            const proc = spawn(YTDLP_PATH, [
                '--no-playlist',
                '-x',
                '--audio-format', 'mp3',
                '--audio-quality', '128K',
                '--no-warnings',
                '--no-progress',
                '-o', outTemplate,
                ytUrl
            ]);
            const timer = setTimeout(() => { proc.kill(); reject(new Error('yt-dlp timeout')); }, timeoutMs);
            let stderr = '';
            proc.stderr.on('data', d => { stderr += d.toString(); });
            proc.on('close', code => {
                clearTimeout(timer);
                if (code === 0) resolve();
                else reject(new Error(`yt-dlp exit ${code}: ${stderr.slice(-200)}`));
            });
            proc.on('error', e => {
                clearTimeout(timer);
                ytdlpReady = false;
                reject(e);
            });
        });

        const outFile = join(tmpDir, 'audio.mp3');
        const buf = await readFile(outFile);
        if (buf.length < 10000) throw new Error(`output too small (${buf.length} bytes)`);
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
// COBALT
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

    console.log(`[audioFallback] 1/3 Keith API (apiskeith.top)...`);
    buf = await keithAudio(ytUrl);
    if (buf) return buf;

    console.log(`[audioFallback] 2/3 yt-dlp...`);
    buf = await ytdlpAudio(ytUrl);
    if (buf) return buf;

    console.log(`[audioFallback] 3/3 Cobalt...`);
    buf = await cobaltAudio(ytUrl);
    if (buf) return buf;

    console.log(`[audioFallback] ❌ all 3 sources failed`);
    return null;
}
