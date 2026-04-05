import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getOwnerName } from '../../lib/menuHelper.js';

const execAsync = promisify(exec);

const XCASPER_TRANSCRIPT = 'https://apis.xcasper.space/api/tools/transcript';

const YT_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_\-]{11})/;

function extractYtId(text) {
    const m = text.match(YT_REGEX);
    return m ? m[1] : null;
}

async function fetchYtTranscript(urlOrId, lang = 'en') {
    const isId = /^[A-Za-z0-9_\-]{11}$/.test(urlOrId);
    const params = isId ? { id: urlOrId, lang } : { url: urlOrId, lang };

    const resp = await axios.get(XCASPER_TRANSCRIPT, { params, timeout: 30000 });
    if (!resp.data?.success) {
        throw new Error(resp.data?.error || resp.data?.message || 'Transcript fetch failed');
    }
    return resp.data;
}

async function convertToMp3(buffer) {
    const tmpDir = path.join(process.cwd(), 'tmp', 'transcribe');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const ts = Date.now();
    const inputPath  = path.join(tmpDir, `input_${ts}.ogg`);
    const outputPath = path.join(tmpDir, `output_${ts}.mp3`);

    fs.writeFileSync(inputPath, buffer);
    try {
        await execAsync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -b:a 64k -y "${outputPath}"`, { timeout: 30000 });
        const result = fs.readFileSync(outputPath);
        try { fs.unlinkSync(inputPath); } catch {}
        try { fs.unlinkSync(outputPath); } catch {}
        return result;
    } catch {
        try { fs.unlinkSync(inputPath); } catch {}
        return buffer;
    }
}

export default {
    name:        'totext',
    alias:       ['transcribe', 'speech2text', 'audio2text', 'whisper', 'stt', 'transcript', 'yttranscript'],
    category:    'ai',
    description: 'Convert audio to text OR extract YouTube transcript',

    async execute(sock, m, args, PREFIX) {
        const jid   = m.key.remoteJid;
        const reply = (text) => sock.sendMessage(jid, { text }, { quoted: m });

        const input         = args.join(' ').trim();
        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        // ── YouTube transcript mode ────────────────────────────────────────────
        const ytId = input ? extractYtId(input) : null;
        if (ytId || (input && /^[A-Za-z0-9_\-]{11}$/.test(input))) {
            const id   = ytId || input;
            const lang = args.find(a => /^[a-z]{2}(-[A-Z]{2})?$/.test(a) && a !== id) || 'en';

            await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

            let data;
            try {
                data = await fetchYtTranscript(id, lang);
            } catch (err) {
                await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                return reply(`❌ Failed to fetch transcript.\n\n_${err.message}_`);
            }

            const { fullText, wordCount, segmentCount, language, thumbnail, videoId } = data;
            const trimmed = fullText?.length > 3800 ? fullText.slice(0, 3800) + '\n…' : fullText;

            if (thumbnail) {
                try {
                    const imgResp = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
                    await sock.sendMessage(jid, {
                        image:   Buffer.from(imgResp.data),
                        caption:
                            `📜 *YouTube Transcript*\n` +
                            `━━━━━━━━━━━━━━━━━━━━━\n` +
                            `🆔 *Video:* ${videoId}\n` +
                            `🌐 *Lang:* ${language}\n` +
                            `📊 *Words:* ${wordCount}  •  *Segments:* ${segmentCount}\n` +
                            `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                            `${trimmed}\n\n` +
                            `🐺 _${getOwnerName().toUpperCase()} TECH_`
                    }, { quoted: m });
                } catch {
                    await reply(
                        `📜 *YouTube Transcript*\n` +
                        `━━━━━━━━━━━━━━━━━━━━━\n` +
                        `🆔 *Video:* ${videoId}\n` +
                        `🌐 *Lang:* ${language}\n` +
                        `📊 *Words:* ${wordCount}  •  *Segments:* ${segmentCount}\n` +
                        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `${trimmed}\n\n` +
                        `🐺 _${getOwnerName().toUpperCase()} TECH_`
                    );
                }
            } else {
                await reply(
                    `📜 *YouTube Transcript*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🆔 *Video:* ${videoId}\n` +
                    `🌐 *Lang:* ${language}\n` +
                    `📊 *Words:* ${wordCount}  •  *Segments:* ${segmentCount}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `${trimmed}\n\n` +
                    `🐺 _${getOwnerName().toUpperCase()} TECH_`
                );
            }

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
            return;
        }

        // ── Audio transcription mode ───────────────────────────────────────────
        if (!quotedMessage) {
            return reply(
                `╭─⌈ *TRANSCRIBE* ⌋\n` +
                `│\n` +
                `├─⊷ *Audio → Text:*\n` +
                `│  Reply to a voice note / audio\n` +
                `│  ${PREFIX}totext\n` +
                `│\n` +
                `├─⊷ *YouTube Transcript:*\n` +
                `│  ${PREFIX}totext <YouTube URL>\n` +
                `│  ${PREFIX}totext <video ID>\n` +
                `│  ${PREFIX}totext <URL> fr  ← with language\n` +
                `│\n` +
                `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            );
        }

        if (!quotedMessage.audioMessage && !quotedMessage.videoMessage) {
            return reply(`❌ Please reply to an audio message or voice note.`);
        }

        try {
            await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

            const quotedMsg = {
                key: {
                    id:         m.message.extendedTextMessage.contextInfo.stanzaId,
                    remoteJid:  jid,
                    participant: m.message.extendedTextMessage.contextInfo.participant
                },
                message: quotedMessage
            };

            const buffer    = await downloadMediaMessage(quotedMsg, 'buffer', {});
            if (!buffer || buffer.length === 0) throw new Error('Failed to download audio');

            const mp3Buffer = await convertToMp3(buffer);
            const FormData  = (await import('form-data')).default;

            let transcription = '';

            const apiEndpoints = [
                {
                    name:  'Keith Transcribe',
                    url:   'https://apiskeith.vercel.app/ai/transcribe',
                    parse: (d) => d?.result?.text || d?.result || d?.text || null
                },
                {
                    name:  'Ryzen STT',
                    url:   'https://api.ryzendesu.vip/api/ai/speech-to-text',
                    parse: (d) => d?.result || d?.text || d?.transcription || null
                },
                {
                    name:  'Whisper Free',
                    url:   'https://api.whisper-api.com/transcribe',
                    parse: (d) => d?.text || d?.result || d?.transcription || null
                }
            ];

            for (const ep of apiEndpoints) {
                try {
                    const form = new FormData();
                    form.append('file', mp3Buffer, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
                    const res = await axios.post(ep.url, form, {
                        headers: { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0' },
                        timeout: 60000,
                        maxContentLength: 50 * 1024 * 1024
                    });
                    const result = ep.parse(res.data);
                    if (result && typeof result === 'string' && result.trim().length > 0) {
                        transcription = result.trim();
                        break;
                    }
                } catch { continue; }
            }

            if (!transcription) throw new Error('All transcription services failed. Try shorter, clearer audio.');

            const wordCount = transcription.split(/\s+/).filter(w => w.length > 0).length;

            await reply(`🎤 *TRANSCRIPTION*\n\n${transcription}\n\n📊 ${wordCount} words`);
            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

        } catch (err) {
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await reply(`❌ Transcription failed: ${err.message}`);
        }
    }
};
