/**
 * Proxy-aware media downloader.
 *
 * Priority:
 *   1. BOT_PROXY_URL  (set in Replit Secrets)
 *   2. HTTPS_PROXY    (standard env var)
 *   3. HTTP_PROXY     (standard env var)
 *   4. Direct (no proxy) — still uses undici for better streaming than axios
 *
 * Uses undici (built into Node 20) with ProxyAgent so downloads
 * route through the configured proxy, bypassing CDN IP locks.
 */

import { fetch as undiciFetch, ProxyAgent, Agent } from 'undici';

const PROXY_URL = process.env.BOT_PROXY_URL
    || process.env.HTTPS_PROXY
    || process.env.HTTP_PROXY
    || null;

const MIN_BYTES = 50 * 1024;

let _dispatcher;
function getDispatcher() {
    if (_dispatcher) return _dispatcher;
    if (PROXY_URL) {
        console.log(`[proxyFetch] Using proxy: ${PROXY_URL.replace(/:([^@]+)@/, ':****@')}`);
        _dispatcher = new ProxyAgent({
            uri:            PROXY_URL,
            keepAliveTimeout: 30_000,
            keepAliveMaxTimeout: 60_000
        });
    } else {
        _dispatcher = new Agent({
            keepAliveTimeout: 30_000,
            keepAliveMaxTimeout: 60_000,
            connect: { rejectUnauthorized: false }
        });
    }
    return _dispatcher;
}

/**
 * Download a URL and return a validated Buffer, or null on failure.
 * @param {string} url      - The URL to download
 * @param {number} timeout  - Milliseconds (default 120 s)
 * @returns {Promise<Buffer|null>}
 */
export async function proxyFetch(url, timeout = 120_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const res = await undiciFetch(url, {
            dispatcher: getDispatcher(),
            signal:     controller.signal,
            headers: {
                'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept':          '*/*',
                'Accept-Encoding': 'gzip, deflate, br'
            },
            redirect: 'follow'
        });

        if (!res.ok) {
            let body = '';
            try { body = await res.text(); } catch {}
            console.log(`[proxyFetch] HTTP ${res.status} for ${url.substring(0, 80)} | ${body.substring(0, 120)}`);
            return null;
        }

        const ct  = res.headers.get('content-type') || '';
        const arr = await res.arrayBuffer();
        const buf = Buffer.from(arr);

        if (buf.byteLength < MIN_BYTES) {
            console.log(`[proxyFetch] too small: ${buf.byteLength} bytes`);
            return null;
        }
        if (ct.includes('text/html') || ct.includes('application/json') || ct.includes('text/plain')) {
            console.log(`[proxyFetch] bad content-type: ${ct}`);
            return null;
        }

        console.log(`[proxyFetch] ✅ ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB | ${ct}`);
        return buf;

    } catch (e) {
        if (e.name === 'AbortError') console.log(`[proxyFetch] timeout after ${timeout}ms`);
        else console.log(`[proxyFetch] error: ${e.message}`);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export const hasProxy = Boolean(PROXY_URL);
