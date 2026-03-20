import fs from 'fs';
import path from 'path';
import axios from 'axios';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'musicmode.json');

// Curated pool of songs — iTunes Search API returns official 30s previews with full vocals
const DEFAULT_SONGS = [
    // Alan Walker
    'alan walker faded',
    'alan walker alone',
    'alan walker darkside',
    'alan walker all falls down',
    'alan walker on my way',
    'alan walker different world',
    'alan walker sing me to sleep',
    'alan walker spectre',
    // NF
    'NF the search',
    'NF mansion',
    'NF leave me alone',
    'NF paralyzed',
    'NF got you on my mind',
    'NF remember this',
    'NF therapy session',
    // Similar vibes
    'kygo stole the show',
    'imagine dragons demons',
    'imagine dragons believer',
    'twenty one pilots stressed out',
    'twenty one pilots ride',
    'the chainsmokers closer',
    'marshmello alone',
    'marshmello happier',
    'billie eilish bad guy',
    'post malone circles',
    'juice wrld lucid dreams',
    'juice wrld legends never die',
    'xxxtentacion SAD',
    'xxxtentacion changes',
    'lil peep star shopping',
    'khalid young dumb broke',
    'khalid better',
    'gnash i hate u i love u',
];

function _ensure() {
    try {
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {}
}

function _load() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch {}
    return { enabled: false, songs: [...DEFAULT_SONGS], setBy: null, setAt: null };
}

function _save(data) {
    _ensure();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

export function isMusicModeEnabled() {
    if (global.MUSIC_MODE === true) return true;
    if (global.MUSIC_MODE === false) return false;
    return _load().enabled === true;
}

export function setMusicMode(enabled, setBy = 'Unknown') {
    const data = _load();
    data.enabled = enabled;
    data.setBy = setBy;
    data.setAt = new Date().toISOString();
    _save(data);
    global.MUSIC_MODE = enabled;
}

export function getMusicSongs() {
    return _load().songs || [...DEFAULT_SONGS];
}

export function addMusicSong(query) {
    const data = _load();
    if (!data.songs) data.songs = [...DEFAULT_SONGS];
    if (data.songs.includes(query)) return false;
    data.songs.push(query);
    _save(data);
    return true;
}

export function removeMusicSong(index) {
    const data = _load();
    if (!data.songs || index < 0 || index >= data.songs.length) return null;
    const [removed] = data.songs.splice(index, 1);
    _save(data);
    return removed;
}

export function resetMusicSongs() {
    const data = _load();
    data.songs = [...DEFAULT_SONGS];
    _save(data);
}

export function clearMusicSongs() {
    const data = _load();
    data.songs = [];
    _save(data);
}

async function fetchItunesPreview(query) {
    const res = await axios.get('https://itunes.apple.com/search', {
        params: { term: query, entity: 'song', limit: 5, media: 'music' },
        timeout: 8000
    });
    const results = res.data?.results || [];
    // Prefer results that have a previewUrl
    const withPreview = results.filter(r => r.previewUrl);
    if (!withPreview.length) return null;
    // Pick one randomly from top results to add variety
    const pick = withPreview[Math.floor(Math.random() * withPreview.length)];
    return { previewUrl: pick.previewUrl, trackName: pick.trackName, artistName: pick.artistName };
}

export async function sendMusicClip(sock, chatId, quotedMsg = null) {
    const songs = getMusicSongs();
    if (!songs.length) return;

    // Shuffle the song pool and try each until one works
    const shuffled = [...songs].sort(() => Math.random() - 0.5);

    for (const query of shuffled) {
        try {
            const track = await fetchItunesPreview(query);
            if (!track?.previewUrl) continue;

            const resp = await axios.get(track.previewUrl, {
                responseType: 'arraybuffer',
                timeout: 20000,
                maxContentLength: 5 * 1024 * 1024,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const buf = Buffer.from(resp.data);
            if (buf.length < 5000) continue;

            const msgOptions = quotedMsg ? { quoted: quotedMsg } : {};
            await sock.sendMessage(chatId, {
                audio: buf,
                mimetype: 'audio/mp4',
                ptt: false,
                fileName: `${track.artistName} - ${track.trackName}.m4a`
            }, msgOptions);
            return;
        } catch {
            continue;
        }
    }
}
