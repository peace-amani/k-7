import { sendSubMenu } from '../../lib/menuHelper.js';

export default {
  name: 'paystackguide',
  alias: ['paystackhelp', 'mpesaguide'],
  desc: 'Detailed guide for all Paystack M-Pesa payment commands',
  category: 'Paystack',
  usage: '.paystackguide',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;

    const commandsText = `╭─⊷ *⚙️ STEP 1 — SETUP*
│
├─⊷ *${PREFIX}setpaystackkey <sk_live_...>*
│  └⊷ Set your Paystack secret key
│  └⊷ Get it: Paystack Dashboard → Settings → API
│  └⊷ Example: ${PREFIX}setpaystackkey sk_live_xxxx
│
├─⊷ *${PREFIX}setpaystackkey* (no args)
│  └⊷ View your currently saved key with a copy button
│
╰─⊷

╭─⊷ *💳 STEP 2 — SEND PAYMENT PROMPT*
│
├─⊷ *${PREFIX}prompt <phone> <amount>*
│  └⊷ Send an M-Pesa STK push to a phone number
│  └⊷ Phone can be in any format:
│     └⊷ 254713046497
│     └⊷ +254713046497
│     └⊷ 0713046497
│  └⊷ Amount is in KES
│  └⊷ Example: ${PREFIX}prompt 254713046497 100
│
├─⊷ *What happens next:*
│  └⊷ ⏳ STK push sent to the phone
│  └⊷ Customer enters their M-Pesa PIN
│  └⊷ ✅ Bot confirms payment received
│  └⊷ ❌ Bot reports if payment fails
│  └⊷ ⌛ Times out after 2 minutes if no action
│
╰─⊷`;

    await sendSubMenu(sock, jid, 'Paystack Guide', commandsText, m, PREFIX);
  },
};
