// lib/aiModels.js
// Central registry for ALL AI models — xwolf (37 models) + NVIDIA (18 endpoints)
// Import this wherever you need model definitions, URL builders, or helpers.

export const XWOLF_API_BASE = 'https://apis.xwolf.space';
export const XWOLF_API_KEY  = process.env.XWOLF_API_KEY || 'wxa_u_xwk7sch6xj';

// ── xwolf text models ──────────────────────────────────────────────────────
export const AI_MODELS = {
  gpt:               { name: 'GPT-4o',        icon: '🤖', endpoint: 'gpt',               category: 'text' },
  claude:            { name: 'Claude',         icon: '🔮', endpoint: 'claude',            category: 'text' },
  gemini:            { name: 'Gemini',         icon: '✨', endpoint: 'gemini',            category: 'text', vision: true },
  mistral:           { name: 'Mistral',        icon: '🌊', endpoint: 'mistral',           category: 'text' },
  deepseek:          { name: 'DeepSeek',       icon: '🔍', endpoint: 'deepseek',          category: 'text' },
  venice:            { name: 'Venice',         icon: '🎭', endpoint: 'venice',            category: 'text' },
  groq:              { name: 'Groq',           icon: '⚡', endpoint: 'groq',              category: 'text' },
  cohere:            { name: 'Cohere',         icon: '🌐', endpoint: 'cohere',            category: 'text' },
  llama:             { name: 'LLaMA',          icon: '🦙', endpoint: 'llama',             category: 'text' },
  mixtral:           { name: 'Mixtral',        icon: '🔀', endpoint: 'mixtral',           category: 'text' },
  phi:               { name: 'Phi-3',          icon: '🔵', endpoint: 'phi',               category: 'text' },
  qwen:              { name: 'Qwen',           icon: '🐉', endpoint: 'qwen',              category: 'text' },
  falcon:            { name: 'Falcon',         icon: '🦅', endpoint: 'falcon',            category: 'text' },
  vicuna:            { name: 'Vicuna',         icon: '🦌', endpoint: 'vicuna',            category: 'text' },
  openchat:          { name: 'OpenChat',       icon: '💬', endpoint: 'openchat',          category: 'text' },
  wizard:            { name: 'WizardLM',       icon: '🧙', endpoint: 'wizard',            category: 'text' },
  zephyr:            { name: 'Zephyr',         icon: '🌬️', endpoint: 'zephyr',            category: 'text' },
  codellama:         { name: 'CodeLLaMA',      icon: '💻', endpoint: 'codellama',         category: 'code' },
  starcoder:         { name: 'StarCoder',      icon: '⭐', endpoint: 'starcoder',         category: 'code' },
  dolphin:           { name: 'Dolphin',        icon: '🐬', endpoint: 'dolphin',           category: 'text' },
  nous:              { name: 'Nous-Hermes',    icon: '📚', endpoint: 'nous',              category: 'text' },
  openhermes:        { name: 'OpenHermes',     icon: '🏛️',  endpoint: 'openhermes',       category: 'text' },
  neural:            { name: 'Neural',         icon: '🧠', endpoint: 'neural',            category: 'text' },
  solar:             { name: 'Solar',          icon: '☀️',  endpoint: 'solar',            category: 'text' },
  yi:                { name: 'Yi',             icon: '🌙', endpoint: 'yi',                category: 'text' },
  tinyllama:         { name: 'TinyLLaMA',      icon: '🤏', endpoint: 'tinyllama',         category: 'text' },
  orca:              { name: 'Orca-2',         icon: '🐋', endpoint: 'orca',              category: 'text' },
  command:           { name: 'Command-R',      icon: '📡', endpoint: 'command',           category: 'text' },
  nemotron:          { name: 'Nemotron',       icon: '🛸', endpoint: 'nemotron',          category: 'text' },
  internlm:          { name: 'InternLM',       icon: '🎓', endpoint: 'internlm',          category: 'text' },
  chatglm:           { name: 'ChatGLM',        icon: '🀄', endpoint: 'chatglm',           category: 'text' },
  wormgpt:           { name: 'WormGPT',        icon: '🪱', endpoint: 'wormgpt',           category: 'text' },
  blackbox:          { name: 'Blackbox',       icon: '🖥️',  endpoint: 'blackbox',         category: 'text' },
  replit:            { name: 'Replit AI',      icon: '🔄', endpoint: 'replit',            category: 'code' },
  notegpt:           { name: 'NoteGPT',        icon: '📝', endpoint: 'notegpt',           category: 'text' },
  'notegpt-deepseek':{ name: 'NoteGPT-DS',    icon: '📓', endpoint: 'notegpt-deepseek',  category: 'text' },
  'notegpt-pro':     { name: 'NoteGPT Pro',   icon: '📒', endpoint: 'notegpt-pro',       category: 'text' },

  // ── NVIDIA text models ───────────────────────────────────────────────────
  'nvidia-chat':     { name: 'NVIDIA Chat',    icon: '🟢', endpoint: 'nvidia/chat',          category: 'text', provider: 'nvidia' },
  'nvidia-llama':    { name: 'NVIDIA LLaMA',   icon: '🟢', endpoint: 'nvidia/llama-70b',     category: 'text', provider: 'nvidia' },
  'nvidia-llama3':   { name: 'NVIDIA LLaMA 3', icon: '🟢', endpoint: 'nvidia/llama3-3',      category: 'text', provider: 'nvidia' },
  'nvidia-nemotron': { name: 'NVIDIA Nemotron',icon: '🛸', endpoint: 'nvidia/nemotron',      category: 'text', provider: 'nvidia' },
  'nvidia-phi':      { name: 'NVIDIA Phi-4',   icon: '🔵', endpoint: 'nvidia/phi-mini',      category: 'text', provider: 'nvidia' },
  'nvidia-mistral':  { name: 'NVIDIA Mistral', icon: '🌊', endpoint: 'nvidia/mistral-medium',category: 'text', provider: 'nvidia' },
  'nvidia-glm':      { name: 'NVIDIA GLM',     icon: '🀄', endpoint: 'nvidia/glm',           category: 'text', provider: 'nvidia' },
};

