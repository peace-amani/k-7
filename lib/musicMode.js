import fs from 'fs';
import path from 'path';
import axios from 'axios';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'musicmode.json');

const DEFAULT_CLIPS = [
    'https://cdn.pixabay.com/download/audio/2022/03/15/audio_8cb749d3a7.mp3',
    'https://cdn.pixabay.com/download/audio/2022/08/02/audio_884fe92c21.mp3',
    'https://cdn.pixabay.com/download/audio/2021/11/25/audio_5615e4dc72.mp3',
    'https://cdn.pixabay.com/download/audio/2022/10/30/audio_3cf82b1b42.mp3',
    'https://cdn.pixabay.com/download/audio/2022/01/18/audio_c8b8058e29.mp3',
    'https://cdn.pixabay.com/download/audio/2021/08/09/audio_cbc2567e8d.mp3',
    'https://cdn.pixabay.com/download/audio/2022/05/16/audio_1f1a8b0da6.mp3',
    'https://cdn.pixabay.com/download/audio/2023/02/28/audio_9a9be5f84d.mp3',
    'https://cdn.pixabay.com/download/audio/2022/11/22/audio_febc508520.mp3',
    'https://cdn.pixabay.com/download/audio/2021/04/07/audio_e8d95b3de9.mp3',
    'https://cdn.pixabay.com/download/audio/2022/07/25/audio_5e34b31b36.mp3',
    'https://cdn.pixabay.com/download/audio/2023/01/10/audio_b3e9e1ca7e.mp3',
    'https://cdn.pixabay.com/download/audio/2022/06/07/audio_b5a6d8de2e.mp3',
    'https://cdn.pixabay.com/download/audio/2021/09/06/audio_36d1c69b6e.mp3',
    'https://cdn.pixabay.com/download/audio/2022/12/05/audio_5d7b3e0f6a.mp3',
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
    return { enabled: false, clips: [...DEFAULT_CLIPS], setBy: null, setAt: null };
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

export function getMusicClips() {
    return _load().clips || [...DEFAULT_CLIPS];
}

export function addMusicClip(url) {
    const data = _load();
    if (!data.clips) data.clips = [...DEFAULT_CLIPS];
    if (data.clips.includes(url)) return false;
    data.clips.push(url);
    _save(data);
    return true;
}

export function removeMusicClip(index) {
    const data = _load();
    if (!data.clips || index < 0 || index >= data.clips.length) return null;
    const [removed] = data.clips.splice(index, 1);
    _save(data);
    return removed;
}

export function resetMusicClips() {
    const data = _load();
    data.clips = [...DEFAULT_CLIPS];
    _save(data);
}

export async function sendMusicClip(sock, chatId, quotedMsg = null) {
    const clips = getMusicClips();
    if (!clips.length) return;

    const shuffled = [...clips].sort(() => Math.random() - 0.5);

    for (const url of shuffled) {
        try {
            const resp = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 15000,
                maxContentLength: 8 * 1024 * 1024,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const buf = Buffer.from(resp.data);
            if (buf.length < 1000) continue;

            const msgOptions = quotedMsg ? { quoted: quotedMsg } : {};
            await sock.sendMessage(chatId, {
                audio: buf,
                mimetype: 'audio/mpeg',
                ptt: false
            }, msgOptions);
            return;
        } catch {
            continue;
        }
    }
}
