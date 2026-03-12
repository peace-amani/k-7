import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OVERRIDES_FILE = join(__dirname, '..', 'data', 'api_overrides.json');

export const API_REGISTRY = {
    ytmp3:        { label: 'YouTube MP3',           category: 'downloaders',  url: 'https://api.giftedtech.co.ke/api/download' },
    ytmp4:        { label: 'YouTube MP4',           category: 'downloaders',  url: 'https://api.giftedtech.co.ke/api/download' },
    yta3:         { label: 'YouTube Audio 3',       category: 'downloaders',  url: 'https://api.giftedtech.co.ke/api/download' },
    dlmp3:        { label: 'Download MP3',          category: 'downloaders',  url: 'https://api.giftedtech.co.ke/api/download' },
    dlmp4:        { label: 'Download MP4',          category: 'downloaders',  url: 'https://api.giftedtech.co.ke/api/download' },
    mp4:          { label: 'MP4 Download',          category: 'downloaders',  url: 'https://api.giftedtech.co.ke/api/download' },
    song:         { label: 'Song Search & DL',      category: 'music',        url: 'https://api.giftedtech.co.ke/api/download' },
    play:         { label: 'Play Music',            category: 'music',        url: 'https://api.giftedtech.co.ke/api/download' },
    songdl:       { label: 'Song Download',         category: 'music',        url: 'https://api.giftedtech.co.ke/api/download' },
    viddl:        { label: 'Video Download',        category: 'music',        url: 'https://api.giftedtech.co.ke/api/download' },
    spotify:      { label: 'Spotify Download',      category: 'music',        url: 'https://api.giftedtech.co.ke/api/download/spotifydlv3' },
    instagram:    { label: 'Instagram Download',    category: 'downloaders',  url: 'https://api.giftedtech.co.ke/api/download/instadlv2' },
    mediafire:    { label: 'MediaFire Download',    category: 'downloaders',  url: 'https://api.giftedtech.co.ke/api/download/mediafire' },
    apk:          { label: 'APK Download',          category: 'downloaders',  url: 'https://api.giftedtech.co.ke/api/download/apkdl' },
    xvideos:      { label: 'XVideos Download',      category: 'downloaders',  url: 'https://api.giftedtech.co.ke/api/download/xvideosdl' },
    xnxx:         { label: 'XNXX Download',         category: 'downloaders',  url: 'https://api.giftedtech.co.ke/api/download/xnxxdl' },
    gitstalk:     { label: 'GitHub Stalk',          category: 'stalker',      url: 'https://api.giftedtech.co.ke/api/stalk/gitstalk' },
    igstalk:      { label: 'Instagram Stalk',       category: 'stalker',      url: 'https://api.giftedtech.co.ke/api/stalk/igstalk' },
    ipstalk:      { label: 'IP Stalk',              category: 'stalker',      url: 'https://api.giftedtech.co.ke/api/stalk/ipstalk' },
    npmstalk:     { label: 'NPM Stalk',             category: 'stalker',      url: 'https://api.giftedtech.co.ke/api/stalk/npmstalk' },
    tiktokstalk:  { label: 'TikTok Stalk',          category: 'stalker',      url: 'https://api.giftedtech.co.ke/api/stalk/tiktokstalk' },
    twitterstalk: { label: 'Twitter Stalk',         category: 'stalker',      url: 'https://api.giftedtech.co.ke/api/stalk/twitterstalk' },
    wachannel:    { label: 'WhatsApp Channel',      category: 'stalker',      url: 'https://api.giftedtech.co.ke/api/stalk/wachannel' },
    gpt:          { label: 'ChatGPT',               category: 'ai',           url: 'https://apis.xwolf.space/api/ai/gpt' },
    gemini:       { label: 'Gemini AI',             category: 'ai',           url: 'https://apis.xwolf.space/api/ai/gemini' },
    claude:       { label: 'Claude AI',             category: 'ai',           url: 'https://apis.xwolf.space/api/ai/claude' },
    deepseek:     { label: 'DeepSeek AI',           category: 'ai',           url: 'https://apis.xwolf.space/api/ai/deepseek' },
    mistral:      { label: 'Mistral AI',            category: 'ai',           url: 'https://apis.xwolf.space/api/ai/mistral' },
    groq:         { label: 'Groq AI',               category: 'ai',           url: 'https://apis.xwolf.space/api/ai/groq' },
    grok:         { label: 'Grok AI',               category: 'ai',           url: 'https://apiskeith.vercel.app/ai/grok' },
    blackbox:     { label: 'BlackBox AI',           category: 'ai',           url: 'https://apiskeith.vercel.app/ai/blackbox' },
    copilot:      { label: 'Copilot AI',            category: 'ai',           url: 'https://iamtkm.vercel.app/ai/copilot' },
    flux:         { label: 'Flux Image AI',         category: 'ai',           url: 'https://apiskeith.vercel.app/ai/flux' },
    metai:        { label: 'MetAI',                 category: 'ai',           url: 'https://apiskeith.vercel.app/ai/metai' },
    remini:       { label: 'Remini HD Enhance',     category: 'tools',        url: 'https://api.elrayyxml.web.id/api/tools/remini' },
    removebg:     { label: 'Remove Background',     category: 'tools',        url: 'https://apiskeith.vercel.app/ai/removebg' },
    shazam:       { label: 'Shazam Song ID',        category: 'tools',        url: 'https://api.ryzendesu.vip/api/ai/shazam' },
    bbc:          { label: 'BBC News',              category: 'news',         url: 'https://www.apiskeith.top/news/bbc' },
    kbc:          { label: 'KBC News',              category: 'news',         url: 'https://www.apiskeith.top/news/kbc' },
    ntv:          { label: 'NTV News',              category: 'news',         url: 'https://www.apiskeith.top/news/ntv' },
    citizen:      { label: 'Citizen News',          category: 'news',         url: 'https://www.apiskeith.top/news/citizen' },
};

