// ====== lib/quickConnect.js ======
// Quick-Connect guard — solves the "10-minute cold start" problem.
//
// PROBLEM:
//   When the bot reconnects using an old session (hours or even days old),
//   WhatsApp's servers replay every missed message in a single rapid burst.
//   Even though the main handler drops these "old" messages early, they still
//   enter the Node.js event loop as individual async callbacks — thousands of
//   them — saturating the loop and blocking NEW messages from being processed
//   for up to 10–15 minutes.
//
// SOLUTION:
//   This module provides a single fast-path check — isReplayMessage(msg) —
//   that should be placed at the very TOP of the messages.upsert handler,
//   before ANY other processing.  If it returns true, return immediately.
//
// HOW IT WORKS:
//   Phase 1 — DRAIN WINDOW (first 45 seconds after connection opens):
//     Any message older than 10 seconds is immediately dropped.
//     This covers the replay burst from the old session.
//
//   Phase 2 — BURST DETECTION (ongoing):
//     If messages arrive at > 15 per second AND all of them are old,
//     the drain window is automatically extended by 10 seconds.
//     This handles very large sessions (10+ days of missed messages).
//
//   Phase 3 — NORMAL OPERATION:
//     After the drain window expires with no burst detected, the guard
//     becomes a no-op (returns false for every message) — zero overhead.
//
// USAGE (in index.js):
//   import { markConnectionOpen, isReplayMessage } from './lib/quickConnect.js';
//
//   // In connection.update handler when connection === 'open':
//   markConnectionOpen();
//
//   // As the VERY FIRST check inside messages.upsert:
//   const msg = messages[0];
//   if (!msg || isReplayMessage(msg)) return;

// ── State ─────────────────────────────────────────────────────────────────
let connectionOpenAt    = 0;       // timestamp when 'open' was received
let drainWindowMs       = 45_000;  // initial drain window length
let drainWindowEnd      = 0;       // absolute end of drain window
let burstWindowStart    = 0;       // start of current 1-second burst window
let burstCount          = 0;       // messages seen in the current burst window
let totalDropped        = 0;       // stats: messages dropped during drain
let totalPassed         = 0;       // stats: messages passed through
let isActive            = false;   // true once markConnectionOpen() has been called

// How old a message must be (in ms) during the drain window to be dropped.
// 10 seconds is generous — real-time messages are < 2 seconds old.
const DRAIN_AGE_THRESHOLD_MS = 10_000;

// Burst detection: if this many messages arrive in 1 second…
const BURST_THRESHOLD = 15;
// …extend the drain window by this many seconds per burst.
const BURST_EXTENSION_MS = 10_000;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Call this once when `connection.update` fires with `connection === 'open'`.
 * Starts the drain window clock.
 */
export function markConnectionOpen() {
    connectionOpenAt  = Date.now();
    drainWindowEnd    = connectionOpenAt + drainWindowMs;
    burstWindowStart  = connectionOpenAt;
    burstCount        = 0;
    totalDropped      = 0;
    totalPassed       = 0;
    isActive          = true;
    globalThis._wolfSysStats = globalThis._wolfSysStats || {};
    globalThis._wolfSysStats.quickConnect = `drain ${drainWindowMs / 1000}s`;
}

/**
 * Returns true if the message should be DROPPED immediately (replay or burst).
 * Call this as the very first check inside messages.upsert.
 *
 * Safe to call before markConnectionOpen() — returns false in that case.
 */
export function isReplayMessage(msg) {
    if (!isActive) return false;

    const now = Date.now();

    // Phase 3 — drain window has expired; become a no-op
    if (now > drainWindowEnd) {
        if (isActive) {
            isActive = false;
            // drain complete — suppressed (captured in startup box)
        }
        return false;
    }

    // Extract the message timestamp in milliseconds
    const rawTs  = msg.messageTimestamp;
    const msgTs  = rawTs
        ? (typeof rawTs === 'object' ? (rawTs.low || 0) : Number(rawTs)) * 1000
        : 0;

    if (msgTs === 0) return false; // no timestamp — let it through

    const ageMs = now - msgTs;

    // ── Burst detection ────────────────────────────────────────────────────
    // Track how many messages arrive each second; if it's a burst of old
    // messages, extend the drain window so we catch the full replay.
    if (ageMs > DRAIN_AGE_THRESHOLD_MS) {
        // Count this old message toward the current 1-second burst window
        if (now - burstWindowStart < 1000) {
            burstCount++;
        } else {
            // New 1-second window — check if the last one was a burst
            if (burstCount >= BURST_THRESHOLD) {
                const newEnd = Math.max(drainWindowEnd, now + BURST_EXTENSION_MS);
                if (newEnd > drainWindowEnd) {
                    drainWindowEnd = newEnd;
                    console.log(`[QuickConnect] ⚡ Burst detected (${burstCount} msgs/s) — drain window extended to ${Math.round((drainWindowEnd - connectionOpenAt) / 1000)}s total`);
                }
            }
            burstWindowStart = now;
            burstCount       = 1;
        }

        totalDropped++;
        return true; // DROP — this is a replayed old message
    }

    // Message is fresh — let it through
    totalPassed++;
    return false;
}

/**
 * Returns true if the drain window is currently active.
 * Useful for logging / debug commands.
 */
export function isDrainActive() {
    return isActive && Date.now() <= drainWindowEnd;
}

/**
 * Returns a snapshot of drain stats for debug/status commands.
 */
export function getDrainStats() {
    const now = Date.now();
    return {
        active:          isActive && now <= drainWindowEnd,
        connectionOpenAt,
        drainWindowEndAt: drainWindowEnd,
        remainingMs:      Math.max(0, drainWindowEnd - now),
        totalDropped,
        totalPassed,
    };
}