// ── NVIDIA vision models (for image analysis) ──────────────────────────────
// Tried in order until one succeeds.
export const NVIDIA_VISION_MODELS = [
  { key: 'vision-pro',  endpoint: 'nvidia/vision-pro',  name: 'NVIDIA Vision Pro (LLaMA 3.2 90B)' },
  { key: 'vision',      endpoint: 'nvidia/vision',      name: 'NVIDIA Vision (LLaMA 3.2 11B)' },
];

// ── NVIDIA image generation models ────────────────────────────────────────
// These accept `prompt` (not `q`) and return `{ result: "<image_url>" }` or similar.
export const NVIDIA_IMAGE_MODELS = {
  flux:      { name: 'FLUX Schnell', icon: '⚡', endpoint: 'nvidia/flux-schnell' },
  'flux-dev':{ name: 'FLUX Dev',     icon: '🎨', endpoint: 'nvidia/flux-dev' },
  image:     { name: 'NVIDIA Image', icon: '🖼️',  endpoint: 'nvidia/flux-schnell' },
};

// Default image model to use when user asks for image generation via chatbot
export const DEFAULT_IMAGE_MODEL = 'flux';

// ── Default text fallback chain ────────────────────────────────────────────
// Tried in order when the preferred model fails.
export const MODEL_PRIORITY = [
  'gpt', 'claude', 'nvidia-chat', 'gemini', 'mistral',
  'nvidia-mistral', 'deepseek', 'groq', 'wormgpt', 'llama', 'mixtral',
  'nvidia-llama', 'cohere', 'phi', 'nvidia-phi'
];

// ── Response extractor ─────────────────────────────────────────────────────
// Works for both xwolf and NVIDIA API responses.
export function extractXWolfResponse(data) {
  if (!data) return null;

  if (typeof data === 'string') {
    const t = data.trim();
    // Reject HTML responses (API returned an error page instead of JSON)
    if (t.startsWith('<!') || t.startsWith('<html') || t.startsWith('<HTML') ||
        t.toLowerCase().includes('<!doctype')) return null;
    return t.length > 2 ? t : null;
  }

  // Primary: NVIDIA / xwolf both use `result`
  for (const key of ['result', 'response', 'text', 'message', 'answer', 'content', 'output', 'reply']) {
    if (data[key] && typeof data[key] === 'string' && data[key].trim().length > 2) {
      return data[key].trim();
    }
  }

  // Nested under data.*
  if (data.data && typeof data.data === 'object') {
    for (const key of ['result', 'response', 'text', 'message', 'answer', 'content']) {
      if (data.data[key] && typeof data.data[key] === 'string') return data.data[key].trim();
    }
    if (typeof data.data === 'string' && data.data.trim().length > 2) return data.data.trim();
  }

  return null;
}

// Extract the image URL from an NVIDIA image-gen response
export function extractImageUrl(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    const t = data.trim();
    return t.startsWith('http') ? t : null;
  }
  for (const key of ['url', 'image', 'image_url', 'result', 'output', 'data']) {
    const v = data[key];
    if (v && typeof v === 'string' && v.startsWith('http')) return v;
    if (Array.isArray(v) && v[0] && typeof v[0] === 'string' && v[0].startsWith('http')) return v[0];
    if (Array.isArray(v) && v[0]?.url) return v[0].url;
  }
  return null;
}

// ── URL builders ───────────────────────────────────────────────────────────

// Standard text query
// xwolf models use /api/ai/<endpoint>; NVIDIA models use /api/nvidia/<endpoint>
export function buildTextUrl(modelKey, query) {
  const model = AI_MODELS[modelKey];
  if (!model) return null;
  // NVIDIA models already have 'nvidia/' in their endpoint
  const path = model.provider === 'nvidia'
    ? `api/${model.endpoint}`
    : `api/ai/${model.endpoint}`;
  return `${XWOLF_API_BASE}/${path}?q=${encodeURIComponent(query)}&key=${XWOLF_API_KEY}`;
}

// xwolf Gemini vision (base64 image) — fallback only
export function buildVisionUrl(query, imageBase64) {
  const params = new URLSearchParams({ q: query, key: XWOLF_API_KEY, image: imageBase64 });
  return `${XWOLF_API_BASE}/api/ai/gemini?${params.toString()}`;
}

// NVIDIA Nemotron vision — primary image analysis endpoint
export function buildNvidiaVisionUrl(query, imageBase64) {
  const params = new URLSearchParams({ q: query, key: XWOLF_API_KEY, image: imageBase64 });
  return `${XWOLF_API_BASE}/api/nvidia/nemotron?${params.toString()}`;
}

// NVIDIA FLUX Dev — image generation (uses `prompt` not `q`)
export function buildNvidiaImageUrl(prompt) {
  const params = new URLSearchParams({ prompt, key: XWOLF_API_KEY });
  return `${XWOLF_API_BASE}/api/nvidia/flux-dev?${params.toString()}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────
export function modelSupportsVision(modelKey) {
  return !!(AI_MODELS[modelKey]?.vision);
}

export function getModelList() {
  return Object.entries(AI_MODELS).map(([key, m]) => ({
    key, name: m.name, icon: m.icon, category: m.category, vision: !!m.vision, provider: m.provider || 'xwolf'
  }));
}
