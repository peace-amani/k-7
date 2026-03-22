import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'data', 'paystack_config.json');

export function loadPaystackConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch {}
    return { secretKey: '' };
}

export function savePaystackConfig(config) {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function isPaystackConfigured() {
    const c = loadPaystackConfig();
    return !!c.secretKey;
}

function normalizePhone(phone) {
    let p = String(phone).trim().replace(/\s+/g, '');
    if (p.startsWith('+')) p = p.slice(1);
    if (p.startsWith('0')) p = '254' + p.slice(1);
    if (!p.startsWith('254')) p = '254' + p;
    return '+' + p;
}

export async function initiateCharge(phone, amountKES) {
    const { secretKey } = loadPaystackConfig();
    const normalizedPhone = normalizePhone(phone);
    const email = `${normalizedPhone.replace('+', '')}@paystack.bot`;
    const amountInCents = Math.round(Number(amountKES) * 100);
    console.log(`[paystack] Phone normalized: ${phone} → ${normalizedPhone}`);

    const res = await fetch('https://api.paystack.co/charge', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            email,
            amount: amountInCents,
            currency: 'KES',
            mobile_money: {
                phone: normalizedPhone,
                provider: 'mpesa'
            }
        })
    });

    const data = await res.json().catch(() => ({}));
    console.log(`[paystack] Charge response: HTTP ${res.status} — status: ${data.status} — msg: ${data.message}`);
    if (!data.status) throw new Error(data.message || 'Failed to initiate charge');
    return data.data;
}

export async function verifyCharge(reference) {
    const { secretKey } = loadPaystackConfig();

    const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Accept': 'application/json'
        }
    });

    const data = await res.json().catch(() => ({}));
    return data.data || null;
}
