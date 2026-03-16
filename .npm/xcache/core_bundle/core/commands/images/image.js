import axios from "axios";
import { getOwnerName } from '../../lib/menuHelper.js';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://duckduckgo.com/'
};

async function getDDGToken(query) {
    const resp = await axios.get('https://duckduckgo.com/', {
        params: { q: query },
        headers: { ...HEADERS, Accept: 'text/html' },
        timeout: 10000
    });
    const html = resp.data;
    const match = html.match(/vqd=["']?([\d-]+)["']?/) ||
                  html.match(/vqd%3D([\d-]+)/) ||
                  html.match(/vqd=([\d-]+)/);
    if (match) return match[1];

    const tokenResp = await axios.post('https://duckduckgo.com/', null, {
        params: { q: query },
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
    });
    const postMatch = tokenResp.data?.match(/vqd=["']?([\d-]+)["']?/);
    return postMatch?.[1] || null;
}

async function searchDDGImages(query, limit = 8) {
    const vqd = await getDDGToken(query);
    if (!vqd) throw new Error('Could not get DuckDuckGo token');

    const resp = await axios.get('https://duckduckgo.com/i.js', {
        params: {
            l: 'us-en',
            o: 'json',
            q: query,
            vqd: vqd,
            f: ',,,,,',
            p: '1'
        },
        headers: HEADERS,
        timeout: 15000
    });

    const results = resp.data?.results;
    if (!Array.isArray(results) || results.length === 0) {
        throw new Error('No DuckDuckGo image results');
    }

    return results.slice(0, limit).map(r => ({
        url: r.image,
        thumbnail: r.thumbnail,
        title: r.title || '',
        source: r.url || '',
        width: r.width,
        height: r.height
    })).filter(r => r.url && r.url.startsWith('http'));
}

async function searchGoogleImages(query, limit = 8) {
    const resp = await axios.get('https://www.google.com/search', {
        params: {
            q: query,
            tbm: 'isch',
            ijn: '0'
        },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 15000
    });

    const html = resp.data;
    const images = [];

    const patterns = [
        /\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)[^"]*)",\s*(\d+),\s*(\d+)\]/gi,
        /\["(https?:\/\/[^"]+)",\s*(\d+),\s*(\d+)\]/gi
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const url = match[1];
            if (url.includes('gstatic.com') || url.includes('google.com') || url.includes('googleapis.com')) continue;
            if (url.length > 500) continue;
            if (!images.find(i => i.url === url)) {
                images.push({
                    url: url,
                    title: '',
                    width: parseInt(match[2]) || 0,
                    height: parseInt(match[3]) || 0
                });
            }
            if (images.length >= limit) break;
        }
        if (images.length >= limit) break;
    }

    if (images.length === 0) {
        const srcMatches = html.matchAll(/data-src="(https?:\/\/[^"]+)"/gi);
        for (const m of srcMatches) {
            if (!m[1].includes('google.com') && !m[1].includes('gstatic.com')) {
                images.push({ url: m[1], title: '' });
                if (images.length >= limit) break;
            }
        }
    }

    if (images.length === 0) throw new Error('No Google image results parsed');
    return images;
}

async function downloadImage(url) {
    const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxContentLength: 10 * 1024 * 1024,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/*,*/*',
            'Referer': new URL(url).origin
        }
    });

    const ct = resp.headers['content-type'] || '';
    if (!ct.startsWith('image/')) throw new Error('Not an image');

    const buf = Buffer.from(resp.data);
    if (buf.length < 1000) throw new Error('Image too small');
    if (buf.length > 5 * 1024 * 1024) throw new Error('Image too large for WhatsApp');

    let mime = 'image/jpeg';
    if (ct.includes('png')) mime = 'image/png';
    else if (ct.includes('gif')) mime = 'image/gif';
    else if (ct.includes('webp')) mime = 'image/webp';

    return { buffer: buf, mime };
}

export default {
    name: "image",
    aliases: ["img", "pic", "photo", "searchimage"],
    category: "Search",
    description: "Search and download images from the web",

    async execute(sock, m, args, PREFIX) {
        const jid = m.key.remoteJid;
        let query = "";

        if (args.length > 0) {
            query = args.join(" ");
        } else if (m.quoted?.text) {
            query = m.quoted.text;
        } else {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 📸 *IMAGE SEARCH* ⌋\n│\n├─⊷ *${PREFIX}image <query>*\n│  └⊷ Search and download images from the web\n│\n├─⊷ *${PREFIX}image <query> -limit <n>*\n│  └⊷ Set number of results (max 10)\n│\n├─⊷ *Examples:*\n│  └⊷ ${PREFIX}image beautiful sunset\n│  └⊷ ${PREFIX}pic cute animals -limit 3\n│\n├─⊷ *Aliases:* img, pic, photo\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: m });
        }

        let limit = 5;
        const limitMatch = query.match(/-limit\s+(\d+)/i);
        if (limitMatch) {
            limit = Math.min(Math.max(parseInt(limitMatch[1]), 1), 10);
            query = query.replace(limitMatch[0], '').trim();
        }

        if (!query) {
            return sock.sendMessage(jid, { text: '❌ Please provide a search query.' }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '🔍', key: m.key } });

        let images = [];
        let apiUsed = '';

        try {
            images = await searchDDGImages(query, limit + 5);
            apiUsed = 'DuckDuckGo';
        } catch (e1) {
            console.log(`[IMAGE] DDG failed: ${e1.message}`);
            try {
                images = await searchGoogleImages(query, limit + 5);
                apiUsed = 'Google';
            } catch (e2) {
                console.log(`[IMAGE] Google failed: ${e2.message}`);
                await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
                return sock.sendMessage(jid, {
                    text: `❌ *Image search failed*\n\nCould not find images for "${query}".\n\n💡 *Try:*\n• Different keywords\n• Simpler search terms\n• Try again in a moment`
                }, { quoted: m });
            }
        }

        if (images.length === 0) {
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            return sock.sendMessage(jid, {
                text: `❌ No images found for "${query}"\n\n💡 Try different keywords or simpler search terms.`
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '⬇️', key: m.key } });

        let sent = 0;
        for (let i = 0; i < images.length && sent < limit; i++) {
            try {
                let imageUrl = images[i].url;
                let downloaded;

                try {
                    downloaded = await downloadImage(imageUrl);
                } catch {
                    if (images[i].thumbnail) {
                        downloaded = await downloadImage(images[i].thumbnail);
                    } else {
                        continue;
                    }
                }

                sent++;
                await sock.sendMessage(jid, {
                    image: downloaded.buffer,
                    mimetype: downloaded.mime,
                    caption: sent === 1
                        ? `📸 *Image ${sent}/${limit}* — "${query}"\n🔍 via ${apiUsed}`
                        : `📸 *${sent}/${limit}*`
                });

                if (sent < limit && i < images.length - 1) {
                    await new Promise(r => setTimeout(r, 800));
                }
            } catch (err) {
                console.log(`[IMAGE] Skip image ${i + 1}: ${err.message}`);
            }
        }

        if (sent === 0) {
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            return sock.sendMessage(jid, {
                text: `❌ Found results but couldn't download any images.\n\n💡 Try: \`${PREFIX}image ${query} -limit 3\``
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
    }
};
