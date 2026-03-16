import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getOwnerName } from '../../lib/menuHelper.js';

const execAsync = promisify(exec);

async function convertToMp3(buffer) {
    const tmpDir = path.join(process.cwd(), 'tmp', 'transcribe');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const ts = Date.now();
    const inputPath = path.join(tmpDir, `input_${ts}.ogg`);
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
    name: "totext",
    alias: ["transcribe", "speech2text", "audio2text", "whisper", "stt"],
    category: "ai",
    description: "Convert audio/video to text using AI transcription",

    async execute(sock, m, args, PREFIX) {
        const jid = m.key.remoteJid;

        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMessage) {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 🎤 *TRANSCRIBE* ⌋\n├─⊷ *${PREFIX}totext (reply to audio)*\n│  └⊷ Convert speech to text\n├─⊷ *${PREFIX}transcribe (reply to audio)*\n│  └⊷ Alias for totext\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });
        }

        let mediaType = null;

        if (quotedMessage.audioMessage) {
            mediaType = "audio";
        } else if (quotedMessage.videoMessage) {
            mediaType = "video";
        } else {
            return sock.sendMessage(jid, {
                text: `❌ Please reply to an audio message or voice note.`
            }, { quoted: m });
        }

        try {
            await sock.sendMessage(jid, { react: { text: '🔄', key: m.key } });

            const quotedMsg = {
                key: {
                    id: m.message.extendedTextMessage.contextInfo.stanzaId,
                    remoteJid: jid,
                    participant: m.message.extendedTextMessage.contextInfo.participant
                },
                message: quotedMessage
            };

            const buffer = await downloadMediaMessage(quotedMsg, 'buffer', {});

            if (!buffer || buffer.length === 0) {
                throw new Error('Failed to download audio');
            }

            const mp3Buffer = await convertToMp3(buffer);

            const FormData = (await import('form-data')).default;

            let transcription = '';

            const apiEndpoints = [
                {
                    name: 'Keith Transcribe',
                    url: 'https://apiskeith.vercel.app/ai/transcribe',
                    method: 'upload',
                    parse: (data) => data?.result?.text || data?.result || data?.text || null
                },
                {
                    name: 'Ryzen STT',
                    url: 'https://api.ryzendesu.vip/api/ai/speech-to-text',
                    method: 'upload',
                    parse: (data) => data?.result || data?.text || data?.transcription || null
                },
                {
                    name: 'Whisper Free',
                    url: 'https://api.whisper-api.com/transcribe',
                    method: 'upload',
                    parse: (data) => data?.text || data?.result || data?.transcription || null
                }
            ];

            for (const endpoint of apiEndpoints) {
                try {
                    const uploadForm = new FormData();
                    const fieldName = endpoint.fieldName || 'file';
                    uploadForm.append(fieldName, mp3Buffer, {
                        filename: 'audio.mp3',
                        contentType: 'audio/mpeg'
                    });

                    const response = await axios.post(endpoint.url, uploadForm, {
                        headers: {
                            ...uploadForm.getHeaders(),
                            'User-Agent': 'Mozilla/5.0'
                        },
                        timeout: 60000,
                        maxContentLength: 50 * 1024 * 1024
                    });

                    const result = endpoint.parse(response.data);
                    if (result && typeof result === 'string' && result.trim().length > 0) {
                        transcription = result.trim();
                        console.log(`[TOTEXT] Success via ${endpoint.name}`);
                        break;
                    }
                } catch (apiErr) {
                    console.log(`[TOTEXT] ${endpoint.name} failed:`, apiErr.message);
                    continue;
                }
            }

            if (!transcription) {
                throw new Error('All transcription services failed. Try with shorter, clearer audio.');
            }

            const wordCount = transcription.split(/\s+/).filter(w => w.length > 0).length;

            await sock.sendMessage(jid, {
                text: `🎤 *TRANSCRIPTION*\n\n${transcription}\n\n📊 ${wordCount} words`
            }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

        } catch (error) {
            console.error('[TOTEXT ERROR]:', error.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, {
                text: `❌ Transcription failed: ${error.message}\n\nTry with shorter, clearer audio.`
            }, { quoted: m });
        }
    }
};
