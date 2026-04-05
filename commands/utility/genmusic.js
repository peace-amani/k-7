import axios from 'axios';
import { getOwnerName } from '../../lib/menuHelper.js';

const BASE = 'https://apis.xcasper.space/api/tools/text-to-music';
const POLL_INTERVAL = 12000;   // poll every 12 seconds
const MAX_WAIT      = 240000;  // give up after 4 minutes

const STAGE_EMOJI = {
    lyrics:    '✍️',
    composing: '🎼',
    done:      '✅'
};

async function startGeneration(prompt) {
    const resp = await axios.get(`${BASE}/start`, {
        params: { prompt },
        timeout: 20000
    });
    if (!resp.data?.success || !resp.data?.job_id) {
        throw new Error('Failed to start generation');
    }
    return resp.data.job_id;
}

async function pollJob(jobId) {
    const resp = await axios.get(`${BASE}/poll`, {
        params: { job_id: jobId },
        timeout: 20000
    });
    return resp.data;
}

async function downloadBuffer(url) {
    const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000
    });
    return Buffer.from(resp.data);
}

export default {
    name:        'genmusic',
    alias:       ['makemusic', 'aimusic', 'musicai', 'songgen', 'generatesong'],
    category:    'utility',
    description: 'Generate a full AI song (MP3 + lyrics + cover) from a text prompt',

    async execute(sock, msg, args, PREFIX) {
        const chatId = msg.key.remoteJid;
        const reply  = (text, opts = {}) => sock.sendMessage(chatId, { text }, { quoted: msg, ...opts });

        const prompt = args.join(' ').trim();
        if (!prompt) {
            return reply(
                `╭─⌈ 🎵 *AI MUSIC GENERATOR* ⌋\n` +
                `├─⊷ *${PREFIX}genmusic <describe your song>*\n` +
                `│  └⊷ AI writes lyrics, composes & sends an MP3\n` +
                `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            );
        }

        // ── Start ──────────────────────────────────────────────────────────────
        await sock.sendMessage(chatId, { react: { text: '🎵', key: msg.key } });

        let statusMsg;
        try {
            statusMsg = await sock.sendMessage(chatId, {
                text: `🎵 *Generating your song…*\n\n📝 Prompt: _${prompt}_\n\n⏳ This takes 2–3 minutes. Stand by!`
            }, { quoted: msg });
        } catch { statusMsg = null; }

        let jobId;
        try {
            jobId = await startGeneration(prompt);
        } catch (err) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return reply(`❌ Could not start music generation.\n\n_${err.message}_`);
        }

        // ── Poll ───────────────────────────────────────────────────────────────
        const deadline = Date.now() + MAX_WAIT;
        let lastStep   = '';
        let result     = null;

        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL));

            let poll;
            try {
                poll = await pollJob(jobId);
            } catch {
                continue;
            }

            const step  = poll.step  || '';
            const stage = poll.status || '';
            const emoji = STAGE_EMOJI[stage] || '⏳';

            // update status message if the step changed
            if (step !== lastStep && statusMsg) {
                lastStep = step;
                try {
                    await sock.sendMessage(chatId, {
                        text: `🎵 *Generating your song…*\n\n📝 Prompt: _${prompt}_\n\n${emoji} ${step}`,
                        edit: statusMsg.key
                    });
                } catch { /* edit not supported — silently skip */ }
            }

            if (stage === 'done' && poll.result) {
                result = poll.result;
                break;
            }

            if (!poll.success) {
                break;
            }
        }

        // ── Handle failure ─────────────────────────────────────────────────────
        if (!result) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return reply(`❌ Music generation timed out or failed.\n\n💡 Try again with a simpler prompt.`);
        }

        // ── Send results ───────────────────────────────────────────────────────
        const { title, music_url, cover_url, lyrics } = result;

        // 1. Cover image + song title
        try {
            const coverBuf = await downloadBuffer(cover_url);
            await sock.sendMessage(chatId, {
                image:   coverBuf,
                caption: `🎵 *${title}*\n\n📝 _${prompt}_\n\n🎤 Lyrics below ↓`
            }, { quoted: msg });
        } catch {
            await reply(`🎵 *${title}*\n\n📝 _${prompt}_`);
        }

        // 2. MP3 audio
        try {
            const audioBuf = await downloadBuffer(music_url);
            await sock.sendMessage(chatId, {
                audio:    audioBuf,
                mimetype: 'audio/mpeg',
                ptt:      false
            });
        } catch {
            await reply(`🔗 *Download MP3:*\n${music_url}`);
        }

        // 3. Lyrics (trimmed to WA limit)
        if (lyrics) {
            const lyricsText = lyrics.length > 3000 ? lyrics.slice(0, 3000) + '…' : lyrics;
            await reply(`📜 *Lyrics — ${title}*\n\n${lyricsText}`);
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
    }
};
