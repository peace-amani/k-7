import { isPaystackConfigured, initiateCharge, verifyCharge } from '../../lib/paystack.js';
import { getBotName } from '../../lib/botname.js';

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 24;

export default {
    name: 'prompt',
    alias: ['stkpush', 'payprompt', 'mpesa'],
    category: 'paystack',
    desc: 'Send an M-Pesa STK push payment request',
    ownerOnly: true,
    usage: '.prompt <phone> <amount>',

    async execute(sock, msg, args, PREFIX, extra) {
        const jid = msg.key.remoteJid;
        const BOT = getBotName();

        if (!extra?.jidManager?.isOwner(msg)) {
            return sock.sendMessage(jid, { text: '❌ Owner only.' }, { quoted: msg });
        }

        if (!isPaystackConfigured()) {
            return sock.sendMessage(jid, {
                text: `❌ Paystack not configured.\nRun *${PREFIX}setpaystackkey sk_live_xxxx* first.`
            }, { quoted: msg });
        }

        const phone = args?.[0];
        const amount = args?.[1];

        if (!phone || !amount || isNaN(Number(amount))) {
            return sock.sendMessage(jid, {
                text:
                    `❌ Invalid usage.\n\n` +
                    `*Usage:* ${PREFIX}prompt <phone> <amount>\n` +
                    `*Example:* ${PREFIX}prompt 254713046497 100`
            }, { quoted: msg });
        }

        if (Number(amount) <= 0) {
            return sock.sendMessage(jid, { text: '❌ Amount must be greater than 0.' }, { quoted: msg });
        }

        await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

        const waitMsg = await sock.sendMessage(jid, {
            text:
                `╭─⌈ *💳 STK PUSH SENT* ⌋\n` +
                `├─⊷ 📱 *Phone*  : ${phone}\n` +
                `├─⊷ 💰 *Amount* : KES ${Number(amount).toLocaleString()}\n` +
                `├─⊷\n` +
                `├─⊷ ⏳ Waiting for payment confirmation...\n` +
                `╰⊷ *Powered by ${BOT}*`
        }, { quoted: msg });

        let reference;
        try {
            const charge = await initiateCharge(phone, amount);
            reference = charge?.reference;
            console.log(`[prompt] Charge initiated — ref: ${reference}, status: ${charge?.status}`);
        } catch (err) {
            console.log(`[prompt] Charge error: ${err.message}`);
            await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
            return sock.sendMessage(jid, {
                text: `❌ Failed to send STK push:\n${err.message}`
            }, { quoted: msg });
        }

        if (!reference) {
            await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
            return sock.sendMessage(jid, {
                text: `❌ No reference returned from Paystack. Check your key and try again.`
            }, { quoted: msg });
        }

        for (let i = 0; i < MAX_POLLS; i++) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

            try {
                const tx = await verifyCharge(reference);
                const status = tx?.status;
                console.log(`[prompt] Poll ${i + 1}/${MAX_POLLS} — status: ${status}`);

                if (status === 'success') {
                    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
                    await sock.sendMessage(jid, {
                        text:
                            `╭─⌈ *✅ PAYMENT RECEIVED* ⌋\n` +
                            `├─⊷ 📱 *Phone*     : ${phone}\n` +
                            `├─⊷ 💰 *Amount*    : KES ${Number(amount).toLocaleString()}\n` +
                            `├─⊷ 🔖 *Reference* : ${reference}\n` +
                            `├─⊷ 🕐 *Time*      : ${new Date().toLocaleTimeString()}\n` +
                            `╰⊷ *Powered by ${BOT}*`
                    }, { quoted: msg });
                    return;
                }

                if (status === 'failed' || status === 'reversed') {
                    await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
                    return sock.sendMessage(jid, {
                        text:
                            `╭─⌈ *❌ PAYMENT FAILED* ⌋\n` +
                            `├─⊷ 📱 *Phone*  : ${phone}\n` +
                            `├─⊷ 💰 *Amount* : KES ${Number(amount).toLocaleString()}\n` +
                            `├─⊷ ❌ *Status* : ${status}\n` +
                            `╰⊷ *Powered by ${BOT}*`
                    }, { quoted: msg });
                }

            } catch (err) {
                console.log(`[prompt] Poll error: ${err.message}`);
            }
        }

        await sock.sendMessage(jid, { react: { text: '⌛', key: msg.key } });
        await sock.sendMessage(jid, {
            text:
                `╭─⌈ *⌛ PAYMENT TIMEOUT* ⌋\n` +
                `├─⊷ 📱 *Phone*     : ${phone}\n` +
                `├─⊷ 💰 *Amount*    : KES ${Number(amount).toLocaleString()}\n` +
                `├─⊷ 🔖 *Reference* : ${reference}\n` +
                `├─⊷ ⚠️ No confirmation received after 2 minutes\n` +
                `╰⊷ *Powered by ${BOT}*`
        }, { quoted: msg });
    }
};
