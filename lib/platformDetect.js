
export function getPlatformInfo() {
    const isTermux =
        process.env.TMPDIR?.includes('com.termux') ||
        process.env.HOME?.includes('com.termux') ||
        process.env.PREFIX?.includes('com.termux') ||
        !!process.env.ANDROID_DATA;
    if (isTermux) {
        return { name: 'Termux', icon: '📱', status: 'Active' };
    }
    if (process.env.HEROKU_APP_NAME || process.env.DYNO || process.env.HEROKU_API_KEY) {
        return { name: 'Heroku', icon: '🦸', status: 'Active' };
    }
    if (process.env.RENDER_SERVICE_ID || process.env.RENDER_SERVICE_NAME || process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
        return { name: 'Render', icon: '🚀', status: 'Active' };
    }
    if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_NAME || process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_PROJECT_ID) {
        return { name: 'Railway', icon: '🚂', status: 'Active' };
    }
    if (process.env.REPL_ID || process.env.REPLIT_DB_URL || process.env.REPLIT_USER || process.env.REPL_SLUG) {
        return { name: 'Replit', icon: '🌀', status: 'Active' };
    }
    if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL) {
        return { name: 'Vercel', icon: '▲', status: 'Active' };
    }
    if (process.env.GLITCH_PROJECT_REMIX || process.env.PROJECT_REMIX_CHAIN || process.env.GLITCH) {
        return { name: 'Glitch', icon: '🎏', status: 'Active' };
    }
    if (process.env.KOYEB_APP || process.env.KOYEB_REGION || process.env.KOYEB_SERVICE || process.env.KOYEB_PROJECT) {
        return { name: 'Koyeb', icon: '☁️', status: 'Active' };
    }
    if (process.env.CYCLIC_URL || process.env.CYCLIC_APP_ID || process.env.CYCLIC_DB) {
        return { name: 'Cyclic', icon: '♻️', status: 'Active' };
    }
    if (process.env.PANEL || process.env.PTERODACTYL) {
        return { name: 'Panel/VPS', icon: '🎛️', status: 'Active' };
    }
    if (process.env.SSH_CONNECTION || process.env.SSH_CLIENT || (process.platform === 'linux' && process.env.USER === 'root')) {
        return { name: 'VPS/SSH', icon: '🖥️', status: 'Active' };
    }
    if (process.platform === 'win32') return { name: 'Windows PC', icon: '🪟', status: 'Active' };
    if (process.platform === 'darwin') return { name: 'MacOS', icon: '🍎', status: 'Active' };
    if (process.platform === 'linux') return { name: 'Linux', icon: '🐧', status: 'Active' };
    return { name: 'Local Machine', icon: '💻', status: 'Active' };
}

export function detectPlatform() {
    const { icon, name } = getPlatformInfo();
    return `${icon} ${name}`;
}
