---
name: DM response invisible bug
description: Why text responses never showed in other users' DMs even though commands executed fine.
---

# DM interactive message drop

**The rule:** The `sock.sendMessage` override in `index.js` (around the button-mode section) must only call `_giftedBtns.sendInteractiveMessage` for group JIDs (`jid.endsWith('@g.us')`). For DMs, fall through to the plain `_sendWithRetry`.

**Why:** WhatsApp silently discards interactive/button messages sent to DM JIDs on modern clients. The Baileys `sendMessage` call resolves successfully (no error thrown), so there is no catch-path fallback — the bot logs "sent" but the recipient sees nothing. Groups render interactive messages fine.

**How to apply:** In the `sendMessage` override block that handles `isButtonModeEnabled() && isTextOnly && !hasMedia`, gate the `sendInteractiveMessage` call behind `jid.endsWith('@g.us')`. DMs skip the block entirely and reach the plain `_sendWithRetry` call that follows.
