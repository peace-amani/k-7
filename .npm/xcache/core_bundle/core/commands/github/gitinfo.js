import axios from 'axios';
import moment from 'moment';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
    name: 'gitinfo',
    alias: ['repoinfo', 'githubinfo', 'gitstats'],
    description: 'Get detailed information about a GitHub repository',
    category: 'git',
    ownerOnly: true,
    
    async execute(sock, m, args, prefix, extras) {
        const chatId = m.key.remoteJid;
        
        if (!args[0]) {
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 📊 *GIT REPO INFO* ⌋\n│\n│ ✧ *Usage:* \`${prefix}gitinfo <user/repo>\`\n│\n│ 💡 *Examples:*\n│ • \`${prefix}gitinfo facebook/react\`\n│ • \`${prefix}gitinfo user/repo\`\n│ • \`${prefix}gitinfo https://github.com/user/repo\`\n│\n╰───────────────`
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
                axios.get(`https://api.github.com/repos/${repoPath}/contributors`, {
                    headers: { 'User-Agent': 'WolfBot' },
                    params: { per_page: 10 }
                }).catch(() => ({ data: [] })),
                
                axios.get(`https://api.github.com/repos/${repoPath}/releases`, {
                    headers: { 'User-Agent': 'WolfBot' },
                    params: { per_page: 5 }
                }).catch(() => ({ data: [] })),
                
                axios.get(`https://api.github.com/repos/${repoPath}/languages`, {
                    headers: { 'User-Agent': 'WolfBot' }
                }).catch(() => ({ data: {} })),
                
                axios.get(`https://api.github.com/repos/${repoPath}/commits`, {
                    headers: { 'User-Agent': 'WolfBot' },
                    params: { per_page: 5 }
                }).catch(() => ({ data: [] }))
            ];
            
            const [contributorsRes, releasesRes, languagesRes, commitsRes] = await Promise.all(requests);
            
            const contributors = contributorsRes.data;
            const releases = releasesRes.data;
            const languages = languagesRes.data;
            const commits = commitsRes.data;
            
            const languageStats = this.calculateLanguageStats(languages);
            
            const infoText = this.generateRepoInfoText(
                repo, contributors, releases, languageStats, commits, repoPath, prefix
            );
            
            await sock.sendMessage(chatId, { text: infoText }, { quoted: m });
            try { await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } }); } catch {}
            
        } catch (error) {
            console.error('GitInfo error:', error);
            
            await sock.sendMessage(chatId, {
                text: `╭─⌈ ❌ *REPO INFO ERROR* ⌋\n│\n│ ✧ *Target:* ${args[0]}\n│ ✧ *Error:* ${error.message}\n│\n│ 💡 Try: username/repository\n│\n╰───────────────`
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
        if (input.includes('raw.githubusercontent.com')) {
            const match = input.match(/raw\.githubusercontent\.com\/([^\/]+\/[^\/]+)/);
            if (match && match[1]) return match[1];
        }
        return input;
    },
    
    isValidRepoPath(path) {
        if (!path) return false;
        const parts = path.split('/');
        return parts.length === 2 && parts[0] && parts[1];
    },
    
    calculateLanguageStats(languages) {
        const totalBytes = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0);
        if (totalBytes === 0) return [];
        
        return Object.entries(languages)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([lang, bytes]) => ({
                language: lang,
                percentage: ((bytes / totalBytes) * 100).toFixed(1)
            }));
    },
    
    generateRepoInfoText(repo, contributors, releases, languageStats, commits, repoPath, prefix) {
        const created = moment(repo.created_at).format('MMM DD, YYYY');
        const updated = moment(repo.updated_at).format('MMM DD, YYYY');
        const pushed = moment(repo.pushed_at).format('MMM DD, YYYY');
        
        const daysSinceUpdate = Math.floor((new Date() - new Date(repo.pushed_at)) / (1000 * 60 * 60 * 24));
        const activityEmoji = daysSinceUpdate < 7 ? '🔥' : daysSinceUpdate < 30 ? '⚡' : daysSinceUpdate < 90 ? '🟡' : '💤';
        const activityText = daysSinceUpdate < 7 ? 'Very Active' : daysSinceUpdate < 30 ? 'Active' : daysSinceUpdate < 90 ? 'Moderate' : 'Inactive';
        
        const sizeKB = repo.size;
        const sizeLabel = sizeKB < 1024 ? `${sizeKB} KB` : sizeKB < 1024 * 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${(sizeKB / (1024 * 1024)).toFixed(1)} GB`;
        
        const lastCommit = commits[0]?.commit?.author?.date ? moment(commits[0].commit.author.date).fromNow() : 'Unknown';
        
        const flags = [
            repo.archived ? '🔒 Archived' : '',
            repo.fork ? '🍴 Fork' : '',
            repo.has_wiki ? '📚 Wiki' : '',
            repo.has_pages ? '🌐 Pages' : ''
        ].filter(Boolean).join(' | ');

        let text = `╭─⌈ ✨ *${repo.full_name.toUpperCase()}* ⌋\n`;
        text += `│\n`;
        text += `│ 📝 ${repo.description || 'No description'}\n`;
        text += `│ 👤 ${repo.owner.login}\n`;
        text += `│ 🔗 ${repo.html_url}\n`;
        text += `│\n`;
        text += `├─⊷ *📊 STATISTICS*\n`;
        text += `│  ├⊷ ⭐ Stars: ${repo.stargazers_count.toLocaleString()}\n`;
        text += `│  ├⊷ 🍴 Forks: ${repo.forks_count.toLocaleString()}\n`;
        text += `│  ├⊷ 👁️ Watchers: ${repo.watchers_count.toLocaleString()}\n`;
        text += `│  ├⊷ 📝 Issues: ${repo.open_issues_count.toLocaleString()}\n`;
        text += `│  ├⊷ 👥 Contributors: ${contributors.length}\n`;
        text += `│  ├⊷ 🚀 Releases: ${releases.length}\n`;
        text += `│  └⊷ 📦 Size: ${sizeLabel}\n`;
        text += `│\n`;
        
        if (languageStats.length > 0) {
            text += `├─⊷ *💻 TECH STACK*\n`;
            text += `│  ├⊷ ⌨️ Primary: ${repo.language || 'N/A'}\n`;
            languageStats.forEach((l, i) => {
                const connector = i === languageStats.length - 1 ? '╰' : '├';
                text += `│  ${connector}⊷ ${l.language}: ${l.percentage}%\n`;
            });
            text += `│\n`;
        }
        
        text += `├─⊷ *📅 TIMELINE*\n`;
        text += `│  ├⊷ 🎉 Created: ${created}\n`;
        text += `│  ├⊷ 🔄 Updated: ${updated}\n`;
        text += `│  ├⊷ 📤 Last Commit: ${lastCommit}\n`;
        text += `│  └⊷ ${activityEmoji} ${activityText} (${daysSinceUpdate}d)\n`;
        text += `│\n`;
        text += `│ 📄 License: ${repo.license?.name || 'None'}\n`;
        text += `│ 🏷️ Branch: ${repo.default_branch}\n`;
        if (flags) text += `│ ${flags}\n`;
        text += `│\n`;
        text += `├─⊷ *🔗 ACTIONS*\n`;
        text += `│  • \`${prefix}gitclone ${repo.full_name}\`\n`;
        text += `│  • \`${prefix}repanalyze ${repo.full_name}\`\n`;
        text += `│\n`;
        text += `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
        
        return text;
    },
    
    generateBar(value, maxValue, length) {
        const percentage = Math.min(value / maxValue, 1);
        const filled = Math.floor(percentage * length);
        const empty = length - filled;
        const percent = (percentage * 100).toFixed(1);
        return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
    }
};
