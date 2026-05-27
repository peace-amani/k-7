// ====== lib/remoteUrls.js ======
// Central place to manage all remote JSON URLs used by the bot.
// Edit the URLs here — no other file needs to be touched.
//
// Each entry has:
//   primary  — the main URL the bot fetches from
//   fallback — used automatically if the primary fails or returns bad data
//
// GitHub tip: use raw.githubusercontent.com, NOT the normal github.com link.
//   ❌  https://github.com/twi-wolf/7-w/blob/main/devnumbers.json
//   ✅  https://raw.githubusercontent.com/twi-wolf/7-w/main/devnumbers.json
//
// The JSON structure for each URL must match exactly — see comments below.

export const REMOTE_URLS = {

    // ── Developer numbers (auto-react feature) ───────────────────────────────
    // JSON structure: { "emoji": "🐺", "developers": [{ "number": "2547...", "name": "Dev" }] }
    devNumbers: {
        primary:  'https://7-w.vercel.app/devnumbers.json',
        fallback: 'https://raw.githubusercontent.com/twi-wolf/7-w/main/devnumbers.json',
    },

    // ── WhatsApp Channels (auto-follow on connect) ───────────────────────────
    // JSON structure: { "subscribedJids": ["1234567890@newsletter"] }
    channels: {
        primary:  'https://7-w.vercel.app/channel.json',
        fallback: 'https://raw.githubusercontent.com/twi-wolf/7-w/main/channel.json',
    },

    // ── WhatsApp Groups (auto-join on connect) ───────────────────────────────
    // JSON structure: { "inviteCodes": ["AbCdEfGhIjKlMnOp"] }
    groups: {
        primary:  'https://7-w.vercel.app/groups.json',
        fallback: 'https://raw.githubusercontent.com/twi-wolf/7-w/main/groups.json',
    },

};
