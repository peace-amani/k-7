import fetch from "node-fetch";
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: "imagegen",
    alias: ["img", "generate"],
    desc: "Generate images from multiple sources: AI, anime, memes",
    category: "Fun",
    usage: ".imagegen <type> <prompt>",

    async execute(sock, m) {
        const jid = m.key.remoteJid;
        const args = m.message?.conversation?.split(" ").slice(1) || [];

        if (!args.length) {
            return sock.sendMessage(jid, { text: `╭─⌈ 🎨 *IMAGE GENERATOR* ⌋\n│\n├─⊷ *.imagegen <type> <prompt>*\n│  └⊷ Generate images from multiple sources\n│\n├─⊷ *Types:* ai, waifu, neko, meme\n│\n├─⊷ *Example:*\n│  └⊷ .imagegen ai anime wolf\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` }, { quoted: m });
        }

        const type = args[0].toLowerCase();
        const prompt = args.slice(1).join(" ");

        try {
            let imageUrl = "";

            if (type === "waifu") {
                const res = await fetch("https://api.waifu.pics/sfw/waifu");
                const data = await res.json();
                imageUrl = data.url;

            } else if (type === "neko") {
                const res = await fetch("https://api.waifu.pics/sfw/neko");
                const data = await res.json();
                imageUrl = data.url;

            } else if (type === "meme") {
                const res = await fetch(`https://api.imgflip.com/caption_image?template_id=112126428&text0=${encodeURIComponent(prompt)}&username=<USERNAME>&password=<PASSWORD>`);
                const data = await res.json();
                imageUrl = data.data?.url || "";

            } else if (type === "ai") {
                // Example using OpenAI DALL·E API
                const res = await fetch("https://api.openai.com/v1/images/generations", {
                    method: "POST",
                    headers: {
                        "Authorization": "Bearer YOUR_OPENAI_API_KEY",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        prompt: prompt || "anime wolf",
                        n: 1,
                        size: "1024x1024"
                    })
                });
                const data = await res.json();
                imageUrl = data.data[0]?.url || "";
            } else {
                return sock.sendMessage(jid, { text: "Unknown type. Choose: ai, waifu, neko, meme" }, { quoted: m });
            }

            if (!imageUrl) throw new Error("Failed to fetch image.");

            await sock.sendMessage(jid, { image: { url: imageUrl }, caption: `🖼️ Image generated from ${type}` }, { quoted: m });

        } catch (err) {
            console.error("ImageGen error:", err);
            await sock.sendMessage(jid, { text: "⚠️ Failed to generate image." }, { quoted: m });
        }
    }
};
