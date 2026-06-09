// lib/aiModels.js
// Central registry for all AI models powered by apis.xwolf.space
// Import this file anywhere you need the model list, API caller, or helpers.

export const XWOLF_API_BASE = 'https://apis.xwolf.space';
export const XWOLF_API_KEY  = process.env.XWOLF_API_KEY || 'wxa_u_xwk7sch6xj';

// ── Model registry ─────────────────────────────────────────────────────────
// Each entry:
//   name     — display name shown to users
//   icon     — emoji shown next to name
//   endpoint — path segment for the /api/ai/<endpoint> route
//   category — 'text' | 'code' (informational only)
//   vision   — true if the model can analyse images
export const AI_MODELS = {
  gpt:             { name: 'GPT-4o',        icon: '🤖', endpoint: 'gpt',              category: 'text' },
  claude:          { name: 'Claude',         icon: '🔮', endpoint: 'claude',           category: 'text' },
  gemini:          { name: 'Gemini',         icon: '✨', endpoint: 'gemini',           category: 'text', vision: true },
  mistral:         { name: 'Mistral',        icon: '🌊', endpoint: 'mistral',          category: 'text' },
  deepseek:        { name: 'DeepSeek',       icon: '🔍', endpoint: 'deepseek',         category: 'text' },
  venice:          { name: 'Venice',         icon: '🎭', endpoint: 'venice',           category: 'text' },
  groq:            { name: 'Groq',           icon: '⚡', endpoint: 'groq',             category: 'text' },
  cohere:          { name: 'Cohere',         icon: '🌐', endpoint: 'cohere',           category: 'text' },
  llama:           { name: 'LLaMA',          icon: '🦙', endpoint: 'llama',            category: 'text' },
  mixtral:         { name: 'Mixtral',        icon: '🔀', endpoint: 'mixtral',          category: 'text' },
  phi:             { name: 'Phi-3',          icon: '🔵', endpoint: 'phi',              category: 'text' },
  qwen:            { name: 'Qwen',           icon: '🐉', endpoint: 'qwen',             category: 'text' },
  falcon:          { name: 'Falcon',         icon: '🦅', endpoint: 'falcon',           category: 'text' },
  vicuna:          { name: 'Vicuna',         icon: '🦌', endpoint: 'vicuna',           category: 'text' },
  openchat:        { name: 'OpenChat',       icon: '💬', endpoint: 'openchat',         category: 'text' },
  wizard:          { name: 'WizardLM',       icon: '🧙', endpoint: 'wizard',           category: 'text' },
  zephyr:          { name: 'Zephyr',         icon: '🌬️', endpoint: 'zephyr',           category: 'text' },
  codellama:       { name: 'CodeLLaMA',      icon: '💻', endpoint: 'codellama',        category: 'code' },
  starcoder:       { name: 'StarCoder',      icon: '⭐', endpoint: 'starcoder',        category: 'code' },
  dolphin:         { name: 'Dolphin',        icon: '🐬', endpoint: 'dolphin',          category: 'text' },
  nous:            { name: 'Nous-Hermes',    icon: '📚', endpoint: 'nous',             category: 'text' },
  openhermes:      { name: 'OpenHermes',     icon: '🏛️',  endpoint: 'openhermes',      category: 'text' },
  neural:          { name: 'Neural',         icon: '🧠', endpoint: 'neural',           category: 'text' },
  solar:           { name: 'Solar',          icon: '☀️',  endpoint: 'solar',           category: 'text' },
  yi:              { name: 'Yi',             icon: '🌙', endpoint: 'yi',               category: 'text' },
  tinyllama:       { name: 'TinyLLaMA',      icon: '🤏', endpoint: 'tinyllama',        category: 'text' },
  orca:            { name: 'Orca-2',         icon: '🐋', endpoint: 'orca',             category: 'text' },
  command:         { name: 'Command-R',      icon: '📡', endpoint: 'command',          category: 'text' },
  nemotron:        { name: 'Nemotron',       icon: '🛸', endpoint: 'nemotron',         category: 'text' },
  internlm:        { name: 'InternLM',       icon: '🎓', endpoint: 'internlm',         category: 'text' },
  chatglm:         { name: 'ChatGLM',        icon: '🀄', endpoint: 'chatglm',          category: 'text' },
  wormgpt:         { name: 'WormGPT',        icon: '🪱', endpoint: 'wormgpt',          category: 'text' },
  blackbox:        { name: 'Blackbox',       icon: '🖥️',  endpoint: 'blackbox',        category: 'text' },
  replit:          { name: 'Replit AI',      icon: '🔄', endpoint: 'replit',           category: 'code' },
  notegpt:         { name: 'NoteGPT',        icon: '📝', endpoint: 'notegpt',          category: 'text' },
  'notegpt-deepseek': { name: 'NoteGPT-DS', icon: '📓', endpoint: 'notegpt-deepseek', category: 'text' },
  'notegpt-pro':   { name: 'NoteGPT Pro',   icon: '📒', endpoint: 'notegpt-pro',      category: 'text' },
};

// Default fallback chain — used when the preferred model fails.
// Fastest / most reliable models first.
export const MODEL_PRIORITY = [
  'gpt', 'claude', 'gemini', 'mistral', 'deepseek',
  'groq', 'llama', 'mixtral', 'cohere', 'phi'
];

// ── Response extractor ─────────────────────────────────────────────────────
// The xwolf API may return either plain text or JSON.
// This tries every common field name before giving up.
export function extractXWolfResponse(data) {
  if (!data) return null;

  if (typeof data === 'string') {
    const t = data.trim();
    return t.length > 2 ? t : null;
  }

  // Common top-level fields
  for (const key of ['response', 'result', 'text', 'message', 'answer', 'content', 'output', 'reply']) {
    if (data[key] && typeof data[key] === 'string' && data[key].trim().length > 2) {
      return data[key].trim();
    }
  }

  // Nested under data.*
  if (data.data && typeof data.data === 'object') {
    for (const key of ['response', 'result', 'text', 'message', 'answer', 'content']) {
      if (data.data[key] && typeof data.data[key] === 'string') {
        return data.data[key].trim();
      }
    }
    if (typeof data.data === 'string' && data.data.trim().length > 2) {
      return data.data.trim();
    }
  }

  return null;
}

// ── URL builder ────────────────────────────────────────────────────────────
// Standard text query
export function buildTextUrl(modelKey, query) {
  const model = AI_MODELS[modelKey];
  if (!model) return null;
  return `${XWOLF_API_BASE}/api/ai/${model.endpoint}?q=${encodeURIComponent(query)}&key=${XWOLF_API_KEY}`;
}

// Image analysis query — sends base64 image data alongside the prompt.
// Pass imageData as a base64 string (no data-URI prefix).
export function buildVisionUrl(query, imageBase64) {
  const params = new URLSearchParams({
    q:     query,
    key:   XWOLF_API_KEY,
    image: imageBase64
  });
  return `${XWOLF_API_BASE}/api/ai/gemini?${params.toString()}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────
export function modelSupportsVision(modelKey) {
  return !!(AI_MODELS[modelKey]?.vision);
}

export function getModelList() {
  return Object.entries(AI_MODELS).map(([key, m]) => ({
    key,
    name:     m.name,
    icon:     m.icon,
    category: m.category,
    vision:   !!m.vision
  }));
}
