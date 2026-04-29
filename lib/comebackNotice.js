// ── Comeback Notice ──────────────────────────────────────────────────────────
// Sent to the owner after the bot reconnects, announcing that the GitHub
// account / repository is back online after being temporarily flagged or
// reviewed.
//
// To STOP sending the notice:  change true → false  (one word, that's it)
// To START sending the notice: change false → true
// ─────────────────────────────────────────────────────────────────────────────

const ENABLED = true;

// ─────────────────────────────────────────────────────────────────────────────

import { OWNER, REPO_URL, PROFILE_URL, AVATAR_URL } from './repoConfig.js';

const OWNER_NAME   = 'WOLF';
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbBLCPaJUM2TGTpRfP3F';

export async function sendComebackNotice(sock, jid) {
    if (!ENABLED) return;
    try {
        const notice =
            `╭─⌈ 🎉 *GOOD NEWS!* ⌋\n` +
            `│\n` +
            `├─⊷ My GitHub account is *back online* ✅\n` +
            `├─⊷ The review is complete — repo is fully restored\n` +
            `├─⊷ Updates and source code are flowing again\n` +
            `│\n` +
            `├─⊷ 🐙 GitHub:  ${PROFILE_URL}\n` +
            `├─⊷ 📦 Repo:    ${REPO_URL}\n` +
            `├─⊷ 📣 Channel: ${CHANNEL_LINK}\n` +
            `╰⊷ Thanks for sticking around! 🐺\n\n` +
            `*Powered by ${OWNER_NAME} TECH*`;

        await sock.sendMessage(jid, {
            text: notice,
            contextInfo: {
                externalAdReply: {
                    title: `🎉 GitHub Account Restored — ${OWNER}`,
                    body:  'Repo is back online — all systems go',
                    mediaType: 1,
                    thumbnailUrl: AVATAR_URL,
                    sourceUrl:    REPO_URL,
                    mediaUrl:     REPO_URL,
                    renderLargerThumbnail: false
                }
            }
        });
    } catch {
        // Silent fail — never crash the main flow
    }
}
