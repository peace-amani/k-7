import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Resolve the full ffmpeg binary path and patch process.env.PATH so that
// every child_process call (execFile, exec, spawn) in the entire bot finds
// ffmpeg without needing its full path hard-coded everywhere.
//
// Import this module ONCE, as early as possible in index.js.

function resolveFfmpeg() {
    const candidates = [
        process.env.FFMPEG_PATH,
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
    ].filter(Boolean);

    for (const p of candidates) {
        try { if (fs.existsSync(p)) return p; } catch {}
    }

    // Ask the shell — works on Nix/Replit where ffmpeg is in the Nix store
    try {
        return execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim();
    } catch {}

    return 'ffmpeg'; // last resort; will fail at call-time if not on PATH
}

const FFMPEG = resolveFfmpeg();

// Patch PATH so every child process inherits the ffmpeg directory.
// This fixes both execFile('ffmpeg', …) and shell exec('ffmpeg …') calls.
if (FFMPEG !== 'ffmpeg') {
    const ffmpegDir = path.dirname(FFMPEG);
    const currentPath = process.env.PATH || '';
    if (!currentPath.split(':').includes(ffmpegDir)) {
        process.env.PATH = `${ffmpegDir}:${currentPath}`;
    }
}

console.log(`[ffmpegPath] resolved → ${FFMPEG}`);

export default FFMPEG;
