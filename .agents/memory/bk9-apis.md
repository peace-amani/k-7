---
name: BK9 downloader APIs
description: Response shapes and caveats for api.bk9.dev download endpoints used in YouTube/Facebook downloaders
---

# BK9 Downloader APIs

## YouTube video

**`GET https://api.bk9.dev/download/youtube?url=<url>&quality=<720p>&type=video`**
- Returns: `{ status: true, BK9: { filename, quality, size, extension, url } }`
- `BK9.url` is a proxy CDN link (secure-signed.pages.dev) — **not IP-locked**, safe to download.
- Preferred endpoint; use as first BK9 attempt.

**`GET https://api.bk9.dev/download/youtube2?url=<url>`**
- Returns: `{ status: true, BK9: { title, author, thumbnail, duration, formats: [{quality, type, url}] } }`
- Format URLs are `redirector.googlevideo.com` — **IP-locked**, skip these.

**`GET https://api.bk9.dev/download/youtube3?url=<url>`**
- Returns: `{ status: true, BK9: { title, author, thumbnail, quality, downloadUrl } }`
- `BK9.downloadUrl` may also be `redirector.googlevideo.com` — check and skip if so.
- Use as secondary attempt after `youtube` endpoint fails.

**Why:** Added as primary fallback after xwolf fails, because xcasper/keith APIs went down.
**How to apply:** In ytmp4.js and ytv.js, order is: xwolf → BK9 → XCasper → Keith.

## Facebook video

**`GET https://api.bk9.dev/download/fb?url=<url>`**
- Returns: `{ status: true, BK9: { source, title, author, thumb, thumbnail, sd, hd, formats } }`
- `BK9.hd` and `BK9.sd` are direct Facebook CDN URLs.
- Inserted between xwolf and xcasper in `fetchFbInfo()` in `commands/downloaders/facebook.js`.

## Baileys

- Upgraded from rc13 → rc14. rc14 adds better DM response support (commands no longer silently drop in DMs).
- The memory entry about DM button mode invisibility in DMs may be partially resolved by rc14.
