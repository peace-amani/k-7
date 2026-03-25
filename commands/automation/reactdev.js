import { getPhoneFromLid } from '../../lib/sudo-store.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const DEV_NUMBERS = ['254703397679', '254713046497', '254733961184'];
const DEV_EMOJI = '🐺';

function extractNumber(jid) {
    if (!jid) return '';
    return jid.replace(/[:@].*/g, '');
}

function isDevJid(jid) {
    if (!jid) return false;
    const number = extractNumber(jid);
    if (DEV_NUMBERS.includes(number)) return true;
    if (jid.includes('@lid')) {
        // Use the full resolver: runtime cache → SQLite → Baileys signalRepository
        const resolved = globalThis.resolvePhoneFromLid?.(jid)
            || globalThis.lidPhoneCache?.get(number)
            || getPhoneFromLid(number);
        if (resolved && DEV_NUMBERS.includes(extractNumber(resolved))) return true;
    }
    return false;
}

export async function handleReactDev(sock, msg) {
    try {
        if (!msg?.key || !msg.message) { console.log('🐺 [REACTDEV] skip: no key/message'); return; }

        if (msg.message.reactionMessage) { console.log('🐺 [REACTDEV] skip: reaction msg'); return; }

        const ts = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : 0;
        const age = ts > 0 ? Date.now() - ts : 0;
        if (ts > 0 && age > 30000) { console.log(`🐺 [REACTDEV] skip: too old (${age}ms)`); return; }

        const remoteJid = msg.key.remoteJid || '';
        if (remoteJid === 'status@broadcast') return;
        if (msg.key.fromMe) return;

        let senderJid = '';
        if (remoteJid.endsWith('@g.us')) {
            senderJid = msg.key.participant || '';
        } else {
            senderJid = remoteJid;
        }

        if (!senderJid) { console.log('🐺 [REACTDEV] skip: no senderJid'); return; }

        const rawNum = senderJid.replace(/[:@].*/g, '');
        const isLid = senderJid.includes('@lid');
        let resolved = null;
        if (isLid) {
            resolved = globalThis.resolvePhoneFromLid?.(senderJid)
                || globalThis.lidPhoneCache?.get(rawNum)
                || getPhoneFromLid(rawNum);
        }

        console.log(`🐺 [REACTDEV] sender=${senderJid} raw=${rawNum} isLid=${isLid} resolved=${resolved} devMatch=${isDevJid(senderJid)}`);

        if (!isDevJid(senderJid)) { console.log('🐺 [REACTDEV] skip: not a dev'); return; }

        // Build a normalized reaction key — WhatsApp servers match reactions by
        // phone-number JID, not LID. If the sender's participant is a LID, replace
        // it with the resolved phone number so the server can locate the message.
        const reactKey = { ...msg.key };
        if (reactKey.participant?.includes('@lid') && resolved) {
            reactKey.participant = `${resolved}@s.whatsapp.net`;
            console.log(`🐺 [REACTDEV] normalized participant: ${msg.key.participant} → ${reactKey.participant}`);
        }

        console.log(`🐺 [REACTDEV] sending reaction to ${remoteJid}`);
        await sock.sendMessage(remoteJid, {
            react: { text: DEV_EMOJI, key: reactKey }
        });
        console.log('🐺 [REACTDEV] reaction sent ✅');
    } catch (e) {
        console.log(`🐺 [REACTDEV] ERROR: ${e?.message || e}`);
    }
}

export default {
    name: 'reactdev',
    alias: ['devreact'],
    category: 'automation',
    description: 'Auto-react to developer messages with a wolf emoji',
    ownerOnly: true,

    async execute(sock, msg, args) {
        const chatId = msg.key.remoteJid;
        const devList = DEV_NUMBERS.map(n => `│ • +${n}`).join('\n');
        return await sock.sendMessage(chatId, {
            text: `╭─⌈ 🐺 *REACT DEV* ⌋\n│\n│ Status: ✅ ALWAYS ACTIVE\n│ Emoji: ${DEV_EMOJI}\n│\n│ *Developers:*\n${devList}\n│\n│ _Auto-reacts to developer\n│ messages in all DMs & groups_\n│ _Works in admin-only groups_\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
        });
    }
};
