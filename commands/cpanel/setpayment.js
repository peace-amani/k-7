import { createRequire } from 'module';
import { loadPaymentConfig, savePaymentConfig } from '../../lib/paymentConfig.js';
import { getBotName } from '../../lib/botname.js';

const require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = require('gifted-btns'); } catch {}

export default {
    name:      'setpayment',
    alias:     ['setprice', 'payprice', 'priceset'],
    category:  'cpanel',
    desc:      'Set prices for limited and unlimited server plans',
    ownerOnly: true,
    usage:     '.setpayment unli <amount> | .setpayment lim <amount>',

    async execute(sock, msg, args, PREFIX, extra) {
        const jid = msg.key.remoteJid;
        const BOT = getBotName();

        if (!extra?.jidManager?.isOwner(msg)) {
            return sock.sendMessage(jid, { text: '❌ Owner only.' }, { quoted: msg });
        }

        const config = loadPaymentConfig();

        // ── No args → show current prices ────────────────────────────────────
        if (!args || !args[0]) {
            const unli = config.unlimitedPrice;
            const lim  = config.limitedPrice;

            const text =
                `╭─⌈ *💰 PAYMENT PRICES* ⌋\n` +
                `├─⊷ ♾️ *Unlimited* : KES ${unli > 0 ? unli.toLocaleString() : '❌ Not set'}\n` +
                `├─⊷ 🖥️ *Limited*   : KES ${lim  > 0 ? lim.toLocaleString()  : '❌ Not set'}\n` +
                `├─⊷\n` +
                `├─⊷ *Usage:*\n` +
                `│   ${PREFIX}setpayment unli <amount>\n` +
                `│   ${PREFIX}setpayment lim <amount>\n` +
                `╰⊷ *Powered by ${BOT}*`;

            return sock.sendMessage(jid, { text }, { quoted: msg });
        }

        const plan   = args[0]?.toLowerCase();
        const amount = Number(args[1]);

        const isUnli = ['unli', 'unlimited', 'unlim'].includes(plan);
        const isLim  = ['lim', 'limited', 'limit'].includes(plan);

        if (!isUnli && !isLim) {
            return sock.sendMessage(jid, {
                text:
                    `❌ Unknown plan *${plan}*\n\n` +
                    `Use *unli* or *lim*:\n` +
                    `  ${PREFIX}setpayment unli 500\n` +
                    `  ${PREFIX}setpayment lim 200`
            }, { quoted: msg });
        }

        if (!args[1] || isNaN(amount) || amount <= 0) {
            return sock.sendMessage(jid, {
                text: `❌ Provide a valid amount.\nExample: ${PREFIX}setpayment ${plan} 500`
            }, { quoted: msg });
        }

        if (isUnli) config.unlimitedPrice = amount;
        if (isLim)  config.limitedPrice   = amount;
        savePaymentConfig(config);

        await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        await sock.sendMessage(jid, {
            text:
                `╭─⌈ *💰 PRICE UPDATED* ⌋\n` +
                `├─⊷ ${isUnli ? '♾️ Unlimited' : '🖥️ Limited'} plan set to *KES ${amount.toLocaleString()}*\n` +
                `├─⊷ ♾️ Unlimited : KES ${config.unlimitedPrice > 0 ? config.unlimitedPrice.toLocaleString() : '❌ Not set'}\n` +
                `├─⊷ 🖥️ Limited   : KES ${config.limitedPrice   > 0 ? config.limitedPrice.toLocaleString()   : '❌ Not set'}\n` +
                `╰⊷ *Powered by ${BOT}*`
        }, { quoted: msg });
    }
};
