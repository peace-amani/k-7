import fs from 'fs';
import path from 'path';

const BUTTON_MODE_PATH = path.join(process.cwd(), 'bot_button_mode.json');

let _cachedButtonMode = null;
let _cacheTime = 0;
const CACHE_TTL = 2000;

export function isButtonModeEnabled() {
  const now = Date.now();
  if (_cachedButtonMode !== null && (now - _cacheTime) < CACHE_TTL) {
    return _cachedButtonMode;
  }

  try {
    if (global.BUTTON_MODE === true) {
      _cachedButtonMode = true;
      _cacheTime = now;
      return true;
    }

    if (fs.existsSync(BUTTON_MODE_PATH)) {
      const data = JSON.parse(fs.readFileSync(BUTTON_MODE_PATH, 'utf8'));
      const enabled = data.enabled === true;
      _cachedButtonMode = enabled;
      _cacheTime = now;
      return enabled;
    }
  } catch {}

  _cachedButtonMode = false;
  _cacheTime = now;
  return false;
}

export function setButtonMode(enabled, setBy = 'Unknown') {
  const data = {
    enabled,
    setBy,
    setAt: new Date().toISOString(),
    timestamp: Date.now()
  };

  fs.writeFileSync(BUTTON_MODE_PATH, JSON.stringify(data, null, 2));
  global.BUTTON_MODE = enabled;
  _cachedButtonMode = enabled;
  _cacheTime = Date.now();
}

export function clearButtonModeCache() {
  _cachedButtonMode = null;
  _cacheTime = 0;
}
