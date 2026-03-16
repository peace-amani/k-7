// File: ./commands/owner/disk.js
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { execSync, exec } from 'child_process';
import os from 'os';
import path from 'path';

export default {
    name: 'disk',
    alias: ['storage', 'space', 'usage', 'df'],
    category: 'owner',
    description: 'Show accurate disk usage and storage information',
    ownerOnly: true,
    
    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager, BOT_NAME, VERSION } = extra;
        
        // Debug logging
        console.log('\n🔍 ========= DISK COMMAND DEBUG =========');
        console.log('Command:', args);
        console.log('Chat ID:', chatId);
        console.log('========================================\n');
        
        // ====== HELPER FUNCTIONS ======
        function formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
            
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }
        
        function formatPercent(value, total) {
            if (total === 0) return '0%';
            const percent = (value / total) * 100;
            return percent.toFixed(1) + '%';
        }
        
        function getProgressBar(percentage, width = 20) {
            const filled = Math.round((percentage / 100) * width);
            const empty = width - filled;
            const filledBar = '█'.repeat(filled);
            const emptyBar = '░'.repeat(empty);
            return `[${filledBar}${emptyBar}]`;
        }
        
        function getStorageColor(percent) {
            if (percent < 70) return '🟢';  // Green
            if (percent < 85) return '🟡';  // Yellow
            if (percent < 95) return '🟠';  // Orange
            return '🔴';                    // Red
        }
        
        // ====== DISK USAGE FUNCTIONS ======
        async function getDiskInfo() {
            try {
                const platform = os.platform();
                let diskInfo = {};
                
                if (platform === 'linux' || platform === 'darwin') {
                    // Linux/Mac - use df command
                    const output = execSync('df -h').toString();
                    const lines = output.trim().split('\n');
                    
                    // Skip header line
                    for (let i = 1; i < lines.length; i++) {
                        const parts = lines[i].split(/\s+/);
                        if (parts.length >= 6) {
                            const mount = parts[5];
                            const size = parts[1];
                            const used = parts[2];
                            const avail = parts[3];
                            const usePercent = parts[4];
                            const fs = parts[0];
                            
                            diskInfo[mount] = {
                                filesystem: fs,
                                size: size,
                                used: used,
                                available: avail,
                                usePercent: usePercent,
                                mount: mount
                            };
                        }
                    }
                    
                    // Also get root partition details
                    try {
                        const rootOutput = execSync('df -h /').toString();
                        const rootLines = rootOutput.trim().split('\n');
                        if (rootLines.length > 1) {
                            const parts = rootLines[1].split(/\s+/);
                            diskInfo['root'] = {
                                filesystem: parts[0],
                                size: parts[1],
                                used: parts[2],
                                available: parts[3],
                                usePercent: parts[4],
                                mount: '/'
                            };
                        }
                    } catch (error) {
                        // Ignore if root not accessible
                    }
                    
                } else if (platform === 'win32') {
                    // Windows - use wmic or powershell
                    try {
                        const output = execSync('wmic logicaldisk get size,freespace,caption').toString();
                        const lines = output.trim().split('\n').slice(1);
                        
                        lines.forEach(line => {
                            const parts = line.trim().split(/\s+/);
                            if (parts.length >= 3) {
                                const drive = parts[0];
                                const free = parseInt(parts[1]) || 0;
                                const total = parseInt(parts[2]) || 0;
                                const used = total - free;
                                const percent = total > 0 ? (used / total) * 100 : 0;
                                
                                diskInfo[drive] = {
                                    filesystem: 'NTFS',
                                    size: formatBytes(total),
                                    used: formatBytes(used),
                                    available: formatBytes(free),
                                    usePercent: percent.toFixed(1) + '%',
                                    mount: drive + ':\\'
                                };
                            }
                        });
                    } catch (error) {
                        // Fallback to Node.js stats
                        const drives = ['C:', 'D:', 'E:', 'F:'];
                        drives.forEach(drive => {
                            try {
                                const stats = execSync(`fsutil volume diskfree ${drive}`).toString();
                                // Parse Windows output
                                const totalMatch = stats.match(/Total # of bytes\s*:\s*([\d,]+)/);
                                const freeMatch = stats.match(/Total # of free bytes\s*:\s*([\d,]+)/);
                                
                                if (totalMatch && freeMatch) {
                                    const total = parseInt(totalMatch[1].replace(/,/g, ''));
                                    const free = parseInt(freeMatch[1].replace(/,/g, ''));
                                    const used = total - free;
                                    const percent = total > 0 ? (used / total) * 100 : 0;
                                    
                                    diskInfo[drive] = {
                                        filesystem: 'Unknown',
                                        size: formatBytes(total),
                                        used: formatBytes(used),
                                        available: formatBytes(free),
                                        usePercent: percent.toFixed(1) + '%',
                                        mount: drive + ':\\'
                                    };
                                }
                            } catch (e) {
                                // Drive not available
                            }
                        });
                    }
                }
                
                return diskInfo;
            } catch (error) {
                console.error('Error getting disk info:', error);
                return {};
            }
        }
        
        async function getDirectorySize(dirPath) {
            let totalSize = 0;
            
            try {
                const items = readdirSync(dirPath, { withFileTypes: true });
                
                for (const item of items) {
                    const fullPath = path.join(dirPath, item.name);
                    
                    try {
                        if (item.isDirectory()) {
                            totalSize += await getDirectorySize(fullPath);
                        } else if (item.isFile()) {
                            const stats = statSync(fullPath);
                            totalSize += stats.size;
                        }
                    } catch (e) {
                        // Skip inaccessible files/directories
                    }
                }
            } catch (error) {
                console.error(`Error reading directory ${dirPath}:`, error.message);
            }
            
            return totalSize;
        }
        
        async function getBotStorageInfo() {
            const directories = {
                'Session': './session',
                'Commands': './commands',
                'Data Files': './',
                'Logs': './logs'
            };
            
            const results = {};
            
            for (const [name, dirPath] of Object.entries(directories)) {
                if (existsSync(dirPath)) {
                    try {
                        const size = await getDirectorySize(dirPath);
                        results[name] = {
                            size: size,
                            formatted: formatBytes(size),
                            path: dirPath
                        };
                    } catch (error) {
                        results[name] = {
                            size: 0,
                            formatted: '0 Bytes',
                            path: dirPath,
                            error: error.message
                        };
                    }
                } else {
                    results[name] = {
                        size: 0,
                        formatted: '0 Bytes',
                        path: dirPath,
                        exists: false
                    };
                }
            }
            
            return results;
        }
        
        async function getSystemInfo() {
            const platform = os.platform();
            const arch = os.arch();
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const uptime = os.uptime();
            const cpus = os.cpus();
            
            // Get load average
            const loadAvg = os.loadavg();
            
            // Get network interfaces
            const network = os.networkInterfaces();
            
            return {
                platform: platform,
                arch: arch,
                memory: {
                    total: totalMem,
                    used: usedMem,
                    free: freeMem,
                    percent: (usedMem / totalMem) * 100
                },
                uptime: uptime,
                cpus: cpus.length,
                load: loadAvg,
                hostname: os.hostname(),
                network: network
            };
        }
        
        // ====== COMMAND HANDLING ======
        const command = args[0]?.toLowerCase() || 'all';
        
        switch (command) {
            case 'all':
            case 'info':
                try {
                    const diskInfo = await getDiskInfo();
                    const systemInfo = await getSystemInfo();
                    const botStorage = await getBotStorageInfo();
                    
                    let response = `💾 *DISK & SYSTEM INFORMATION*\n\n`;
                    
                    // System overview
                    response += `🖥️ *System Overview*\n`;
                    response += `├─ OS: ${systemInfo.platform} ${systemInfo.arch}\n`;
                    response += `├─ Hostname: ${systemInfo.hostname}\n`;
                    response += `├─ CPU Cores: ${systemInfo.cpus}\n`;
                    response += `├─ Load Average: ${systemInfo.load[0].toFixed(2)}, ${systemInfo.load[1].toFixed(2)}, ${systemInfo.load[2].toFixed(2)}\n`;
                    response += `├─ Uptime: ${Math.floor(systemInfo.uptime / 3600)}h ${Math.floor((systemInfo.uptime % 3600) / 60)}m\n`;
                    
                    // Memory usage with progress bar
                    const memPercent = systemInfo.memory.percent;
                    response += `└─ Memory: ${getStorageColor(memPercent)} ${getProgressBar(memPercent)}\n`;
                    response += `   ${formatBytes(systemInfo.memory.used)} / ${formatBytes(systemInfo.memory.total)} (${memPercent.toFixed(1)}%)\n\n`;
                    
                    // Disk partitions
                    response += `💿 *Disk Partitions*\n`;
                    if (Object.keys(diskInfo).length > 0) {
                        Object.entries(diskInfo).forEach(([mount, info], index) => {
                            const percent = parseFloat(info.usePercent);
                            response += `${getStorageColor(percent)} *${mount}* (${info.filesystem})\n`;
                            response += `├─ ${getProgressBar(percent)}\n`;
                            response += `├─ Used: ${info.used}\n`;
                            response += `├─ Free: ${info.available}\n`;
                            response += `├─ Total: ${info.size}\n`;
                            response += `└─ Usage: ${info.usePercent}\n`;
                            
                            if (index < Object.keys(diskInfo).length - 1) {
                                response += '\n';
                            }
                        });
                    } else {
                        response += `No disk information available\n`;
                    }
                    
                    response += `\n🤖 *Bot Storage Usage*\n`;
                    Object.entries(botStorage).forEach(([name, info]) => {
                        if (info.exists === false) {
                            response += `├─ ${name}: ❌ Not found\n`;
                        } else if (info.error) {
                            response += `├─ ${name}: ⚠️ Error: ${info.error}\n`;
                        } else {
                            response += `├─ ${name}: ${info.formatted}\n`;
                        }
                    });
                    
                    // Calculate total bot storage
                    const totalBotSize = Object.values(botStorage).reduce((sum, info) => sum + (info.size || 0), 0);
                    response += `└─ *Total Bot:* ${formatBytes(totalBotSize)}\n\n`;
                    
                    response += `⚡ *Quick Commands:*\n`;
                    response += `├─ \`${PREFIX}disk bot\` - Bot storage details\n`;
                    response += `├─ \`${PREFIX}disk system\` - System details\n`;
                    response += `├─ \`${PREFIX}disk partitions\` - Disk partitions only\n`;
                    response += `└─ \`${PREFIX}disk clean\` - Storage cleanup\n`;
                    
                    await sock.sendMessage(chatId, {
                        text: response
                    }, { quoted: msg });
                    
                } catch (error) {
                    await sock.sendMessage(chatId, {
                        text: `❌ *Error getting disk information*\n\nError: ${error.message}\n\nCheck console for details.`
                    }, { quoted: msg });
                }
                break;
                
            case 'bot':
            case 'storage':
                try {
                    const botStorage = await getBotStorageInfo();
                    
                    let response = `🤖 *BOT STORAGE DETAILS*\n\n`;
                    
                    // Detailed breakdown
                    Object.entries(botStorage).forEach(([name, info]) => {
                        response += `📁 *${name}*\n`;
                        response += `├─ Path: ${info.path}\n`;
                        
                        if (info.exists === false) {
                            response += `└─ Status: ❌ Directory not found\n\n`;
                        } else if (info.error) {
                            response += `└─ Status: ⚠️ ${info.error}\n\n`;
                        } else {
                            response += `├─ Size: ${info.formatted}\n`;
                            
                            // Show file count for directories
                            if (name === 'Session' || name === 'Commands') {
                                try {
                                    const files = readdirSync(info.path, { withFileTypes: true });
                                    const fileCount = files.filter(f => f.isFile()).length;
                                    const dirCount = files.filter(f => f.isDirectory()).length;
                                    response += `├─ Files: ${fileCount}\n`;
                                    response += `└─ Folders: ${dirCount}\n\n`;
                                } catch (e) {
                                    response += `└─ File count: ❌ Unavailable\n\n`;
                                }
                            } else {
                                response += `└─ Status: ✅ OK\n\n`;
                            }
                        }
                    });
                    
                    // Calculate totals
                    const totalSize = Object.values(botStorage).reduce((sum, info) => sum + (info.size || 0), 0);
                    const largestDir = Object.entries(botStorage).reduce((max, [name, info]) => 
                        info.size > max.size ? {name, size: info.size} : max, 
                        {name: 'None', size: 0}
                    );
                    
                    response += `📊 *Summary*\n`;
                    response += `├─ Total Storage: ${formatBytes(totalSize)}\n`;
                    response += `├─ Largest: ${largestDir.name} (${formatBytes(largestDir.size)})\n`;
                    
                    // Check for large session files
                    if (botStorage['Session'] && botStorage['Session'].size > 50 * 1024 * 1024) { // > 50MB
                        response += `└─ ⚠️ Session folder is large (${botStorage['Session'].formatted})\n`;
                        response += `   Use \`${PREFIX}disk clean\` to clear old sessions\n`;
                    } else {
                        response += `└─ Storage: ✅ Within limits\n`;
                    }
                    
                    await sock.sendMessage(chatId, {
                        text: response
                    }, { quoted: msg });
                    
                } catch (error) {
                    await sock.sendMessage(chatId, {
                        text: `❌ *Error getting bot storage*\n\nError: ${error.message}`
                    }, { quoted: msg });
                }
                break;
                
            case 'system':
            case 'sysinfo':
                try {
                    const systemInfo = await getSystemInfo();
                    
                    let response = `🖥️ *SYSTEM INFORMATION*\n\n`;
                    
                    // Platform info
                    response += `📋 *Platform*\n`;
                    response += `├─ OS: ${systemInfo.platform} ${systemInfo.arch}\n`;
                    response += `├─ Hostname: ${systemInfo.hostname}\n`;
                    response += `├─ Node.js: ${process.version}\n`;
                    response += `└─ Bot: ${BOT_NAME} v${VERSION}\n\n`;
                    
                    // CPU Information
                    response += `⚡ *CPU Information*\n`;
                    response += `├─ Cores: ${systemInfo.cpus}\n`;
                    response += `├─ Model: ${systemInfo.cpus[0]?.model || 'Unknown'}\n`;
                    response += `├─ Speed: ${systemInfo.cpus[0]?.speed || 'Unknown'} MHz\n`;
                    response += `└─ Load: ${systemInfo.load[0].toFixed(2)} (1min), ${systemInfo.load[1].toFixed(2)} (5min), ${systemInfo.load[2].toFixed(2)} (15min)\n\n`;
                    
                    // Memory Usage with detailed breakdown
                    const memPercent = systemInfo.memory.percent;
                    response += `💾 *Memory Usage*\n`;
                    response += `${getStorageColor(memPercent)} ${getProgressBar(memPercent)}\n`;
                    response += `├─ Used: ${formatBytes(systemInfo.memory.used)}\n`;
                    response += `├─ Free: ${formatBytes(systemInfo.memory.free)}\n`;
                    response += `├─ Total: ${formatBytes(systemInfo.memory.total)}\n`;
                    response += `└─ Usage: ${memPercent.toFixed(1)}%\n\n`;
                    
                    // Uptime
                    const uptime = systemInfo.uptime;
                    const days = Math.floor(uptime / 86400);
                    const hours = Math.floor((uptime % 86400) / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    
                    response += `⏰ *Uptime*\n`;
                    response += `├─ System: ${days}d ${hours}h ${minutes}m\n`;
                    response += `└─ Bot: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\n\n`;
                    
                    // Network info
                    response += `🌐 *Network Interfaces*\n`;
                    let hasNetwork = false;
                    
                    Object.entries(systemInfo.network).forEach(([name, interfaces]) => {
                        interfaces.forEach(intf => {
                            if (intf.family === 'IPv4' && !intf.internal) {
                                response += `├─ ${name}: ${intf.address}\n`;
                                hasNetwork = true;
                            }
                        });
                    });
                    
                    if (!hasNetwork) {
                        response += `└─ No external network interfaces found\n`;
                    }
                    
                    await sock.sendMessage(chatId, {
                        text: response
                    }, { quoted: msg });
                    
                } catch (error) {
                    await sock.sendMessage(chatId, {
                        text: `❌ *Error getting system information*\n\nError: ${error.message}`
                    }, { quoted: msg });
                }
                break;
                
            case 'partitions':
            case 'disks':
            case 'volumes':
                try {
                    const diskInfo = await getDiskInfo();
                    
                    if (Object.keys(diskInfo).length === 0) {
                        return sock.sendMessage(chatId, {
                            text: `❌ *No disk information available*\n\nThis command may not be supported on your system.`
                        }, { quoted: msg });
                    }
                    
                    let response = `💿 *DISK PARTITIONS*\n\n`;
                    
                    Object.entries(diskInfo).forEach(([mount, info]) => {
                        const percent = parseFloat(info.usePercent);
                        const color = getStorageColor(percent);
                        
                        response += `${color} *${mount}*\n`;
                        response += `├─ Filesystem: ${info.filesystem}\n`;
                        response += `${getProgressBar(percent)}\n`;
                        response += `├─ Used: ${info.used} (${info.usePercent})\n`;
                        response += `├─ Free: ${info.available}\n`;
                        response += `└─ Total: ${info.size}\n\n`;
                    });
                    
                    // Calculate totals
                    const totalSpace = Object.values(diskInfo).reduce((sum, info) => {
                        const sizeMatch = info.size.match(/([\d.]+)\s*(\w+)/);
                        if (sizeMatch) {
                            const value = parseFloat(sizeMatch[1]);
                            const unit = sizeMatch[2];
                            const multiplier = {
                                'B': 1,
                                'K': 1024,
                                'M': 1024 * 1024,
                                'G': 1024 * 1024 * 1024,
                                'T': 1024 * 1024 * 1024 * 1024
                            }[unit[0]] || 1;
                            return sum + (value * multiplier);
                        }
                        return sum;
                    }, 0);
                    
                    response += `📊 *Summary*\n`;
                    response += `├─ Total partitions: ${Object.keys(diskInfo).length}\n`;
                    response += `└─ Total space: ${formatBytes(totalSpace)}\n`;
                    
                    await sock.sendMessage(chatId, {
                        text: response
                    }, { quoted: msg });
                    
                } catch (error) {
                    await sock.sendMessage(chatId, {
                        text: `❌ *Error getting disk partitions*\n\nError: ${error.message}\n\nTry: \`${PREFIX}disk all\``
                    }, { quoted: msg });
                }
                break;
                
            case 'clean':
            case 'cleanup':
                try {
                    const dm = extra?.DiskManager;
                    if (!dm) {
                        return sock.sendMessage(chatId, {
                            text: `❌ *Disk Manager not available*\n\nPlease restart the bot.`
                        }, { quoted: msg });
                    }

                    const aggressive = args[1]?.toLowerCase() === 'deep' || args[1]?.toLowerCase() === 'aggressive';
                    const reportBefore = dm.getCleanupReport();

                    await sock.sendMessage(chatId, {
                        text: `🧹 *Running ${aggressive ? 'DEEP' : 'standard'} cleanup...*\n\nPlease wait...`
                    }, { quoted: msg });

                    const results = dm.runCleanup(aggressive);
                    const reportAfter = dm.getCleanupReport();
                    const total = Object.values(results).reduce((a, b) => a + b, 0);

                    let response = `🧹 *DISK CLEANUP COMPLETE*\n\n`;
                    response += `📊 *Before → After:*\n`;
                    if (reportBefore.freeMB !== null) {
                        response += `├─ Free Space: ${reportBefore.freeMB}MB → ${reportAfter.freeMB}MB\n`;
                    }
                    response += `├─ Session Signal Files: ${reportBefore.sessionSignalFiles} (${reportBefore.sessionSignalMB}MB)\n`;
                    response += `├─ ViewOnce Media: ${reportBefore.viewonceMediaMB}MB\n`;
                    response += `├─ Antidelete Media: ${reportBefore.antideleteMediaMB}MB\n`;
                    response += `├─ Status Media: ${reportBefore.statusMediaMB || 0}MB\n`;
                    response += `├─ Temp Files: ${reportBefore.tempFilesMB}MB\n`;
                    response += `├─ Session Backups: ${reportBefore.backupMB}MB\n`;
                    response += `└─ Status Logs: ${reportBefore.statusLogsMB}MB\n\n`;

                    response += `🗑️ *Removed:*\n`;
                    response += `├─ Session files: ${results.sessionFiles}\n`;
                    response += `├─ ViewOnce media: ${results.viewonceMedia}\n`;
                    response += `├─ Antidelete media: ${results.antideleteMedia}\n`;
                    response += `├─ Status media: ${results.statusMedia}\n`;
                    response += `├─ Temp files: ${results.tempFiles}\n`;
                    response += `├─ Backups: ${results.backups}\n`;
                    response += `├─ Status logs: ${results.statusLogs ? 'Truncated' : 'OK'}\n`;
                    response += `└─ *Total: ${total} items removed*\n\n`;

                    if (reportAfter.freeMB !== null && reportAfter.freeMB < 50) {
                        response += `⚠️ Disk space still low (${reportAfter.freeMB}MB). Consider removing unused files manually.\n\n`;
                    }

                    response += `💡 *Usage:*\n`;
                    response += `├─ \`${PREFIX}disk clean\` - Standard cleanup\n`;
                    response += `└─ \`${PREFIX}disk clean deep\` - Aggressive cleanup (removes more)\n`;

                    await sock.sendMessage(chatId, {
                        text: response
                    }, { quoted: msg });
                } catch (error) {
                    await sock.sendMessage(chatId, {
                        text: `❌ *Cleanup Error*\n\nError: ${error.message}`
                    }, { quoted: msg });
                }
                break;
                
            case 'monitor':
            case 'watch':
                // Real-time monitoring (limited to one update)
                try {
                    const diskInfo = await getDiskInfo();
                    const systemInfo = await getSystemInfo();
                    
                    let response = `📡 *REAL-TIME MONITOR*\n\n`;
                    response += `🕒 ${new Date().toLocaleTimeString()}\n\n`;
                    
                    // Memory
                    const memPercent = systemInfo.memory.percent;
                    response += `💾 *Memory:* ${getStorageColor(memPercent)} ${memPercent.toFixed(1)}%\n`;
                    response += `${getProgressBar(memPercent)}\n\n`;
                    
                    // CPU Load
                    response += `⚡ *CPU Load:* ${systemInfo.load[0].toFixed(2)}\n`;
                    
                    // Disk usage for root
                    if (diskInfo['/'] || diskInfo['root']) {
                        const rootInfo = diskInfo['/'] || diskInfo['root'];
                        const diskPercent = parseFloat(rootInfo.usePercent);
                        response += `\n💿 *Disk:* ${getStorageColor(diskPercent)} ${diskPercent.toFixed(1)}%\n`;
                        response += `${getProgressBar(diskPercent)}\n`;
                        response += `Used: ${rootInfo.used} / ${rootInfo.size}\n`;
                    }
                    
                    response += `\n⏱️ *Bot Uptime:* ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`;
                    
                    await sock.sendMessage(chatId, {
                        text: response
                    }, { quoted: msg });
                    
                } catch (error) {
                    await sock.sendMessage(chatId, {
                        text: `❌ *Monitor Error*\n\nError: ${error.message}`
                    }, { quoted: msg });
                }
                break;
                
            case 'help':
                let helpText = `💾 *DISK COMMAND HELP*\n\n`;
                
                helpText += `📋 *Available Commands:*\n`;
                helpText += `├─ \`${PREFIX}disk\` - All information (default)\n`;
                helpText += `├─ \`${PREFIX}disk bot\` - Bot storage details\n`;
                helpText += `├─ \`${PREFIX}disk system\` - System information\n`;
                helpText += `├─ \`${PREFIX}disk partitions\` - Disk partitions\n`;
                helpText += `├─ \`${PREFIX}disk clean\` - Auto cleanup (session, media, temp)\n`;
                helpText += `├─ \`${PREFIX}disk clean deep\` - Aggressive cleanup\n`;
                helpText += `├─ \`${PREFIX}disk monitor\` - Real-time monitoring\n`;
                helpText += `└─ \`${PREFIX}disk help\` - This help message\n\n`;
                
                helpText += `⚡ *Examples:*\n`;
                helpText += `├─ \`${PREFIX}disk bot\`\n`;
                helpText += `├─ \`${PREFIX}disk system\`\n`;
                helpText += `├─ \`${PREFIX}disk clean\`\n`;
                helpText += `└─ \`${PREFIX}disk clean deep\`\n\n`;
                
                helpText += `📊 *Features:*\n`;
                helpText += `├─ Accurate disk usage\n`;
                helpText += `├─ Progress bars\n`;
                helpText += `├─ Color-coded warnings\n`;
                helpText += `└─ Cross-platform support`;
                
                await sock.sendMessage(chatId, {
                    text: helpText
                }, { quoted: msg });
                break;
                
            default:
                await sock.sendMessage(chatId, {
                    text: `❌ *Unknown disk command*\n\nUse \`${PREFIX}disk help\` to see all available commands.\n\nQuick start: \`${PREFIX}disk bot\``
                }, { quoted: msg });
        }
    }
};
