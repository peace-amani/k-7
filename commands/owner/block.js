export default {
    name: 'block',
    description: 'Guide to block a user manually on WhatsApp',
    category: 'owner',
    async execute(sock, msg) {
        await sock.sendMessage(msg.key.remoteJid, {
            text: `🚫 *How to Block on WhatsApp*\n\n` +
                `Due to WhatsApp API limitations, bots cannot block users directly.\n\n` +
                `👉 *To block someone:*\n` +
                `• Open their chat\n` +
                `• Tap their name/number at the top\n` +
                `• Scroll down and tap *Block*\n\n` +
                `Or via settings:\n` +
                `• *Settings → Privacy → Blocked Contacts → Add New*`,
        }, { quoted: msg });
    },
};