function loadOverrides() {
    try {
        if (existsSync(OVERRIDES_FILE)) {
            return JSON.parse(readFileSync(OVERRIDES_FILE, 'utf8'));
        }
    } catch {}
    return {};
}

function saveOverrides(overrides) {
    try {
        const dir = join(__dirname, '..', 'data');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2));
        globalThis._apiOverrides = overrides;
        return true;
    } catch {
        return false;
    }
}

export function getApiUrl(cmdName) {
    const cmd = cmdName.toLowerCase();
    const overrides = globalThis._apiOverrides || loadOverrides();
    if (overrides[cmd]) return overrides[cmd];
    return API_REGISTRY[cmd]?.url || null;
}

export function getCommandInfo(cmdName) {
    const cmd = cmdName.toLowerCase();
    const entry = API_REGISTRY[cmd];
    if (!entry) return null;
    const overrides = globalThis._apiOverrides || loadOverrides();
    const override = overrides[cmd] || null;
    return {
        cmd,
        label: entry.label,
        category: entry.category,
        defaultUrl: entry.url,
        currentUrl: override || entry.url,
        isOverridden: !!override,
    };
}

export function setCommandApi(cmdName, newUrl) {
    const cmd = cmdName.toLowerCase();
    if (!API_REGISTRY[cmd]) return false;
    const overrides = loadOverrides();
    overrides[cmd] = newUrl;
    return saveOverrides(overrides);
}

export function resetCommandApi(cmdName) {
    const cmd = cmdName.toLowerCase();
    const overrides = loadOverrides();
    delete overrides[cmd];
    return saveOverrides(overrides);
}

export function getAllApiCommands() {
    return Object.entries(API_REGISTRY).map(([cmd, info]) => ({
        cmd,
        label: info.label,
        category: info.category,
    }));
}

globalThis._apiOverrides = loadOverrides();
