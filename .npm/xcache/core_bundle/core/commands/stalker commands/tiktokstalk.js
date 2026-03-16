import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const API_PRIMARY  = 'https://apis.xwolf.space/api/stalk/tiktok';
const API_FALLBACK = 'https://api.giftedtech.co.ke/api/stalk/tiktokstalk';

async function fetchProfile(username) {
    // ── Primary: xwolf API ──────────────────────────────────────────
    try {
        const res = await axios.get(API_PRIMARY, {
            params: { username },
            timeout: 15000
        });
        const d = res.data;
        if (d?.success && d?.username) {
            return {
                name:       d.nickname  || d.username,
                username:   d.username,
                bio:        d.bio       || 'N/A',
                avatar:     d.avatar    || null,
                followers:  d.followers ?? 0,
                following:  d.following ?? 0,
                likes:      d.likes     ?? 0,
                videos:     d.videos    ?? null,
                verified:   d.verified  ?? false,
                private:    d.privateAccount ?? false,
                profileUrl: d.profileUrl || null,
                source:     'xwolf'
            };
        }
    } catch {}

    // ── Fallback: giftedtech API ────────────────────────────────────
    const res = await axios.get(API_FALLBACK, {
        params: { apikey: 'gifted', username },
        timeout: 20000
    });
    if (!res.data?.success || !res.data?.result) throw new Error('User not found');
    const d = res.data.result;
    return {
        name:       d.name     || d.username,
        username:   d.username || username,
        bio:        d.bio      || 'N/A',
        avatar:     d.avatar   || null,
        followers:  d.followers ?? 0,
        following:  d.following ?? 0,
        likes:      d.likes     ?? 0,
        videos:     null,
        verified:   d.verified  ?? false,
        private:    d.private   ?? false,
        profileUrl: d.website?.link || null,
        source:     'gifted'
    };
}

export default {
    name: 'tiktokstalk',
    aliases: ['ttstalk', 'tikstalk', 'tiktokinfo'],
    description: 'Stalk a TikTok user profile',
    category: 'Stalker Commands',

    async execute(sock, m, args, prefix) {
        const jid = m.key.remoteJid;

        if (!args || !args[0]) {
            return sock.sendMessage(jid, {
                text: `╭─⌈ 🔍 *TIKTOK STALKER* ⌋\n│\n├─⊷ *${prefix}tiktokstalk <username>*\n│  └⊷ Stalk a TikTok profile\n│\n├─⊷ *Example:*\n│  └⊷ ${prefix}tiktokstalk maskedwolf908\n│\n╰───────────────\n> *${getBotName()} STALKER*`
            }, { quoted: m });
        }

        const username = args[0].replace('@', '').trim();
        await sock.sendMessage(jid, { react: { text: '🔍', key: m.key } });

        try {
            const d = await fetchProfile(username);

            let avatarBuffer = null;
            if (d.avatar) {
                try {
                    const imgRes = await axios.get(d.avatar, { responseType: 'arraybuffer', timeout: 10000 });
                    if (imgRes.data.length > 500) avatarBuffer = Buffer.from(imgRes.data);
                } catch {}
            }

            const lines = [
                `╭─⌈ 🎵 *TIKTOK PROFILE* ⌋`,
                `│`,
                `├─⊷ *👤 Name:* ${d.name}`,
                `├─⊷ *🏷️ Username:* @${d.username}`,
                `├─⊷ *📝 Bio:* ${d.bio}`,
                `├─⊷ *👥 Followers:* ${Number(d.followers).toLocaleString()}`,
                `├─⊷ *👤 Following:* ${Number(d.following).toLocaleString()}`,
                `├─⊷ *❤️ Likes:* ${Number(d.likes).toLocaleString()}`,
            ];
            if (d.videos !== null) lines.push(`├─⊷ *🎬 Videos:* ${d.videos}`);
            lines.push(`├─⊷ *✅ Verified:* ${d.verified ? 'Yes ✔️' : 'No'}`);
            lines.push(`├─⊷ *🔒 Private:* ${d.private ? 'Yes' : 'No'}`);
            if (d.profileUrl) lines.push(`├─⊷ *🔗 Profile:* ${d.profileUrl}`);
            lines.push(`│`, `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`, `> 🐺 *${getBotName()} STALKER*`);

            const caption = lines.join('\n');

            if (avatarBuffer) {
                await sock.sendMessage(jid, { image: avatarBuffer, caption }, { quoted: m });
            } else {
                await sock.sendMessage(jid, { text: caption }, { quoted: m });
            }

            await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

        } catch (error) {
            console.error('❌ [TIKTOKSTALK] Error:', error.message);
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, {
                text: `❌ *TikTok Stalk Failed*\n\n⚠️ ${error.message}\n\n💡 Check the username and try again.`
            }, { quoted: m });
        }
    }
};
