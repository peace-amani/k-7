import axios from 'axios';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: "repanalyze",
    aliases: ["space", "size", "diskspace", "analyzesize", "repoanalyze"],
    description: "Analyze what's consuming space in your repository",
    category: "git",
    
    async execute(sock, m, args, prefix, extras) {
        const chatId = m.key.remoteJid;
        
        if (!args[0]) {
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 📊 *REPO SPACE ANALYZER* ⌋\n│\n│ ✧ *Usage:* \`${prefix}repanalyze <user/repo>\`\n│\n│ 💡 *Examples:*\n│ • \`${prefix}repanalyze facebook/react\`\n│ • \`${prefix}repanalyze user/repo\`\n│ • \`${prefix}repanalyze https://github.com/user/repo\`\n│\n╰───────────────`
            }, { quoted: m });
        }
        
        let repoPath = args[0];
        
        try {
            repoPath = this.cleanGitHubUrl(repoPath);
            
            if (!this.isValidRepoPath(repoPath)) {
                throw new Error('Invalid format. Use: username/repository');
            }
            
            try { await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } }); } catch {}
            
            const repoData = await axios.get(`https://api.github.com/repos/${repoPath}`, {
                headers: { 
                    'User-Agent': 'WolfBot',
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 15000
            }).catch(err => {
                const status = err.response?.status;
                if (status === 404) throw new Error(`Repository "${repoPath}" not found or is private`);
                else if (status === 403) throw new Error('GitHub API rate limit exceeded.');
                else throw new Error(`GitHub API error: ${status || 'Network error'}`);
            });
            
            const repo = repoData.data;
            
            try { await sock.sendMessage(chatId, { react: { text: '🔄', key: m.key } }); } catch {}
            
            const requests = [
                axios.get(`https://api.github.com/repos/${repoPath}/languages`, {
                    headers: { 'User-Agent': 'WolfBot' }
                }).catch(() => ({ data: {} })),
                
                axios.get(`https://api.github.com/repos/${repoPath}/contents`, {
                    headers: { 'User-Agent': 'WolfBot' }
                }).catch(() => ({ data: [] })),
                
                axios.get(`https://api.github.com/repos/${repoPath}/commits`, {
                    headers: { 'User-Agent': 'WolfBot' },
                    params: { per_page: 5 }
                }).catch(() => ({ data: [] }))
            ];
            
            const [languagesRes, contentsRes, commitsRes] = await Promise.all(requests);
            const languages = languagesRes.data;
            const contents = contentsRes.data;
            const commits = commitsRes.data;
            
            const analysis = this.analyzeStructure(contents, repo.size);
            
            const report = this.generateAnalysisReport(repo, languages, analysis, commits, repoPath, prefix);
            
            await sock.sendMessage(chatId, { text: report }, { quoted: m });
            try { await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } }); } catch {}
            
        } catch (error) {
            console.error('RepoAnalyze error:', error);
            
            await sock.sendMessage(chatId, {
                text: `╭─⌈ ❌ *ANALYSIS ERROR* ⌋\n│\n│ ✧ *Target:* ${args[0]}\n│ ✧ *Error:* ${error.message}\n│\n│ 💡 Check repo exists and is public\n│\n╰───────────────`
            }, { quoted: m });
            try { await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } }); } catch {}
        }
    },
    
    cleanGitHubUrl(input) {
        if (!input) return input;
        input = input.replace(/\.git$/, '');
        if (input.includes('github.com')) {
            const match = input.match(/github\.com\/([^\/]+\/[^\/]+)/);
            if (match && match[1]) return match[1];
        }
        return input;
    },
    
    isValidRepoPath(path) {
        if (!path) return false;
        const parts = path.split('/');
        return parts.length === 2 && parts[0] && parts[1];
    },
    
    analyzeStructure(contents, repoSizeKB) {
        const analysis = {
            totalItems: contents.length,
            files: [],
            directories: [],
            fileTypes: {},
            suspiciousItems: [],
            summary: {
                totalSizeMB: (repoSizeKB / 1024).toFixed(2),
                estimatedFiles: 0,
                hasNodeModules: false,
                hasBuildDir: false,
                hasLargeAssets: false
            }
        };
        
        if (!Array.isArray(contents)) return analysis;
        
        contents.forEach(item => {
            if (item.type === 'file') {
                analysis.files.push(item);
                const ext = this.getFileExtension(item.name).toLowerCase();
                if (ext) analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;
                if (item.size > 1048576) {
                    analysis.suspiciousItems.push({ type: 'large_file', name: item.name, sizeMB: (item.size / 1048576).toFixed(2) });
                    if (['.mp4', '.avi', '.mov', '.mp3', '.wav'].includes(ext)) analysis.summary.hasLargeAssets = true;
                }
                analysis.summary.estimatedFiles++;
            } else if (item.type === 'dir') {
                analysis.directories.push(item);
                const dirName = item.name.toLowerCase();
                if (dirName.includes('node_modules')) {
                    analysis.summary.hasNodeModules = true;
                    analysis.suspiciousItems.push({ type: 'node_modules', name: item.name, sizeMB: 'Unknown' });
                } else if (['dist', 'build', 'output', 'target'].includes(dirName)) {
                    analysis.summary.hasBuildDir = true;
                    analysis.suspiciousItems.push({ type: 'build_dir', name: item.name, sizeMB: 'Unknown' });
                }
            }
        });
        
        return analysis;
    },
    
    getFileExtension(filename) {
        const parts = filename.split('.');
        return parts.length > 1 ? `.${parts.pop()}` : '';
    },
    
    calculateLanguageStats(languages) {
        const totalBytes = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0);
        if (totalBytes === 0) return [];
        return Object.entries(languages)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([lang, bytes]) => ({
                language: lang,
                percentage: ((bytes / totalBytes) * 100).toFixed(1),
                sizeMB: (bytes / (1024 * 1024)).toFixed(2)
            }));
    },
    
    generateAnalysisReport(repo, languages, analysis, commits, repoPath, prefix) {
        const languageStats = this.calculateLanguageStats(languages);
        const sizeMB = (repo.size / 1024).toFixed(2);
        
        const daysSinceUpdate = Math.floor((new Date() - new Date(repo.pushed_at)) / (1000 * 60 * 60 * 24));
        const activityStatus = daysSinceUpdate < 7 ? '🔥 Very Active' : daysSinceUpdate < 30 ? '⚡ Active' : daysSinceUpdate < 90 ? '🟡 Moderate' : '💤 Inactive';
        
        const healthIndicators = [];
        if (analysis.summary.hasNodeModules) healthIndicators.push('⚠️ node_modules in repo');
        if (analysis.summary.hasBuildDir) healthIndicators.push('⚠️ Build directories');
        if (analysis.summary.hasLargeAssets) healthIndicators.push('⚠️ Large media files');
        if (repo.size > 100000) healthIndicators.push('⚠️ Very large (>100MB)');
        
        const topFileTypes = Object.entries(analysis.fileTypes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([ext, count]) => `${this.getFileIcon(ext)} ${ext}: ${count}`);
        
        let text = `╭─⌈ 📊 *SPACE ANALYSIS* ⌋\n`;
        text += `│\n`;
        text += `│ 📁 ${repo.full_name}\n`;
        text += `│ 📦 ${sizeMB} MB total\n`;
        text += `│ ${activityStatus} (${daysSinceUpdate}d ago)\n`;
        text += `│\n`;
        
        text += `├─⊷ *💾 SIZE BREAKDOWN*\n`;
        text += `│  ├⊷ 📄 Files: ${analysis.summary.estimatedFiles}\n`;
        text += `│  ├⊷ 📂 Dirs: ${analysis.directories.length}\n`;
        text += `│  └⊷ 🏷️ Types: ${Object.keys(analysis.fileTypes).length}\n`;
        text += `│\n`;
        
        if (topFileTypes.length > 0) {
            text += `├─⊷ *📊 TOP FILE TYPES*\n`;
            topFileTypes.forEach((t, i) => {
                const connector = i === topFileTypes.length - 1 ? '╰' : '├';
                text += `│  ${connector}⊷ ${t}\n`;
            });
            text += `│\n`;
        }
        
        if (languageStats.length > 0) {
            text += `├─⊷ *💻 TECH STACK*\n`;
            languageStats.forEach((l, i) => {
                const connector = i === languageStats.length - 1 ? '╰' : '├';
                text += `│  ${connector}⊷ ${this.getLanguageIcon(l.language)} ${l.language}: ${l.percentage}% (${l.sizeMB}MB)\n`;
            });
            text += `│\n`;
        }
        
        if (healthIndicators.length > 0) {
            text += `├─⊷ *⚠️ HEALTH ISSUES*\n`;
            healthIndicators.forEach((h, i) => {
                const connector = i === healthIndicators.length - 1 ? '╰' : '├';
                text += `│  ${connector}⊷ ${h}\n`;
            });
            text += `│\n`;
        } else {
            text += `├─⊷ ✅ *No space issues detected*\n│\n`;
        }
        
        if (analysis.suspiciousItems.length > 0) {
            text += `├─⊷ *🚨 SUSPICIOUS ITEMS*\n`;
            analysis.suspiciousItems.slice(0, 3).forEach((item, i) => {
                const connector = i === Math.min(analysis.suspiciousItems.length, 3) - 1 ? '╰' : '├';
                text += `│  ${connector}⊷ ${item.name} (${item.sizeMB}MB)\n`;
            });
            text += `│\n`;
        }
        
        text += `├─⊷ *💡 TIPS*\n`;
        const tips = this.getOptimizationTips(analysis, repo.size);
        tips.forEach((tip, i) => {
            const connector = i === tips.length - 1 ? '╰' : '├';
            text += `│  ${connector}⊷ ${tip}\n`;
        });
        text += `│\n`;
        
        text += `├─⊷ *🔗 ACTIONS*\n`;
        text += `│  • \`${prefix}gitclone ${repo.full_name}\`\n`;
        text += `│  • \`${prefix}gitinfo ${repo.full_name}\`\n`;
        text += `│\n`;
        text += `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
        
        return text;
    },
    
    getOptimizationTips(analysis, sizeKB) {
        const tips = [];
        if (analysis.summary.hasNodeModules) tips.push('Remove node_modules (add to .gitignore)');
        if (analysis.summary.hasBuildDir) tips.push('Add dist/build/ to .gitignore');
        if (analysis.summary.hasLargeAssets) tips.push('Move media to CDN or releases');
        if (sizeKB > 51200) tips.push('Use GitHub Releases for binaries');
        if (tips.length === 0) tips.push('Repository is well optimized!');
        tips.push('Use --depth 1 for faster cloning');
        return tips;
    },
    
    getLanguageIcon(lang) {
        const icons = { 'JavaScript': '📜', 'TypeScript': '📘', 'Python': '🐍', 'Java': '☕', 'C++': '⚡', 'Go': '🐹', 'Rust': '🦀', 'Ruby': '💎', 'PHP': '🐘', 'HTML': '🌐', 'CSS': '🎨', 'Shell': '🐚' };
        return icons[lang] || '💻';
    },
    
    getFileIcon(ext) {
        const icons = { '.js': '📜', '.ts': '📘', '.json': '📋', '.md': '📝', '.html': '🌐', '.css': '🎨', '.py': '🐍', '.jpg': '🖼️', '.png': '🖼️', '.mp4': '🎬', '.mp3': '🎵', '.zip': '🗜️' };
        return icons[ext] || '📄';
    }
};
