// ====== lib/buttonMode.js ======
// Tracks whether "Button Mode" is currently active.
//
// When Button Mode is ON, the bot attaches interactive quick-reply buttons
// to its responses (via the gifted-btns library) instead of plain text.
//
// State is persisted in bot_button_mode.json so it survives restarts.
// An in-memory cache (2 s TTL) avoids hitting the disk on every message.
// global.BUTTON_MODE is also kept in sync for the fastest possible reads.

import fs from 'fs';
import path from 'path';

// Where the on/off state is stored between restarts
const BUTTON_MODE_PATH = path.join(process.cwd(), 'bot_button_mode.json');

// ── In-memory cache ────────────────────────────────────────────────────────
let _cachedButtonMode = null;   // null = cache empty, true/false = known value
let _cacheTime = 0;
const CACHE_TTL = 2000; // 2 seconds

// ── Public API ─────────────────────────────────────────────────────────────

// Check if Button Mode is currently enabled.
// Read order:
//   1. In-memory cache (if still fresh within 2 s)
//   2. global.BUTTON_MODE (set by setButtonMode or index.js startup)
//   3. bot_button_mode.json on disk
// Returns false when the file doesn't exist (mode defaults to OFF).
export function isButtonModeEnabled() {
  const now = Date.now();

  // Serve cached value while it's still fresh
  if (_cachedButtonMode !== null && (now - _cacheTime) < CACHE_TTL) {
    return _cachedButtonMode;
  }

  try {
    // Global flag set at runtime is the fastest in-process signal
    if (global.BUTTON_MODE === true) {
      _cachedButtonMode = true;
      _cacheTime = now;
      return true;
    }

    // Otherwise read the persisted JSON file
    if (fs.existsSync(BUTTON_MODE_PATH)) {
      const data = JSON.parse(fs.readFileSync(BUTTON_MODE_PATH, 'utf8'));
      const enabled = data.enabled === true;
      _cachedButtonMode = enabled;
      _cacheTime = now;
      return enabled;
    }
  } catch {}

  // File absent or unreadable — mode is OFF
  _cachedButtonMode = false;
  _cacheTime = now;
  return false;
}

// Turn Button Mode on or off.
// Writes the state to disk (survives restart) and syncs global.BUTTON_MODE
// and the in-memory cache so subsequent reads are instant.
// `setBy` is the phone number of whoever ran the command (logged for auditing).
export function setButtonMode(enabled, setBy = 'Unknown') {
  const data = {
    enabled,
    setBy,
    setAt: new Date().toISOString(),
    timestamp: Date.now()
  };

  // Write to disk first so the state is durable even if the process crashes
  fs.writeFileSync(BUTTON_MODE_PATH, JSON.stringify(data, null, 2));

  // Keep runtime state in sync so isButtonModeEnabled() returns the new value
  // without waiting for the cache to expire
  global.BUTTON_MODE = enabled;
  _cachedButtonMode = enabled;
  _cacheTime = Date.now();
}

// Force the next isButtonModeEnabled() call to re-read from disk.
// Useful in tests or after an external process modifies the JSON file.
export function clearButtonModeCache() {
  _cachedButtonMode = null;
  _cacheTime = 0;
}
