import { getBotName } from '../../lib/botname.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const DOCX_MIMES = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/doc',
    'application/docx'
];

export default {
    name: 'extractword',
    alias: ['docxreader', 'readdocx', 'wordreader', 'readword', 'docxtxt'],
    description: 'Extract and read text from a Word (.docx) document',
    category: 'utility',

    async execute(sock, m, args, PREFIX) {
        const chatId = m.key.remoteJid;

        const contextInfo = m.message?.extendedTextMessage?.contextInfo;
        const quotedMsg   = contextInfo?.quotedMessage;
        const docMsg      = quotedMsg?.documentMessage;

        if (!quotedMsg || !docMsg) {
            return sock.sendMessage(chatId, {
                text: `╭⊷『 📖 WORD READER 』\n│\n` +
                      `├⊷ *Usage:*\n` +
                      `├⊷ Reply to a Word file (.docx) with ${PREFIX}extractword\n` +
                      `│\n` +
                      `├⊷ *Aliases:*\n` +
                      `├⊷ ${PREFIX}docxreader\n` +
                      `├⊷ ${PREFIX}readdocx\n` +
                      `└⊷ ${PREFIX}wordreader\n\n` +
                      `╰⊷ *${getBotName()} Utility* 🐾`
            }, { quoted: m });
        }

        const mimeType = docMsg.mimetype || '';
        const fileName = docMsg.fileName || '';
        const isDocx   = DOCX_MIMES.some(t => mimeType.includes(t.split('/')[1]))
                      || fileName.toLowerCase().endsWith('.docx')
                      || fileName.toLowerCase().endsWith('.doc');

        if (!isDocx) {
            return sock.sendMessage(chatId, {
                text: `╭⊷『 📖 WORD READER 』\n│\n` +
                      `├⊷ *Error:* The replied file is not a Word document\n` +
                      `└⊷ Please reply to a .docx or .doc file\n\n` +
                      `╰⊷ *${getBotName()} Utility* 🐾`
            }, { quoted: m });
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

        try {
            const fakeMsg = {
                key: {
                    id:          contextInfo.stanzaId,
                    remoteJid:   chatId,
                    participant: contextInfo.participant || undefined
                },
                message: quotedMsg
            };

            const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
            if (!buffer || buffer.length === 0) throw new Error('Failed to download document');

            const mammoth = require('mammoth');
            const result  = await mammoth.extractRawText({ buffer });

            const rawText = (result.value || '').trim();
            const displayName = fileName || 'document.docx';

            if (!rawText) {
                await sock.sendMessage(chatId, { react: { text: '⚠️', key: m.key } });
                return sock.sendMessage(chatId, {
                    text: `╭⊷『 📖 WORD READER 』\n│\n` +
                          `├⊷ *File:* ${displayName}\n` +
                          `│\n` +
                          `├⊷ *Result:* No readable text found\n` +
                          `└⊷ The document may be empty or image-only\n\n` +
                          `╰⊷ *${getBotName()} Utility* 🐾`
                }, { quoted: m });
            }

            const MAX_CHARS = 3500;
            const trimmed   = rawText.length > MAX_CHARS
                ? rawText.slice(0, MAX_CHARS) + `\n\n… *(truncated — ${rawText.length - MAX_CHARS} more chars)*`
                : rawText;

            const wordCount = rawText.split(/\s+/).filter(Boolean).length;
            const charCount = rawText.length;

            await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });
            await sock.sendMessage(chatId, {
                text: `╭⊷『 📖 WORD EXTRACTED 』\n│\n` +
                      `├⊷ *File:* ${displayName}\n` +
                      `├⊷ *Words:* ${wordCount}\n` +
                      `├⊷ *Chars:* ${charCount}\n` +
                      `│\n` +
                      `├⊷ *Content:*\n` +
                      `│\n` +
                      `${trimmed}\n\n` +
                      `╰⊷ *${getBotName()} Utility* 🐾`
            }, { quoted: m });

        } catch (err) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(chatId, {
                text: `╭⊷『 📖 WORD READER 』\n│\n` +
                      `├⊷ *Error:* ${err.message}\n` +
                      `└⊷ Make sure the file is a valid .docx document\n\n` +
                      `╰⊷ *${getBotName()} Utility* 🐾`
            }, { quoted: m });
        }
    }
};
