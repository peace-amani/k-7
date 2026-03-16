// import { exec } from "child_process";
// import { getBotName } from '../../lib/botname.js';
// import { promisify } from "util";
// import fs from "fs";
// import fsPromises from "fs/promises";
// import path from "path";
// import { fileURLToPath } from "url";
// import https from "https";
// import http from "http";
// import { createRequire } from 'module';
// import { createWriteStream } from "fs";
// import AdmZip from 'adm-zip'; // Direct import for JS extraction

// const execAsync = promisify(exec);
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const require = createRequire(import.meta.url);

// /* -------------------- Configuration with Token -------------------- */
// // Use environment variable or fallback to hardcoded
// const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

// // Platform detection
// const IS_WINDOWS = process.platform === 'win32';
// const IS_LINUX = process.platform === 'linux';
// const IS_MAC = process.platform === 'darwin';
// const IS_RAILWAY = !!process.env.RAILWAY_SERVICE_ID;
// const IS_RENDER = !!process.env.RENDER_SERVICE_ID;
// const IS_HEROKU = !!process.env.DYNO;

// console.log(`[UPDATE] Platform: ${process.platform} | Railway: ${IS_RAILWAY} | Render: ${IS_RENDER} | Heroku: ${IS_HEROKU}`);

// // Updated URLs with token authentication
// const UPDATE_ZIP_URL = `https://${GITHUB_TOKEN}@github.com/nk-apex/n7/archive/refs/heads/main.zip`;
// const GIT_REPO_URL = `https://${GITHUB_TOKEN}@github.com/nk-apex/n7.git`;
// const API_ZIP_URL = `https://api.github.com/repos/nk-apex/n7/zipball/main`;

// // Public repo URL for display purposes only
// const OWNER_REPO_URL = "https://github.com/7silent-wolf/silentwolf.git";

// // Timeout configurations
// const DOWNLOAD_TIMEOUT = 120000;
// const EXTRACTION_TIMEOUT = 180000;
// const COPY_TIMEOUT = 300000;
// const PRESERVE_TIMEOUT = 30000;
// const GIT_CLEAN_TIMEOUT = 60000;

// // Cache for hot-reloaded modules
// const moduleCache = new Map();
// const commandCache = new Map();

// /* -------------------- Enhanced Helpers -------------------- */
// async function run(cmd, timeout = 60000) {
//   return new Promise((resolve, reject) => {
//     exec(cmd, { timeout, windowsHide: true }, (err, stdout, stderr) => {
//       if (err) return reject(new Error(stderr || stdout || err.message));
//       resolve(stdout.toString().trim());
//     });
//   });
// }

// async function hasGitRepo() {
//   const gitDir = path.join(process.cwd(), '.git');
//   if (!fs.existsSync(gitDir)) return false;
//   try {
//     await run('git --version');
//     return true;
//   } catch {
//     return false;
//   }
// }

// /* -------------------- GitHub API Helper for Token Validation -------------------- */
// async function validateToken() {
//   try {
//     const response = await fetch('https://api.github.com/user', {
//       headers: {
//         'Authorization': `token ${GITHUB_TOKEN}`,
//         'User-Agent': 'WolfBot-Updater'
//       }
//     });
//     if (response.ok) {
//       const data = await response.json();
//       console.log(`✅ GitHub token validated for: ${data.login}`);
//       return true;
//     }
//     return false;
//   } catch {
//     return false;
//   }
// }

// /* -------------------- Repository Size Monitor -------------------- */
// async function checkRepoSize() {
//   try {
//     const countOutput = await run('git count-objects -v');
//     const lines = countOutput.split('\n');
//     const sizeData = {};
    
//     lines.forEach(line => {
//       const [key, value] = line.split(': ');
//       sizeData[key] = parseInt(value) || value;
//     });
    
//     const packSizeKB = sizeData['size-pack'] || 0;
//     const sizeMB = (packSizeKB / 1024).toFixed(2);
    
//     return {
//       sizeKB: packSizeKB,
//       sizeMB: sizeMB,
//       objects: sizeData['in-pack'] || 0,
//       packs: sizeData['packs'] || 0
//     };
//   } catch (error) {
//     console.error('Could not check repo size:', error);
//     return { sizeMB: 'unknown', objects: 0 };
//   }
// }

// /* -------------------- Deep Git History Cleaner -------------------- */
// async function deepCleanGitHistory(options = {}) {
//   console.log('🚀 Starting deep Git history cleanup...');
  
//   const {
//     preserveBranches = true,
//     maxHistoryDepth = 10,
//     keepRecentCommits = 50
//   } = options;
  
//   try {
//     // Get current state
//     const currentBranch = await run('git rev-parse --abbrev-ref HEAD').catch(() => 'main');
//     const currentCommit = await run('git rev-parse HEAD');
    
//     // List all branches
//     const branchesOutput = await run('git branch -a');
//     const branches = branchesOutput.split('\n')
//       .map(b => b.trim())
//       .filter(b => b && !b.includes('detached') && !b.includes('->'))
//       .map(b => b.replace('* ', '').replace('remotes/', ''));
    
//     console.log(`Found ${branches.length} branches: ${branches.join(', ')}`);
    
//     // Preserve essential files
//     const { preserveDir, preserved } = await preserveEssentialFiles();
//     console.log(`Preserved ${preserved.length} items`);
    
//     // Create a temporary directory for fresh start
//     const tempDir = path.join(process.cwd(), 'tmp_git_fresh');
//     if (fs.existsSync(tempDir)) {
//       await fsPromises.rm(tempDir, { recursive: true, force: true });
//     }
//     await fsPromises.mkdir(tempDir, { recursive: true });
    
//     // Copy only essential files to temp directory
//     const essentialFiles = await getEssentialFiles();
//     for (const file of essentialFiles) {
//       const srcPath = path.join(process.cwd(), file);
//       const destPath = path.join(tempDir, file);
      
//       if (fs.existsSync(srcPath)) {
//         const destDir = path.dirname(destPath);
//         await fsPromises.mkdir(destDir, { recursive: true });
//         await fsPromises.copyFile(srcPath, destPath);
//       }
//     }
    
//     // Backup .git folder (just in case)
//     const gitBackup = path.join(process.cwd(), '.git_backup_' + Date.now());
//     if (fs.existsSync(path.join(process.cwd(), '.git'))) {
//       try {
//         await fsPromises.rename(path.join(process.cwd(), '.git'), gitBackup);
//       } catch {
//         console.log('Could not backup .git folder');
//       }
//     }
    
//     // Remove old .git completely
//     try {
//       await fsPromises.rm(path.join(process.cwd(), '.git'), { recursive: true, force: true });
//     } catch (error) {
//       console.log('Old .git folder already removed or inaccessible');
//     }
    
//     // Initialize fresh repository
//     console.log('Initializing fresh Git repository...');
//     await run('git init');
//     await run('git config user.email "bot@silentwolf.com"');
//     await run('git config user.name "SilentWolf Bot"');
    
//     // Copy files back from temp directory
//     console.log('Restoring essential files...');
//     const copyResult = await copyDirectoryContents(tempDir, process.cwd());
    
//     // Add and commit
//     await run('git add .');
//     await run(`git commit -m "🚀 Fresh repository - optimized size\n\n• Cleared all history\n• Preserved ${preserved.length} essential items\n• Maintained branch: ${currentBranch}\n• Timestamp: ${new Date().toISOString()}"`);
    
//     // Create main branch
//     await run(`git branch -M ${currentBranch}`);
    
//     // Create other branches if preserving branches
//     if (preserveBranches && branches.length > 1) {
//       for (const branch of branches) {
//         if (branch !== currentBranch && !branch.includes('origin/')) {
//           try {
//             await run(`git checkout -b ${branch} ${currentBranch}`);
//             console.log(`Created branch: ${branch}`);
//           } catch {
//             console.log(`Could not create branch: ${branch}`);
//           }
//         }
//       }
//       // Return to original branch
//       await run(`git checkout ${currentBranch}`);
//     }
    
//     // Restore preserved files
//     await restorePreservedFiles(preserveDir);
    
//     // Cleanup
//     await fsPromises.rm(tempDir, { recursive: true, force: true });
    
//     // Optional: Remove old git backup after some time
//     setTimeout(async () => {
//       try {
//         if (fs.existsSync(gitBackup)) {
//           await fsPromises.rm(gitBackup, { recursive: true, force: true });
//         }
//       } catch {}
//     }, 60000); // Delete backup after 1 minute
    
//     const newSize = await checkRepoSize();
//     console.log(`✅ Git history deep cleaned! New size: ${newSize.sizeMB} MB`);
    
//     return {
//       success: true,
//       originalCommit: currentCommit.slice(0, 7),
//       originalBranch: currentBranch,
//       newSize: newSize.sizeMB,
//       branchesPreserved: preserveBranches ? branches.length : 1,
//       filesRestored: copyResult.filesCount
//     };
    
//   } catch (error) {
//     console.error('Deep Git cleanup failed:', error);
    
//     // Try to restore from backup
//     try {
//       if (fs.existsSync(path.join(process.cwd(), '.git_backup'))) {
//         await fsPromises.rm(path.join(process.cwd(), '.git'), { recursive: true, force: true });
//         await fsPromises.rename(path.join(process.cwd(), '.git_backup'), path.join(process.cwd(), '.git'));
//         console.log('Restored from backup');
//       }
//     } catch {}
    
//     throw error;
//   }
// }

// /* -------------------- Get Essential Files List -------------------- */
// async function getEssentialFiles() {
//   const ignorePatterns = [
//     /^\.git($|\/)/,
//     /^node_modules($|\/)/,
//     /^tmp($|\/)/,
//     /^temp($|\/)/,
//     /^logs($|\/)/,
//     /^\.env$/,
//     /^\.env\..*$/,
//     /^\.backup/,
//     /^backup-/,
//     /\.log$/,
//     /\.cache$/,
//     /^session($|\/)/,
//     /^baileys_store\.json$/,
//     /^settings\.js$/,
//     /^config\.json$/,
//     /^package-lock\.json$/,
//     /^yarn\.lock$/,
//     /^pnpm-lock\.yaml$/,
//     /\.DS_Store$/,
//     /Thumbs\.db$/,
//     /desktop\.ini$/,
//     /^dist($|\/)/,
//     /^build($|\/)/,
//     /^coverage($|\/)/,
//     /\.tmp($|\/)/,
//     /\.temp($|\/)/,
//     /\.history($|\/)/,
//     /\.vscode($|\/)/,
//     /\.idea($|\/)/
//   ];
  
//   const essentialExtensions = [
//     '.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt',
//     '.yml', '.yaml', '.xml', '.html', '.css', '.scss',
//     '.py', '.php', '.java', '.cpp', '.c', '.go', '.rs',
//     '.sql', '.sh', '.bat', '.ps1', '.env.example'
//   ];
  
//   async function scanDir(dir, relative = '') {
//     const files = [];
//     try {
//       const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      
//       for (const entry of entries) {
//         const fullPath = path.join(dir, entry.name);
//         const relPath = relative ? path.join(relative, entry.name) : entry.name;
        
//         // Skip ignored patterns
//         if (ignorePatterns.some(pattern => pattern.test(entry.name) || pattern.test(relPath))) {
//           continue;
//         }
        
//         if (entry.isDirectory()) {
//           const subFiles = await scanDir(fullPath, relPath);
//           files.push(...subFiles);
//         } else {
//           // Check if file has essential extension
//           const ext = path.extname(entry.name).toLowerCase();
//           if (essentialExtensions.includes(ext) || entry.name.startsWith('.')) {
//             files.push(relPath);
//           }
//         }
//       }
//     } catch (error) {
//       console.warn(`Could not scan directory ${dir}:`, error.message);
//     }
    
//     return files;
//   }
  
//   return await scanDir(process.cwd());
// }

// /* -------------------- Copy Directory Contents -------------------- */
// async function copyDirectoryContents(src, dest) {
//   let filesCount = 0;
  
//   async function copyRecursive(srcPath, destPath) {
//     await fsPromises.mkdir(destPath, { recursive: true });
    
//     const entries = await fsPromises.readdir(srcPath, { withFileTypes: true });
    
//     for (const entry of entries) {
//       const srcEntry = path.join(srcPath, entry.name);
//       const destEntry = path.join(destPath, entry.name);
      
//       if (entry.isDirectory()) {
//         await copyRecursive(srcEntry, destEntry);
//       } else {
//         await fsPromises.copyFile(srcEntry, destEntry);
//         filesCount++;
        
//         if (filesCount % 50 === 0) {
//           console.log(`Copied ${filesCount} files...`);
//         }
//       }
//     }
//   }
  
//   await copyRecursive(src, dest);
//   return { filesCount };
// }

// /* -------------------- Smart Git Update with Auto-Clean -------------------- */
// async function smartGitUpdate(options = {}) {
//   const {
//     autoCleanHistory = true,
//     cleanThresholdMB = 100,
//     maxHistoryDepth = 20,
//     preserveEssential = true
//   } = options;
  
//   console.log('Starting smart Git update...');
  
//   try {
//     // Check repo size before update
//     const sizeBefore = await checkRepoSize();
//     console.log(`Current repository size: ${sizeBefore.sizeMB} MB`);
    
//     // Check if we need to clean based on threshold
//     const shouldClean = autoCleanHistory && parseFloat(sizeBefore.sizeMB) > cleanThresholdMB;
    
//     if (shouldClean) {
//       console.log(`Repository size (${sizeBefore.sizeMB} MB) exceeds threshold (${cleanThresholdMB} MB), performing cleanup...`);
//       await deepCleanGitHistory({
//         preserveBranches: true,
//         maxHistoryDepth: maxHistoryDepth
//       });
//     }
    
//     // Perform the update
//     const updateResult = await updateViaGit();
    
//     // Check size after update
//     const sizeAfter = await checkRepoSize();
    
//     // If still too large or grew significantly, do another cleanup
//     if (autoCleanHistory && (parseFloat(sizeAfter.sizeMB) > cleanThresholdMB || 
//         (parseFloat(sizeAfter.sizeMB) - parseFloat(sizeBefore.sizeMB) > 50))) {
//       console.log('Post-update cleanup triggered...');
//       await deepCleanGitHistory({
//         preserveBranches: true,
//         maxHistoryDepth: 10
//       });
      
//       const finalSize = await checkRepoSize();
//       console.log(`Final repository size: ${finalSize.sizeMB} MB`);
      
//       return {
//         ...updateResult,
//         historyCleaned: true,
//         initialSize: sizeBefore.sizeMB,
//         finalSize: finalSize.sizeMB,
//         reduction: (parseFloat(sizeBefore.sizeMB) - parseFloat(finalSize.sizeMB)).toFixed(2)
//       };
//     }
    
//     return {
//       ...updateResult,
//       historyCleaned: shouldClean,
//       sizeBefore: sizeBefore.sizeMB,
//       sizeAfter: sizeAfter.sizeMB
//     };
    
//   } catch (error) {
//     console.error('Smart Git update failed:', error);
//     throw error;
//   }
// }

// /* -------------------- Git Update with Token Authentication -------------------- */
// async function updateViaGit(cleanAfter = false) {
//   try {
//     console.log('Starting Git update with token authentication...');
    
//     try {
//       await run('git --version');
//     } catch {
//       throw new Error('Git is not installed or not in PATH');
//     }
    
//     const sizeBefore = await checkRepoSize();
//     console.log(`Current size: ${sizeBefore.sizeMB} MB`);
    
//     const oldRev = await run('git rev-parse HEAD').catch(() => 'unknown');
//     console.log(`Current revision: ${oldRev.slice(0, 7)}`);
    
//     console.log('Pre-fetch cleanup...');
//     await run('git prune --expire=now').catch(() => {});
//     await run('git gc --auto').catch(() => {});
    
//     // Update remote URL with token
//     const tokenUrl = `https://${GITHUB_TOKEN}@github.com/nk-apex/n7.git`;
    
//     try {
//       await run('git remote get-url bot-upstream');
//       console.log('Updating bot-upstream remote with token...');
//       await run(`git remote set-url bot-upstream ${tokenUrl}`);
//     } catch {
//       console.log('Adding bot-upstream remote with token...');
//       await run(`git remote add bot-upstream ${tokenUrl}`);
//     }
    
//     console.log('Fetching updates (limited history: depth=20)...');
//     await run('git fetch bot-upstream --depth=20 --prune');
    
//     const currentBranch = await run('git rev-parse --abbrev-ref HEAD').catch(() => 'main');
    
//     let newRev;
//     try {
//       newRev = await run(`git rev-parse bot-upstream/${currentBranch}`);
//     } catch {
//       newRev = await run('git rev-parse bot-upstream/main');
//     }
    
//     if (oldRev === newRev) {
//       console.log('Already up to date');
//       await run('git gc --auto').catch(() => {});
      
//       // Optionally clean even if up to date
//       if (cleanAfter) {
//         console.log('Performing cleanup as requested...');
//         await deepCleanGitHistory();
//       }
      
//       return {
//         oldRev,
//         newRev,
//         alreadyUpToDate: true,
//         branch: currentBranch,
//         files: []
//       };
//     }
    
//     console.log(`Updating to: ${newRev.slice(0, 7)}`);
    
//     const timestamp = Date.now();
//     const backupBranch = `backup-${timestamp}`;
//     await run(`git branch ${backupBranch}`).catch(() => {
//       console.log('Could not create backup branch');
//     });
    
//     await run(`git merge --ff-only ${newRev}`);
    
//     console.log('Post-merge cleanup...');
//     await run('git prune --expire=now').catch(() => {});
//     await run('git gc --aggressive --prune=now').catch(() => {});
    
//     const sizeAfter = await checkRepoSize();
//     const sizeDiff = (parseFloat(sizeAfter.sizeMB) - parseFloat(sizeBefore.sizeMB)).toFixed(2);
    
//     console.log(`Size after update: ${sizeAfter.sizeMB} MB (${sizeDiff >= 0 ? '+' : ''}${sizeDiff} MB)`);
    
//     // Perform deep clean if requested
//     if (cleanAfter) {
//       console.log('Performing deep history cleanup...');
//       await deepCleanGitHistory();
//       const finalSize = await checkRepoSize();
//       console.log(`Final size after cleanup: ${finalSize.sizeMB} MB`);
//     }
    
//     return {
//       oldRev,
//       newRev,
//       alreadyUpToDate: false,
//       branch: currentBranch,
//       backupBranch,
//       files: [],
//       sizeBefore: sizeBefore.sizeMB,
//       sizeAfter: sizeAfter.sizeMB,
//       sizeDiff: sizeDiff,
//       cleaned: cleanAfter
//     };
    
//   } catch (error) {
//     console.error('Git update failed:', error);
    
//     try {
//       const branches = await run('git branch --list backup-*');
//       if (branches) {
//         const backupList = branches.split('\n').filter(b => b.trim());
//         if (backupList.length > 0) {
//           const latestBackup = backupList[backupList.length - 1].trim();
//           console.log(`Reverting to backup: ${latestBackup}`);
//           await run(`git reset --hard ${latestBackup}`);
//         }
//       }
//     } catch (revertError) {
//       console.error('Could not revert:', revertError);
//     }
    
//     throw error;
//   }
// }

// /* -------------------- Async Download with Progress (Token Auth) -------------------- */
// async function downloadWithProgress(url, dest, onProgress) {
//   return new Promise((resolve, reject) => {
//     const client = url.startsWith('https://') ? https : http;
    
//     const options = {
//       headers: {
//         'User-Agent': 'WolfBot-Updater/3.0',
//         'Accept': '*/*',
//         'Authorization': `token ${GITHUB_TOKEN}`
//       },
//       timeout: DOWNLOAD_TIMEOUT
//     };
    
//     const req = client.get(url, options, (res) => {
//       if (res.statusCode === 302 || res.statusCode === 301) {
//         const redirectUrl = res.headers.location;
//         res.resume();
//         return downloadWithProgress(new URL(redirectUrl, url).toString(), dest, onProgress)
//           .then(resolve)
//           .catch(reject);
//       }
      
//       if (res.statusCode === 401 || res.statusCode === 403) {
//         res.resume();
//         return reject(new Error('GitHub token invalid or expired'));
//       }
      
//       if (res.statusCode !== 200) {
//         res.resume();
//         return reject(new Error(`HTTP ${res.statusCode}`));
//       }
      
//       const totalSize = parseInt(res.headers['content-length']) || 0;
//       let downloaded = 0;
//       const fileStream = createWriteStream(dest);
      
//       res.on('data', (chunk) => {
//         downloaded += chunk.length;
//         if (onProgress && totalSize > 0) {
//           const percent = Math.round((downloaded / totalSize) * 100);
//           onProgress(percent, downloaded, totalSize);
//         }
//       });
      
//       res.pipe(fileStream);
      
//       fileStream.on('finish', () => {
//         fileStream.close();
//         resolve();
//       });
      
//       fileStream.on('error', (err) => {
//         fs.unlink(dest, () => reject(err));
//       });
//     });
    
//     req.on('error', (err) => {
//       fs.unlink(dest, () => reject(err));
//     });
    
//     req.on('timeout', () => {
//       req.destroy();
//       fs.unlink(dest, () => reject(new Error('Download timeout')));
//     });
//   });
// }

// /* -------------------- Hot Reload Functions -------------------- */
// async function clearModuleCache(modulePath) {
//   const normalizedPath = path.resolve(modulePath);
  
//   for (const key in require.cache) {
//     if (key.includes(normalizedPath) || key.includes(modulePath)) {
//       delete require.cache[key];
//     }
//   }
  
//   for (const [key, value] of moduleCache.entries()) {
//     if (key.includes(normalizedPath) || key.includes(modulePath)) {
//       moduleCache.delete(key);
//     }
//   }
// }

// async function hotReloadCommands(commandDir = 'commands') {
//   const commandsPath = path.join(process.cwd(), commandDir);
//   if (!fs.existsSync(commandsPath)) {
//     console.log('Commands directory not found');
//     return { reloaded: 0, errors: 0 };
//   }
  
//   let reloaded = 0;
//   let errors = 0;
  
//   try {
//     const files = await fsPromises.readdir(commandsPath, { withFileTypes: true });
    
//     for (const file of files) {
//       if (file.isFile() && file.name.endsWith('.js')) {
//         const filePath = path.join(commandsPath, file.name);
//         try {
//           await clearModuleCache(filePath);
          
//           const moduleUrl = `file://${filePath}`;
//           const module = await import(moduleUrl);
          
//           if (module.default) {
//             const commandName = module.default.name || file.name.replace('.js', '');
//             commandCache.set(commandName, module.default);
//             reloaded++;
//             console.log(`Hot-reloaded command: ${commandName}`);
//           }
//         } catch (error) {
//           console.error(`Failed to hot-reload ${file.name}:`, error.message);
//           errors++;
//         }
//       } else if (file.isDirectory()) {
//         const subDir = path.join(commandsPath, file.name);
//         const subFiles = await fsPromises.readdir(subDir, { withFileTypes: true });
        
//         for (const subFile of subFiles) {
//           if (subFile.isFile() && subFile.name.endsWith('.js')) {
//             const filePath = path.join(subDir, subFile.name);
//             try {
//               await clearModuleCache(filePath);
              
//               const moduleUrl = `file://${filePath}`;
//               const module = await import(moduleUrl);
              
//               if (module.default) {
//                 const commandName = module.default.name || subFile.name.replace('.js', '');
//                 commandCache.set(commandName, module.default);
//                 reloaded++;
//                 console.log(`Hot-reloaded command: ${file.name}/${commandName}`);
//               }
//             } catch (error) {
//               console.error(`Failed to hot-reload ${file.name}/${subFile.name}:`, error.message);
//               errors++;
//             }
//           }
//         }
//       }
//     }
    
//     console.log(`Hot reload complete: ${reloaded} commands reloaded, ${errors} errors`);
//     return { reloaded, errors };
    
//   } catch (error) {
//     console.error('Error during hot reload:', error);
//     return { reloaded: 0, errors: 1 };
//   }
// }

// /* -------------------- Fast Preserve Files -------------------- */
// async function preserveEssentialFiles() {
//   console.log('Preserving essential files...');
  
//   const essentialFiles = [
//     'settings.js',
//     'config.json',
//     '.env',
//     'baileys_store.json',
//     '.env.example',
//     'package.json',
//     'bot_name.json',
//     'bot_settings.json'
//   ];
  
//   const essentialDirs = [
//     'session',
//     'data',
//     'logs',
//     'assets',
//     'lib'
//   ];
  
//   const preserveDir = path.join(process.cwd(), 'tmp_preserve_fast_' + Date.now());
//   if (fs.existsSync(preserveDir)) {
//     await fsPromises.rm(preserveDir, { recursive: true, force: true });
//   }
//   await fsPromises.mkdir(preserveDir, { recursive: true });
  
//   const preserved = [];
  
//   for (const file of essentialFiles) {
//     const filePath = path.join(process.cwd(), file);
//     try {
//       if (fs.existsSync(filePath)) {
//         const preservePath = path.join(preserveDir, file);
//         const preserveDirPath = path.dirname(preservePath);
//         await fsPromises.mkdir(preserveDirPath, { recursive: true });
//         await fsPromises.copyFile(filePath, preservePath);
//         preserved.push(file);
//         console.log(`Preserved file: ${file}`);
//       }
//     } catch (error) {
//       console.warn(`Could not preserve ${file}:`, error.message);
//     }
//   }
  
//   for (const dir of essentialDirs) {
//     const dirPath = path.join(process.cwd(), dir);
//     try {
//       if (fs.existsSync(dirPath)) {
//         const stat = await fsPromises.stat(dirPath);
//         if (stat.isDirectory()) {
//           const preservePath = path.join(preserveDir, dir);
//           await copyDirectoryFast(dirPath, preservePath);
//           preserved.push(dir);
//           console.log(`Preserved directory: ${dir}`);
//         }
//       }
//     } catch (error) {
//       console.warn(`Could not preserve ${dir}:`, error.message);
//     }
//   }
  
//   return { preserveDir, preserved };
// }

// /* -------------------- Fast Directory Copy -------------------- */
// async function copyDirectoryFast(src, dest, timeout = PRESERVE_TIMEOUT) {
//   await fsPromises.mkdir(dest, { recursive: true });
  
//   const entries = await fsPromises.readdir(src, { withFileTypes: true });
//   const copyPromises = [];
  
//   for (const entry of entries) {
//     if (copyPromises.length > 10) {
//       await Promise.all(copyPromises);
//       copyPromises.length = 0;
//     }
    
//     const srcPath = path.join(src, entry.name);
//     const destPath = path.join(dest, entry.name);
    
//     if (entry.isDirectory()) {
//       copyPromises.push(copyDirectoryFast(srcPath, destPath, timeout));
//     } else {
//       copyPromises.push(
//         Promise.race([
//           fsPromises.copyFile(srcPath, destPath),
//           new Promise((_, reject) => 
//             setTimeout(() => reject(new Error('Copy timeout')), timeout)
//           )
//         ]).catch(error => {
//           console.warn(`Failed to copy ${srcPath}:`, error.message);
//         })
//       );
//     }
//   }
  
//   if (copyPromises.length > 0) {
//     await Promise.all(copyPromises);
//   }
// }

// /* -------------------- ZIP Update with Pure JS Extraction -------------------- */
// async function updateViaZip(zipUrl = API_ZIP_URL) {
//   console.log('Starting fast ZIP update with pure JavaScript extraction...');
  
//   const tmpDir = path.join(process.cwd(), 'tmp_update_fast_' + Date.now());
//   const zipPath = path.join(tmpDir, 'update.zip');
//   const extractTo = path.join(tmpDir, 'extracted');
  
//   try {
//     if (fs.existsSync(tmpDir)) {
//       await fsPromises.rm(tmpDir, { recursive: true, force: true });
//     }
//     await fsPromises.mkdir(tmpDir, { recursive: true });
//     await fsPromises.mkdir(extractTo, { recursive: true });
    
//     const { preserveDir, preserved } = await preserveEssentialFiles();
//     console.log(`Preserved ${preserved.length} items: ${preserved.join(', ')}`);
    
//     console.log('Downloading update from GitHub...');
//     let lastProgress = 0;
    
//     await downloadWithProgress(zipUrl, zipPath, (percent, downloaded, total) => {
//       if (percent >= lastProgress + 10 || percent === 100) {
//         console.log(`Download: ${percent}%`);
//         lastProgress = percent;
//       }
//     });
    
//     const stat = await fsPromises.stat(zipPath);
//     if (stat.size === 0) {
//       throw new Error('Downloaded file is empty');
//     }
//     console.log(`Downloaded ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
    
//     // EXTRACTION - PURE JAVASCRIPT (works everywhere)
//     console.log('Extracting ZIP with adm-zip (pure JS)...');
//     try {
//       const zip = new AdmZip(zipPath);
//       zip.extractAllTo(extractTo, true);
//       console.log('✅ Extraction complete');
//     } catch (extractError) {
//       console.error('Extraction failed:', extractError);
//       throw new Error(`Failed to extract ZIP: ${extractError.message}`);
//     }
    
//     const entries = await fsPromises.readdir(extractTo);
//     let root = extractTo;
    
//     if (entries.length === 1) {
//       const singleEntry = path.join(extractTo, entries[0]);
//       const stat = await fsPromises.stat(singleEntry);
//       if (stat.isDirectory()) {
//         root = singleEntry;
//         // root directory found
//       }
//     }
    
//     console.log('Copying files...');
//     const copied = await copyEssentialFiles(root, process.cwd());
    
//     console.log('Restoring preserved files...');
//     await restorePreservedFiles(preserveDir);
    
//     console.log('Cleaning up...');
//     await fsPromises.rm(tmpDir, { recursive: true, force: true });
    
//     return {
//       success: true,
//       copiedFiles: copied,
//       url: zipUrl,
//       fileCount: copied.length
//     };
    
//   } catch (error) {
//     console.error('ZIP update failed:', error);
    
//     // Cleanup temp dir on error
//     try {
//       if (fs.existsSync(tmpDir)) {
//         await fsPromises.rm(tmpDir, { recursive: true, force: true });
//       }
//     } catch (cleanupError) {
//       console.warn('Failed to cleanup temp dir:', cleanupError);
//     }
    
//     throw error;
//   }
// }

// /* -------------------- Selective File Copy -------------------- */
// async function copyEssentialFiles(src, dest) {
//   const copied = [];
//   const ignorePatterns = [
//     /^node_modules$/,
//     /^\.git$/,
//     /^tmp/,
//     /^temp/,
//     /^logs$/,
//     /^session$/,
//     /^data$/,
//     /^tmp_.*$/,
//     /^\.env$/,
//     /^settings\.js$/,
//     /^config\.json$/,
//     /^baileys_store\.json$/,
//     /^bot_name\.json$/,
//     /^bot_settings\.json$/,
//     /package-lock\.json$/,
//     /yarn\.lock$/,
//     /\.log$/,
//     /\.cache$/
//   ];
  
//   async function copyDir(srcPath, destPath, relative = '') {
//     try {
//       const entries = await fsPromises.readdir(srcPath, { withFileTypes: true });
      
//       for (const entry of entries) {
//         if (ignorePatterns.some(pattern => pattern.test(entry.name))) {
//           continue;
//         }
        
//         const entrySrc = path.join(srcPath, entry.name);
//         const entryDest = path.join(destPath, entry.name);
//         const entryRelative = relative ? path.join(relative, entry.name) : entry.name;
        
//         if (entry.isDirectory()) {
//           await fsPromises.mkdir(entryDest, { recursive: true });
//           await copyDir(entrySrc, entryDest, entryRelative);
//         } else {
//           let shouldCopy = true;
//           try {
//             const srcStat = await fsPromises.stat(entrySrc);
//             const destStat = await fsPromises.stat(entryDest);
//             shouldCopy = srcStat.mtimeMs > destStat.mtimeMs;
//           } catch {
//             shouldCopy = true;
//           }
          
//           if (shouldCopy) {
//             await fsPromises.copyFile(entrySrc, entryDest);
//             copied.push(entryRelative);
            
//             if (copied.length % 10 === 0) {
//               console.log(`Copied ${copied.length} files...`);
//             }
//           }
//         }
//       }
//     } catch (error) {
//       console.warn(`Error copying from ${srcPath}:`, error.message);
//     }
//   }
  
//   await copyDir(src, dest);
//   return copied;
// }

// /* -------------------- Restore Preserved Files -------------------- */
// async function restorePreservedFiles(preserveDir) {
//   if (!fs.existsSync(preserveDir)) return;
  
//   try {
//     const entries = await fsPromises.readdir(preserveDir, { withFileTypes: true });
    
//     for (const entry of entries) {
//       const srcPath = path.join(preserveDir, entry.name);
//       const destPath = path.join(process.cwd(), entry.name);
//       const destDir = path.dirname(destPath);
      
//       await fsPromises.mkdir(destDir, { recursive: true });
      
//       if (entry.isDirectory()) {
//         await copyDirectoryFast(srcPath, destPath);
//       } else {
//         await fsPromises.copyFile(srcPath, destPath);
//       }
//       console.log(`Restored: ${entry.name}`);
//     }
    
//     await fsPromises.rm(preserveDir, { recursive: true, force: true });
//   } catch (error) {
//     console.warn('Failed to restore preserved files:', error.message);
//   }
// }

// /* -------------------- Main Command -------------------- */
// export default {
//   name: "update",
//   description: "Update bot from n7 repository with automatic history cleaning",
//   category: "owner",
//   ownerOnly: true,

//   async execute(sock, m, args) {
//     const jid = m.key.remoteJid;
//     const sender = m.key.participant || m.key.remoteJid;
    
//     // Check if owner
//     const isOwner = m.key.fromMe || sender.includes("947") || sender.includes("owner-number");
//     if (!isOwner) {
//       return sock.sendMessage(jid, {
//         text: '❌ Only bot owner can use .update command'
//       }, { quoted: m });
//     }
    
//     let statusMessage;
//     try {
//       statusMessage = await sock.sendMessage(jid, {
//         text: `🔄 **${getBotName()} Update v1.1.5**\nWith automatic history cleaning\nStarting update process...`
//       }, { quoted: m });
      
//       const editStatus = async (text) => {
//         try {
//           await sock.sendMessage(jid, {
//             text,
//             edit: statusMessage.key
//           });
//         } catch {
//           const newMsg = await sock.sendMessage(jid, { text }, { quoted: m });
//           statusMessage = newMsg;
//         }
//       };
      
//       await editStatus('🔄 **Analyzing update options...**');
      
//       // Validate token first
//       const tokenValid = await validateToken();
//       if (!tokenValid) {
//         await editStatus('⚠️ **GitHub token validation failed**\nUpdate may not work. Check token.');
//       }
      
//       // Parse arguments
//       const forceMethod = args[0]?.toLowerCase();
//       const useZip = forceMethod === 'zip';
//       const useGit = forceMethod === 'git';
//       const softUpdate = args.includes('soft') || args.includes('no-restart');
//       const hotReload = args.includes('hot') || args.includes('reload');
//       const cleanHistory = args.includes('clean') || args.includes('fresh') || args.includes('reset');
//       const deepClean = args.includes('deep') || args.includes('nuke');
//       const sizeCheck = args.includes('size') || args.includes('check');
      
//       await editStatus('🧹 **Cleaning all media & temp files...**\nSettings & configs will be preserved.');
//       try {
//         const dfOut = await run('df -BM --output=avail . 2>/dev/null || df -m . 2>/dev/null', 5000).catch(() => '');
//         const freeMatch = dfOut.match(/(\d+)M?\s*$/m);
//         const beforeMB = freeMatch ? parseInt(freeMatch[1]) : null;

//         const cleanCmds = [
//           'rm -rf tmp_update_fast tmp_preserve_fast /tmp/*.zip /tmp/*.tar.gz 2>/dev/null',
//           'rm -rf ./data/viewonce_private/* 2>/dev/null',
//           'rm -rf ./data/viewonce_messages/*.jpg ./data/viewonce_messages/*.jpeg ./data/viewonce_messages/*.png ./data/viewonce_messages/*.gif ./data/viewonce_messages/*.mp4 ./data/viewonce_messages/*.mp3 ./data/viewonce_messages/*.ogg ./data/viewonce_messages/*.webp ./data/viewonce_messages/*.opus ./data/viewonce_messages/*.pdf ./data/viewonce_messages/*.doc 2>/dev/null',
//           'rm -rf ./data/antidelete/media/* 2>/dev/null',
//           'rm -rf ./data/antidelete/status/media/* 2>/dev/null',
//           'rm -rf ./data/antiviewonce/*.jpg ./data/antiviewonce/*.jpeg ./data/antiviewonce/*.png ./data/antiviewonce/*.gif ./data/antiviewonce/*.mp4 ./data/antiviewonce/*.mp3 ./data/antiviewonce/*.ogg ./data/antiviewonce/*.webp ./data/antiviewonce/*.opus 2>/dev/null',
//           'find ./session -name "sender-key-*" -delete 2>/dev/null',
//           'find ./session -name "pre-key-*" -delete 2>/dev/null',
//           'find ./session -name "app-state-sync-version-*" -delete 2>/dev/null',
//           'rm -rf session_backup 2>/dev/null',
//           'find ./data -name "*.bak" -delete 2>/dev/null',
//           'find . -maxdepth 2 -name "*.log" -not -path "./node_modules/*" -delete 2>/dev/null',
//           'rm -rf ./temp/* 2>/dev/null',
//           'rm -rf ./logs/* 2>/dev/null',
//           'git gc --prune=now --aggressive 2>/dev/null || true',
//           'npm cache clean --force 2>/dev/null || true'
//         ];
//         for (const cmd of cleanCmds) {
//           await run(cmd, 15000).catch(() => {});
//         }
//         const dfAfter = await run('df -BM --output=avail . 2>/dev/null || df -m . 2>/dev/null', 5000).catch(() => '');
//         const afterMatch = dfAfter.match(/(\d+)M?\s*$/m);
//         const afterMB = afterMatch ? parseInt(afterMatch[1]) : beforeMB;
//         const recovered = (beforeMB !== null && afterMB !== null) ? (afterMB - beforeMB) : 0;
//         await editStatus(`💾 **Media cleanup done!** ${afterMB !== null ? afterMB + 'MB free' : ''}${recovered > 0 ? ' (recovered ' + recovered + 'MB)' : ''}\n✅ Settings, prefix, configs preserved\nContinuing update...`);
//         if (afterMB !== null && afterMB < 30) {
//           await editStatus(`❌ **Not enough disk space for update**\nOnly ${afterMB}MB free after cleanup.\nManually delete large files or increase disk allocation.`);
//           return;
//         }
//       } catch (diskErr) {
//         // Non-critical, continue with update
//       }
      
//       // If just checking size
//       if (sizeCheck) {
//         try {
//           const sizeInfo = await checkRepoSize();
//           await editStatus(`📊 **Repository Size Report**\n\nSize: ${sizeInfo.sizeMB} MB\nObjects: ${sizeInfo.objects}\nPacks: ${sizeInfo.packs}\n\nUse \`.update clean\` to optimize size`);
//           return;
//         } catch (error) {
//           await editStatus(`❌ **Could not check size**\nError: ${error.message}`);
//           return;
//         }
//       }
      
//       // If just cleaning history
//       if (cleanHistory && !useZip && !useGit) {
//         await editStatus('🧹 **Starting history cleanup...**\nThis will remove all Git history while keeping branches.');
        
//         try {
//           const result = await deepCleanGitHistory({
//             preserveBranches: true,
//             maxHistoryDepth: deepClean ? 5 : 10
//           });
          
//           await editStatus(`✅ **History Cleanup Complete!**\n\n• New size: ${result.newSize} MB\n• Branches preserved: ${result.branchesPreserved}\n• Original commit: ${result.originalCommit}\n\nRepository optimized! 🎉`);
//           return;
//         } catch (error) {
//           await editStatus(`❌ **Cleanup failed:** ${error.message}`);
//           return;
//         }
//       }
      
//       let result;
      
//       if (useGit || (!useZip && await hasGitRepo())) {
//         await editStatus('🌐 **Smart Git Update**\nWith automatic size optimization...');
//         result = await smartGitUpdate({
//           autoCleanHistory: cleanHistory || deepClean,
//           cleanThresholdMB: deepClean ? 50 : 100,
//           maxHistoryDepth: deepClean ? 5 : 20
//         });
        
//         if (result.alreadyUpToDate) {
//           await editStatus(`✅ **Already Up to Date**\nBranch: ${result.branch}\nCommit: ${result.newRev?.slice(0, 7) || 'N/A'}\nSize: ${result.sizeAfter || 'unknown'} MB`);
          
//           // Clean history even if up to date if requested
//           if (cleanHistory) {
//             await editStatus('🧹 **Cleaning history as requested...**');
//             const cleanResult = await deepCleanGitHistory();
//             await editStatus(`✅ **History cleaned!**\nNew size: ${cleanResult.newSize} MB\nReduction: ${cleanResult.reduction} MB`);
//           } else if (hotReload) {
//             await editStatus('🔄 **Hot reloading commands...**');
//             const reloadResult = await hotReloadCommands();
//             await editStatus(`✅ **Hot reload complete**\nReloaded: ${reloadResult.reloaded} commands\nErrors: ${reloadResult.errors}`);
//           }
//           return;
//         }
        
//         const sizeMsg = result.historyCleaned ? 
//           `(Cleaned: ${result.reduction || '0'} MB saved)` : 
//           `(${result.sizeDiff >= 0 ? '+' : ''}${result.sizeDiff} MB)`;
        
//         await editStatus(`✅ **Git Update Complete**\nUpdated to: ${result.newRev?.slice(0, 7) || 'N/A'}\nSize: ${result.sizeAfter} MB ${sizeMsg}\nInstalling dependencies...`);
        
//       } else {
//         await editStatus('📥 **Using ZIP update method (pure JS)**\nWorks on all platforms...');
//         result = await updateViaZip();
        
//         await editStatus(`✅ **ZIP Update Complete**\nFiles updated: ${result.fileCount || 0}\nInstalling dependencies...`);
//       }
      
//       // Install dependencies (skip if soft update)
//       if (!softUpdate) {
//         await editStatus('📦 **Installing dependencies...**');
        
//         try {
//           await run('npm ci --no-audit --no-fund --silent', 180000);
//           await editStatus('✅ **Dependencies installed**');
//         } catch (npmError) {
//           console.warn('npm install failed, trying fallback:', npmError.message);
//           try {
//             await run('npm install --no-audit --no-fund --loglevel=error', 180000);
//             await editStatus('⚠️ **Dependencies installed with warnings**');
//           } catch {
//             await editStatus('⚠️ **Could not install all dependencies**\nContinuing anyway...');
//           }
//         }
//       }
      
//       // Try hot reload first if requested
//       if (hotReload || softUpdate) {
//         try {
//           await editStatus('🔄 **Attempting hot reload...**');
//           const reloadResult = await hotReloadCommands();
          
//           if (reloadResult.reloaded > 0) {
//             await editStatus(`✅ **Hot reload successful!**\nReloaded: ${reloadResult.reloaded} commands\nErrors: ${reloadResult.errors}\n\nBot updated without restart! 🎉`);
//           } else if (reloadResult.errors > 0) {
//             await editStatus(`⚠️ **Hot reload had issues**\nReloaded: ${reloadResult.reloaded} commands\nErrors: ${reloadResult.errors}\n\nConsider restarting for full update.`);
//           } else {
//             await editStatus('✅ **Update Applied Successfully**\nRunning without restart.\nSome changes may need restart to take effect.');
//           }
          
//         } catch (reloadError) {
//           console.error('Hot reload failed:', reloadError);
//           await editStatus('⚠️ **Hot reload failed**\nFalling back to normal update...');
          
//           await editStatus('✅ **Update Complete!**\nRestarting bot in 3 seconds...');
          
//           await new Promise(resolve => setTimeout(resolve, 3000));
          
//           await sock.sendMessage(jid, {
//             text: '🔄 **Restarting Now...**\nBot will be back in a moment!'
//           }, { quoted: m });
          
//           try {
//             await run('pm2 restart all', 10000);
//           } catch {
//             console.log('PM2 restart failed, exiting process...');
//             process.exit(0);
//           }
//         }
//       } else {
//         // Normal restart
//         await editStatus('✅ **Update Complete!**\nRestarting bot in 3 seconds...');
        
//         await new Promise(resolve => setTimeout(resolve, 3000));
        
//         await sock.sendMessage(jid, {
//           text: '🔄 **Restarting Now...**\nBot will be back in a moment!'
//         }, { quoted: m });
        
//         try {
//           await run('pm2 restart all', 10000);
//         } catch {
//           console.log('PM2 restart failed, exiting process...');
//           process.exit(0);
//         }
//       }
      
//     } catch (err) {
//       console.error('Update failed:', err);
      
//       let errorText = `❌ **Update Failed**\nError: ${err.message || err}\n\n`;
      
//       if (err.message.includes('timeout')) {
//         errorText += '**Reason:** Operation timed out\n';
//         errorText += '**Solution:** Try again with better internet connection\n';
//       } else if (err.message.includes('401') || err.message.includes('403') || err.message.includes('token')) {
//         errorText += '**Reason:** GitHub token invalid or expired\n';
//         errorText += '**Solution:** Check token in .env file\n';
//       } else if (err.message.includes('HTTP')) {
//         errorText += '**Reason:** Download failed\n';
//         errorText += '**Solution:** Check internet or try .update git\n';
//       } else if (err.message.includes('Git')) {
//         errorText += '**Reason:** Git operation failed\n';
//         errorText += '**Solution:** Try .update zip instead (now uses pure JS)\n';
//       } else if (err.message.includes('clean')) {
//         errorText += '**Reason:** History cleanup failed\n';
//         errorText += '**Solution:** Try without clean option first\n';
//       }
      
//       errorText += '\n**Available Options:**\n';
//       errorText += '`.update` - Smart update with auto-clean\n';
//       errorText += '`.update clean` - Clean history only\n';
//       errorText += '`.update deep` - Deep clean + update\n';
//       errorText += '`.update git hot` - Git update + hot reload\n';
//       errorText += '`.update size` - Check repository size\n';
//       errorText += '`.update zip` - ZIP update (pure JS - works everywhere)\n';
//       errorText += '`.update soft` - Update without restart\n';
      
//       try {
//         if (statusMessage?.key) {
//           await sock.sendMessage(jid, { text: errorText, edit: statusMessage.key });
//         } else {
//           await sock.sendMessage(jid, { text: errorText }, { quoted: m });
//         }
//       } catch {
//         // Ignore if can't send error
//       }
//     }
//   }
// };





























import { exec } from "child_process";
import { getBotName } from '../../lib/botname.js';
import { promisify } from "util";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";
import { createRequire } from 'module';
import { createWriteStream } from "fs";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

/* -------------------- Configuration -------------------- */
const UPDATE_ZIP_URL = Buffer.from('aHR0cHM6Ly9naXRodWIuY29tL3BlYWNlLWFtYW5pL2stNy9hcmNoaXZlL3JlZnMvaGVhZHMvbWFpbi56aXA=', 'base64').toString();
const GIT_REPO_URL = Buffer.from('aHR0cHM6Ly9naXRodWIuY29tL3BlYWNlLWFtYW5pL2stNy5naXQ=', 'base64').toString();
const OWNER_REPO_URL = "https://github.com/peace-amani/k-7.git";

// Timeout configurations
const DOWNLOAD_TIMEOUT = 120000;
const EXTRACTION_TIMEOUT = 180000;
const COPY_TIMEOUT = 300000;
const PRESERVE_TIMEOUT = 30000;
const GIT_CLEAN_TIMEOUT = 60000;

// Cache for hot-reloaded modules
const moduleCache = new Map();
const commandCache = new Map();

/* -------------------- Enhanced Helpers -------------------- */
async function run(cmd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || stdout || err.message));
      resolve(stdout.toString().trim());
    });
  });
}

async function hasGitRepo() {
  const gitDir = path.join(process.cwd(), '.git');
  if (!fs.existsSync(gitDir)) return false;
  try {
    await run('git --version');
    return true;
  } catch {
    return false;
  }
}

/* -------------------- Repository Size Monitor -------------------- */
async function checkRepoSize() {
  try {
    const countOutput = await run('git count-objects -v');
    const lines = countOutput.split('\n');
    const sizeData = {};
    
    lines.forEach(line => {
      const [key, value] = line.split(': ');
      sizeData[key] = parseInt(value) || value;
    });
    
    const packSizeKB = sizeData['size-pack'] || 0;
    const sizeMB = (packSizeKB / 1024).toFixed(2);
    
    return {
      sizeKB: packSizeKB,
      sizeMB: sizeMB,
      objects: sizeData['in-pack'] || 0,
      packs: sizeData['packs'] || 0
    };
  } catch (error) {
    // (suppressed)
    return { sizeMB: 'unknown', objects: 0 };
  }
}

/* -------------------- Deep Git History Cleaner -------------------- */
async function deepCleanGitHistory(options = {}) {
  // (suppressed)
  
  const {
    preserveBranches = true,
    maxHistoryDepth = 10,
    keepRecentCommits = 50
  } = options;
  
  try {
    // Get current state
    const currentBranch = await run('git rev-parse --abbrev-ref HEAD').catch(() => 'main');
    const currentCommit = await run('git rev-parse HEAD');
    
    // List all branches
    const branchesOutput = await run('git branch -a');
    const branches = branchesOutput.split('\n')
      .map(b => b.trim())
      .filter(b => b && !b.includes('detached') && !b.includes('->'))
      .map(b => b.replace('* ', '').replace('remotes/', ''));
    
    // (suppressed)
    
    // Preserve essential files
    const { preserveDir, preserved } = await preserveEssentialFiles();
    // (suppressed)
    
    // Create a temporary directory for fresh start
    const tempDir = path.join(process.cwd(), 'tmp_git_fresh');
    if (fs.existsSync(tempDir)) {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
    await fsPromises.mkdir(tempDir, { recursive: true });
    
    // Copy only essential files to temp directory
    const essentialFiles = await getEssentialFiles();
    for (const file of essentialFiles) {
      const srcPath = path.join(process.cwd(), file);
      const destPath = path.join(tempDir, file);
      
      if (fs.existsSync(srcPath)) {
        const destDir = path.dirname(destPath);
        await fsPromises.mkdir(destDir, { recursive: true });
        await fsPromises.copyFile(srcPath, destPath);
      }
    }
    
    // Backup .git folder (just in case)
    const gitBackup = path.join(process.cwd(), '.git_backup_' + Date.now());
    if (fs.existsSync(path.join(process.cwd(), '.git'))) {
      try {
        await fsPromises.rename(path.join(process.cwd(), '.git'), gitBackup);
      } catch {
        // (suppressed)
      }
    }
    
    // Remove old .git completely
    try {
      await fsPromises.rm(path.join(process.cwd(), '.git'), { recursive: true, force: true });
    } catch (error) {
      // (suppressed)
    }
    
    // Initialize fresh repository
    // (suppressed)
    await run('git init');
    await run('git config user.email "bot@silentwolf.com"');
    await run('git config user.name "SilentWolf Bot"');
    
    // Copy files back from temp directory
    // (suppressed)
    const copyResult = await copyDirectoryContents(tempDir, process.cwd());
    
    // Add and commit
    await run('git add .');
    await run(`git commit -m "🚀 Fresh repository - optimized size\n\n• Cleared all history\n• Preserved ${preserved.length} essential items\n• Maintained branch: ${currentBranch}\n• Timestamp: ${new Date().toISOString()}"`);
    
    // Create main branch
    await run(`git branch -M ${currentBranch}`);
    
    // Create other branches if preserving branches
    if (preserveBranches && branches.length > 1) {
      for (const branch of branches) {
        if (branch !== currentBranch && !branch.includes('origin/')) {
          try {
            await run(`git checkout -b ${branch} ${currentBranch}`);
            // (suppressed)
          } catch {
            // (suppressed)
          }
        }
      }
      // Return to original branch
      await run(`git checkout ${currentBranch}`);
    }
    
    // Restore preserved files
    await restorePreservedFiles(preserveDir);
    
    // Cleanup
    await fsPromises.rm(tempDir, { recursive: true, force: true });
    
    // Optional: Remove old git backup after some time
    setTimeout(async () => {
      try {
        if (fs.existsSync(gitBackup)) {
          await fsPromises.rm(gitBackup, { recursive: true, force: true });
        }
      } catch {}
    }, 60000); // Delete backup after 1 minute
    
    const newSize = await checkRepoSize();
    // (suppressed)
    
    return {
      success: true,
      originalCommit: currentCommit.slice(0, 7),
      originalBranch: currentBranch,
      newSize: newSize.sizeMB,
      branchesPreserved: preserveBranches ? branches.length : 1,
      filesRestored: copyResult.filesCount
    };
    
  } catch (error) {
    // (suppressed)
    
    // Try to restore from backup
    try {
      if (fs.existsSync(path.join(process.cwd(), '.git_backup'))) {
        await fsPromises.rm(path.join(process.cwd(), '.git'), { recursive: true, force: true });
        await fsPromises.rename(path.join(process.cwd(), '.git_backup'), path.join(process.cwd(), '.git'));
        // (suppressed)
      }
    } catch {}
    
    throw error;
  }
}

/* -------------------- Get Essential Files List -------------------- */
async function getEssentialFiles() {
  const ignorePatterns = [
    /^\.git($|\/)/,
    /^node_modules($|\/)/,
    /^tmp($|\/)/,
    /^temp($|\/)/,
    /^logs($|\/)/,
    /^\.env$/,
    /^\.env\..*$/,
    /^\.backup/,
    /^backup-/,
    /\.log$/,
    /\.cache$/,
    /^session($|\/)/,
    /^baileys_store\.json$/,
    /^settings\.js$/,
    /^config\.json$/,
    /^package-lock\.json$/,
    /^yarn\.lock$/,
    /^pnpm-lock\.yaml$/,
    /\.DS_Store$/,
    /Thumbs\.db$/,
    /desktop\.ini$/,
    /^dist($|\/)/,
    /^build($|\/)/,
    /^coverage($|\/)/,
    /\.tmp($|\/)/,
    /\.temp($|\/)/,
    /\.history($|\/)/,
    /\.vscode($|\/)/,
    /\.idea($|\/)/
  ];
  
  const essentialExtensions = [
    '.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt',
    '.yml', '.yaml', '.xml', '.html', '.css', '.scss',
    '.py', '.php', '.java', '.cpp', '.c', '.go', '.rs',
    '.sql', '.sh', '.bat', '.ps1', '.env.example'
  ];
  
  async function scanDir(dir, relative = '') {
    const files = [];
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = relative ? path.join(relative, entry.name) : entry.name;
        
        // Skip ignored patterns
        if (ignorePatterns.some(pattern => pattern.test(entry.name) || pattern.test(relPath))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          const subFiles = await scanDir(fullPath, relPath);
          files.push(...subFiles);
        } else {
          // Check if file has essential extension
          const ext = path.extname(entry.name).toLowerCase();
          if (essentialExtensions.includes(ext) || entry.name.startsWith('.')) {
            files.push(relPath);
          }
        }
      }
    } catch (error) {
      // (suppressed)
    }
    
    return files;
  }
  
  return await scanDir(process.cwd());
}

/* -------------------- Copy Directory Contents -------------------- */
async function copyDirectoryContents(src, dest) {
  let filesCount = 0;
  
  async function copyRecursive(srcPath, destPath) {
    await fsPromises.mkdir(destPath, { recursive: true });
    
    const entries = await fsPromises.readdir(srcPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcEntry = path.join(srcPath, entry.name);
      const destEntry = path.join(destPath, entry.name);
      
      if (entry.isDirectory()) {
        await copyRecursive(srcEntry, destEntry);
      } else {
        await fsPromises.copyFile(srcEntry, destEntry);
        filesCount++;
        
        if (filesCount % 50 === 0) {
          // (suppressed)
        }
      }
    }
  }
  
  await copyRecursive(src, dest);
  return { filesCount };
}

/* -------------------- Smart Git Update with Auto-Clean -------------------- */
async function smartGitUpdate(options = {}) {
  const {
    autoCleanHistory = true,
    cleanThresholdMB = 100,
    maxHistoryDepth = 20,
    preserveEssential = true
  } = options;
  
  // (suppressed)
  
  try {
    // Check repo size before update
    const sizeBefore = await checkRepoSize();
    // (suppressed)
    
    // Check if we need to clean based on threshold
    const shouldClean = autoCleanHistory && parseFloat(sizeBefore.sizeMB) > cleanThresholdMB;
    
    if (shouldClean) {
      // (suppressed)
      await deepCleanGitHistory({
        preserveBranches: true,
        maxHistoryDepth: maxHistoryDepth
      });
    }
    
    // Perform the update
    const updateResult = await updateViaGit();
    
    // Check size after update
    const sizeAfter = await checkRepoSize();
    
    // If still too large or grew significantly, do another cleanup
    if (autoCleanHistory && (parseFloat(sizeAfter.sizeMB) > cleanThresholdMB || 
        (parseFloat(sizeAfter.sizeMB) - parseFloat(sizeBefore.sizeMB) > 50))) {
      // (suppressed)
      await deepCleanGitHistory({
        preserveBranches: true,
        maxHistoryDepth: 10
      });
      
      const finalSize = await checkRepoSize();
      // (suppressed)
      
      return {
        ...updateResult,
        historyCleaned: true,
        initialSize: sizeBefore.sizeMB,
        finalSize: finalSize.sizeMB,
        reduction: (parseFloat(sizeBefore.sizeMB) - parseFloat(finalSize.sizeMB)).toFixed(2)
      };
    }
    
    return {
      ...updateResult,
      historyCleaned: shouldClean,
      sizeBefore: sizeBefore.sizeMB,
      sizeAfter: sizeAfter.sizeMB
    };
    
  } catch (error) {
    // (suppressed)
    throw error;
  }
}

/* -------------------- Git Update (Modified with Clean Option) -------------------- */
async function updateViaGit(cleanAfter = false) {
  try {
    // (suppressed)
    
    try {
      await run('git --version');
    } catch {
      throw new Error('Git is not installed or not in PATH');
    }
    
    const sizeBefore = await checkRepoSize();
    // (suppressed)
    
    const oldRev = await run('git rev-parse HEAD').catch(() => 'unknown');
    // (suppressed)
    
    // (suppressed)
    await run('git prune --expire=now').catch(() => {});
    await run('git gc --auto').catch(() => {});
    
    try {
      await run('git remote get-url bot-upstream');
      // existing upstream remote confirmed
    } catch {
      // adding upstream remote
      await run(`git remote add bot-upstream ${GIT_REPO_URL}`);
    }
    
    // (suppressed)
    await run('git fetch bot-upstream --depth=20 --prune');
    
    const currentBranch = await run('git rev-parse --abbrev-ref HEAD').catch(() => 'main');
    
    let newRev;
    try {
      newRev = await run(`git rev-parse bot-upstream/${currentBranch}`);
    } catch {
      newRev = await run('git rev-parse bot-upstream/main');
    }
    
    if (oldRev === newRev) {
      // (suppressed)
      await run('git gc --auto').catch(() => {});
      
      // Optionally clean even if up to date
      if (cleanAfter) {
        // (suppressed)
        await deepCleanGitHistory();
      }
      
      return {
        oldRev,
        newRev,
        alreadyUpToDate: true,
        branch: currentBranch,
        files: []
      };
    }
    
    // (suppressed)
    
    const timestamp = Date.now();
    const backupBranch = `backup-${timestamp}`;
    await run(`git branch ${backupBranch}`).catch(() => {
      // (suppressed)
    });
    
    await run(`git merge --ff-only ${newRev}`);
    
    // (suppressed)
    await run('git prune --expire=now').catch(() => {});
    await run('git gc --aggressive --prune=now').catch(() => {});
    
    const sizeAfter = await checkRepoSize();
    const sizeDiff = (parseFloat(sizeAfter.sizeMB) - parseFloat(sizeBefore.sizeMB)).toFixed(2);
    
    // (suppressed)
    
    // Perform deep clean if requested
    if (cleanAfter) {
      // (suppressed)
      await deepCleanGitHistory();
      const finalSize = await checkRepoSize();
      // (suppressed)
    }
    
    return {
      oldRev,
      newRev,
      alreadyUpToDate: false,
      branch: currentBranch,
      backupBranch,
      files: [],
      sizeBefore: sizeBefore.sizeMB,
      sizeAfter: sizeAfter.sizeMB,
      sizeDiff: sizeDiff,
      cleaned: cleanAfter
    };
    
  } catch (error) {
    // (suppressed)
    
    try {
      const branches = await run('git branch --list backup-*');
      if (branches) {
        const backupList = branches.split('\n').filter(b => b.trim());
        if (backupList.length > 0) {
          const latestBackup = backupList[backupList.length - 1].trim();
          // (suppressed)
          await run(`git reset --hard ${latestBackup}`);
        }
      }
    } catch (revertError) {
      // (suppressed)
    }
    
    throw error;
  }
}

/* -------------------- Async Download with Progress -------------------- */
async function downloadWithProgress(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https://') ? https : http;
    
    const req = client.get(url, {
      headers: {
        'User-Agent': 'WolfBot-Updater/3.0',
        'Accept': '*/*'
      },
      timeout: DOWNLOAD_TIMEOUT
    }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location;
        res.resume();
        return downloadWithProgress(new URL(redirectUrl, url).toString(), dest, onProgress)
          .then(resolve)
          .catch(reject);
      }
      
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      
      const totalSize = parseInt(res.headers['content-length']) || 0;
      let downloaded = 0;
      const fileStream = createWriteStream(dest);
      
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && totalSize > 0) {
          const percent = Math.round((downloaded / totalSize) * 100);
          onProgress(percent, downloaded, totalSize);
        }
      });
      
      res.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      
      fileStream.on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    });
    
    req.on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
    
    req.on('timeout', () => {
      req.destroy();
      fs.unlink(dest, () => reject(new Error('Download timeout')));
    });
  });
}

/* -------------------- Hot Reload Functions -------------------- */
async function clearModuleCache(modulePath) {
  const normalizedPath = path.resolve(modulePath);
  
  for (const key in require.cache) {
    if (key.includes(normalizedPath) || key.includes(modulePath)) {
      delete require.cache[key];
    }
  }
  
  for (const [key, value] of moduleCache.entries()) {
    if (key.includes(normalizedPath) || key.includes(modulePath)) {
      moduleCache.delete(key);
    }
  }
}

async function hotReloadCommands(commandDir = 'commands') {
  const commandsPath = path.join(process.cwd(), commandDir);
  if (!fs.existsSync(commandsPath)) {
    // (suppressed)
    return { reloaded: 0, errors: 0 };
  }
  
  let reloaded = 0;
  let errors = 0;
  
  try {
    const files = await fsPromises.readdir(commandsPath, { withFileTypes: true });
    
    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.js')) {
        const filePath = path.join(commandsPath, file.name);
        try {
          await clearModuleCache(filePath);
          
          const moduleUrl = `file://${filePath}`;
          const module = await import(moduleUrl);
          
          if (module.default) {
            const commandName = module.default.name || file.name.replace('.js', '');
            commandCache.set(commandName, module.default);
            reloaded++;
            // (suppressed)
          }
        } catch (error) {
          // (suppressed)
          errors++;
        }
      } else if (file.isDirectory()) {
        const subDir = path.join(commandsPath, file.name);
        const subFiles = await fsPromises.readdir(subDir, { withFileTypes: true });
        
        for (const subFile of subFiles) {
          if (subFile.isFile() && subFile.name.endsWith('.js')) {
            const filePath = path.join(subDir, subFile.name);
            try {
              await clearModuleCache(filePath);
              
              const moduleUrl = `file://${filePath}`;
              const module = await import(moduleUrl);
              
              if (module.default) {
                const commandName = module.default.name || subFile.name.replace('.js', '');
                commandCache.set(commandName, module.default);
                reloaded++;
                // (suppressed)
              }
            } catch (error) {
              // (suppressed)
              errors++;
            }
          }
        }
      }
    }
    
    // (suppressed)
    return { reloaded, errors };
    
  } catch (error) {
    // (suppressed)
    return { reloaded: 0, errors: 1 };
  }
}

/* -------------------- Fast Preserve Files -------------------- */
async function preserveEssentialFiles() {
  // (suppressed)
  
  const essentialFiles = [
    'settings.js',
    'config.json',
    '.env',
    'baileys_store.json',
    '.env.example',
    'package.json',
    'bot_name.json',
    'bot_settings.json'
  ];
  
  const essentialDirs = [
    'session',
    'data',
    'logs',
    'assets',
    'lib'
  ];
  
  const preserveDir = path.join(process.cwd(), 'tmp_preserve_fast_' + Date.now());
  if (fs.existsSync(preserveDir)) {
    await fsPromises.rm(preserveDir, { recursive: true, force: true });
  }
  await fsPromises.mkdir(preserveDir, { recursive: true });
  
  const preserved = [];
  
  for (const file of essentialFiles) {
    const filePath = path.join(process.cwd(), file);
    try {
      if (fs.existsSync(filePath)) {
        const preservePath = path.join(preserveDir, file);
        const preserveDirPath = path.dirname(preservePath);
        await fsPromises.mkdir(preserveDirPath, { recursive: true });
        await fsPromises.copyFile(filePath, preservePath);
        preserved.push(file);
        // (suppressed)
      }
    } catch (error) {
      // (suppressed)
    }
  }
  
  for (const dir of essentialDirs) {
    const dirPath = path.join(process.cwd(), dir);
    try {
      if (fs.existsSync(dirPath)) {
        const stat = await fsPromises.stat(dirPath);
        if (stat.isDirectory()) {
          const preservePath = path.join(preserveDir, dir);
          await copyDirectoryFast(dirPath, preservePath);
          preserved.push(dir);
          // (suppressed)
        }
      }
    } catch (error) {
      // (suppressed)
    }
  }
  
  return { preserveDir, preserved };
}

/* -------------------- Fast Directory Copy -------------------- */
async function copyDirectoryFast(src, dest, timeout = PRESERVE_TIMEOUT) {
  await fsPromises.mkdir(dest, { recursive: true });
  
  const entries = await fsPromises.readdir(src, { withFileTypes: true });
  const copyPromises = [];
  
  for (const entry of entries) {
    if (copyPromises.length > 10) {
      await Promise.all(copyPromises);
      copyPromises.length = 0;
    }
    
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyPromises.push(copyDirectoryFast(srcPath, destPath, timeout));
    } else {
      copyPromises.push(
        Promise.race([
          fsPromises.copyFile(srcPath, destPath),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Copy timeout')), timeout)
          )
        ]).catch(error => {
          // (suppressed)
        })
      );
    }
  }
  
  if (copyPromises.length > 0) {
    await Promise.all(copyPromises);
  }
}

/* -------------------- ZIP Update -------------------- */
async function updateViaZip(zipUrl = UPDATE_ZIP_URL) {
  // (suppressed)
  
  const tmpDir = path.join(process.cwd(), 'tmp_update_fast_' + Date.now());
  const zipPath = path.join(tmpDir, 'update.zip');
  const extractTo = path.join(tmpDir, 'extracted');
  
  try {
    if (fs.existsSync(tmpDir)) {
      await fsPromises.rm(tmpDir, { recursive: true, force: true });
    }
    await fsPromises.mkdir(tmpDir, { recursive: true });
    await fsPromises.mkdir(extractTo, { recursive: true });
    
    const { preserveDir, preserved } = await preserveEssentialFiles();
    // (suppressed)
    
    // (suppressed)
    let lastProgress = 0;
    
    await downloadWithProgress(zipUrl, zipPath, (percent, downloaded, total) => {
      if (percent >= lastProgress + 10 || percent === 100) {
        // (suppressed)
        lastProgress = percent;
      }
    });
    
    const stat = await fsPromises.stat(zipPath);
    if (stat.size === 0) {
      throw new Error('Downloaded file is empty');
    }
    // (suppressed)
    
    // (suppressed)
    await Promise.race([
      extractZip(zipPath, extractTo),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Extraction timeout')), EXTRACTION_TIMEOUT)
      )
    ]);
    
    const entries = await fsPromises.readdir(extractTo);
    let root = extractTo;
    
    if (entries.length === 1) {
      const singleEntry = path.join(extractTo, entries[0]);
      const stat = await fsPromises.stat(singleEntry);
      if (stat.isDirectory()) {
        root = singleEntry;
        // root directory found
      }
    }
    
    // (suppressed)
    const copied = await copyEssentialFiles(root, process.cwd());
    
    // (suppressed)
    await restorePreservedFiles(preserveDir);
    
    // (suppressed)
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
    
    return {
      success: true,
      copiedFiles: copied,
      url: zipUrl,
      fileCount: copied.length
    };
    
  } catch (error) {
    // (suppressed)
    
    try {
      if (fs.existsSync(tmpDir)) {
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      // (suppressed)
    }
    
    throw error;
  }
}

/* -------------------- Selective File Copy -------------------- */
async function copyEssentialFiles(src, dest) {
  const copied = [];
  const ignorePatterns = [
    /^node_modules$/,
    /^\.git$/,
    /^tmp/,
    /^temp/,
    /^logs$/,
    /^session$/,
    /^data$/,
    /^tmp_.*$/,
    /^\.env$/,
    /^settings\.js$/,
    /^config\.json$/,
    /^baileys_store\.json$/,
    /^bot_name\.json$/,
    /^bot_settings\.json$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /\.log$/,
    /\.cache$/
  ];
  
  async function copyDir(srcPath, destPath, relative = '') {
    try {
      const entries = await fsPromises.readdir(srcPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (ignorePatterns.some(pattern => pattern.test(entry.name))) {
          continue;
        }
        
        const entrySrc = path.join(srcPath, entry.name);
        const entryDest = path.join(destPath, entry.name);
        const entryRelative = relative ? path.join(relative, entry.name) : entry.name;
        
        if (entry.isDirectory()) {
          await fsPromises.mkdir(entryDest, { recursive: true });
          await copyDir(entrySrc, entryDest, entryRelative);
        } else {
          let shouldCopy = true;
          try {
            const srcStat = await fsPromises.stat(entrySrc);
            const destStat = await fsPromises.stat(entryDest);
            shouldCopy = srcStat.mtimeMs > destStat.mtimeMs;
          } catch {
            shouldCopy = true;
          }
          
          if (shouldCopy) {
            await fsPromises.copyFile(entrySrc, entryDest);
            copied.push(entryRelative);
            
            if (copied.length % 10 === 0) {
              // (suppressed)
            }
          }
        }
      }
    } catch (error) {
      // (suppressed)
    }
  }
  
  await copyDir(src, dest);
  return copied;
}

/* -------------------- Restore Preserved Files -------------------- */
async function restorePreservedFiles(preserveDir) {
  if (!fs.existsSync(preserveDir)) return;
  
  try {
    const entries = await fsPromises.readdir(preserveDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(preserveDir, entry.name);
      const destPath = path.join(process.cwd(), entry.name);
      const destDir = path.dirname(destPath);
      
      await fsPromises.mkdir(destDir, { recursive: true });
      
      if (entry.isDirectory()) {
        await copyDirectoryFast(srcPath, destPath);
      } else {
        await fsPromises.copyFile(srcPath, destPath);
      }
      // (suppressed)
    }
    
    await fsPromises.rm(preserveDir, { recursive: true, force: true });
  } catch (error) {
    // (suppressed)
  }
}

/* -------------------- Extract Zip Utility -------------------- */
async function extractZip(zipPath, outDir) {
  if (process.platform === 'win32') {
    await run(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force"`);
    return;
  }
  
  const tools = [
    { cmd: 'unzip', args: `-o "${zipPath}" -d "${outDir}"` },
    { cmd: '7z', args: `x "${zipPath}" -o"${outDir}" -y` },
    { cmd: 'busybox', args: `unzip "${zipPath}" -d "${outDir}"` },
  ];
  
  for (const tool of tools) {
    try {
      await run(`which ${tool.cmd}`);
      // (suppressed)
      await run(`${tool.cmd} ${tool.args}`);
      return;
    } catch {
      continue;
    }
  }
  
  throw new Error('No extraction tool found');
}

/* -------------------- Main Command -------------------- */
export default {
  name: "update",
  description: "Update bot to the latest version with automatic history cleaning",
  category: "owner",
  ownerOnly: true,

  async execute(sock, m, args) {
    const jid = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    
    // Check if owner
    const isOwner = m.key.fromMe || sender.includes("947") || sender.includes("owner-number");
    if (!isOwner) {
      return sock.sendMessage(jid, {
        text: '❌ Only bot owner can use .update command'
      }, { quoted: m });
    }
    
    let statusMessage;
    try {
      statusMessage = await sock.sendMessage(jid, {
        text: '🔄 **${getBotName()} Update v1.1.5**\nWith automatic history cleaning\nStarting update process...'
      }, { quoted: m });
      
      const editStatus = async (text) => {
        try {
          await sock.sendMessage(jid, {
            text,
            edit: statusMessage.key
          });
        } catch {
          const newMsg = await sock.sendMessage(jid, { text }, { quoted: m });
          statusMessage = newMsg;
        }
      };
      
      await editStatus('🔄 **Analyzing update options...**');
      
      // Parse arguments
      const forceMethod = args[0]?.toLowerCase();
      const useZip = forceMethod === 'zip';
      const useGit = forceMethod === 'git';
      const softUpdate = args.includes('soft') || args.includes('no-restart');
      const hotReload = args.includes('hot') || args.includes('reload');
      const cleanHistory = args.includes('clean') || args.includes('fresh') || args.includes('reset');
      const deepClean = args.includes('deep') || args.includes('nuke');
      const sizeCheck = args.includes('size') || args.includes('check');
      
      await editStatus('🧹 **Cleaning all media & temp files...**\nSettings & configs will be preserved.');
      try {
        const dfOut = await run('df -BM --output=avail . 2>/dev/null || df -m . 2>/dev/null', 5000).catch(() => '');
        const freeMatch = dfOut.match(/(\d+)M?\s*$/m);
        const beforeMB = freeMatch ? parseInt(freeMatch[1]) : null;

        const cleanCmds = [
          'rm -rf tmp_update_fast tmp_preserve_fast /tmp/*.zip /tmp/*.tar.gz 2>/dev/null',
          'rm -rf ./data/viewonce_private/* 2>/dev/null',
          'rm -rf ./data/viewonce_messages/*.jpg ./data/viewonce_messages/*.jpeg ./data/viewonce_messages/*.png ./data/viewonce_messages/*.gif ./data/viewonce_messages/*.mp4 ./data/viewonce_messages/*.mp3 ./data/viewonce_messages/*.ogg ./data/viewonce_messages/*.webp ./data/viewonce_messages/*.opus ./data/viewonce_messages/*.pdf ./data/viewonce_messages/*.doc 2>/dev/null',
          'rm -rf ./data/antidelete/media/* 2>/dev/null',
          'rm -rf ./data/antidelete/status/media/* 2>/dev/null',
          'rm -rf ./data/antiviewonce/*.jpg ./data/antiviewonce/*.jpeg ./data/antiviewonce/*.png ./data/antiviewonce/*.gif ./data/antiviewonce/*.mp4 ./data/antiviewonce/*.mp3 ./data/antiviewonce/*.ogg ./data/antiviewonce/*.webp ./data/antiviewonce/*.opus 2>/dev/null',
          'find ./session -name "sender-key-*" -delete 2>/dev/null',
          'find ./session -name "pre-key-*" -delete 2>/dev/null',
          'find ./session -name "app-state-sync-version-*" -delete 2>/dev/null',
          'rm -rf session_backup 2>/dev/null',
          'find ./data -name "*.bak" -delete 2>/dev/null',
          'find . -maxdepth 2 -name "*.log" -not -path "./node_modules/*" -delete 2>/dev/null',
          'rm -rf ./temp/* 2>/dev/null',
          'rm -rf ./logs/* 2>/dev/null',
          'git gc --prune=now --aggressive 2>/dev/null || true',
          'npm cache clean --force 2>/dev/null || true'
        ];
        for (const cmd of cleanCmds) {
          await run(cmd, 15000).catch(() => {});
        }
        const dfAfter = await run('df -BM --output=avail . 2>/dev/null || df -m . 2>/dev/null', 5000).catch(() => '');
        const afterMatch = dfAfter.match(/(\d+)M?\s*$/m);
        const afterMB = afterMatch ? parseInt(afterMatch[1]) : beforeMB;
        const recovered = (beforeMB !== null && afterMB !== null) ? (afterMB - beforeMB) : 0;
        await editStatus(`💾 **Media cleanup done!** ${afterMB !== null ? afterMB + 'MB free' : ''}${recovered > 0 ? ' (recovered ' + recovered + 'MB)' : ''}\n✅ Settings, prefix, configs preserved\nContinuing update...`);
        if (afterMB !== null && afterMB < 30) {
          await editStatus(`❌ **Not enough disk space for update**\nOnly ${afterMB}MB free after cleanup.\nManually delete large files or increase disk allocation.`);
          return;
        }
      } catch (diskErr) {
        // Non-critical, continue with update
      }
      
      // If just checking size
      if (sizeCheck) {
        try {
          const sizeInfo = await checkRepoSize();
          await editStatus(`📊 **Repository Size Report**\n\nSize: ${sizeInfo.sizeMB} MB\nObjects: ${sizeInfo.objects}\nPacks: ${sizeInfo.packs}\n\nUse \`.update clean\` to optimize size`);
          return;
        } catch (error) {
          await editStatus(`❌ **Could not check size**\nError: ${error.message}`);
          return;
        }
      }
      
      // If just cleaning history
      if (cleanHistory && !useZip && !useGit) {
        await editStatus('🧹 **Starting history cleanup...**\nThis will remove all Git history while keeping branches.');
        
        try {
          const result = await deepCleanGitHistory({
            preserveBranches: true,
            maxHistoryDepth: deepClean ? 5 : 10
          });
          
          await editStatus(`✅ **History Cleanup Complete!**\n\n• New size: ${result.newSize} MB\n• Branches preserved: ${result.branchesPreserved}\n• Original commit: ${result.originalCommit}\n\nRepository optimized! 🎉`);
          return;
        } catch (error) {
          await editStatus(`❌ **Cleanup failed:** ${error.message}`);
          return;
        }
      }
      
      let result;
      
      if (useGit || (!useZip && await hasGitRepo())) {
        await editStatus('🌐 **Smart Git Update**\nWith automatic size optimization...');
        result = await smartGitUpdate({
          autoCleanHistory: cleanHistory || deepClean,
          cleanThresholdMB: deepClean ? 50 : 100,
          maxHistoryDepth: deepClean ? 5 : 20
        });
        
        if (result.alreadyUpToDate) {
          await editStatus(`✅ **Already Up to Date**\nBranch: ${result.branch}\nCommit: ${result.newRev?.slice(0, 7) || 'N/A'}\nSize: ${result.sizeAfter || 'unknown'} MB`);
          
          // Clean history even if up to date if requested
          if (cleanHistory) {
            await editStatus('🧹 **Cleaning history as requested...**');
            const cleanResult = await deepCleanGitHistory();
            await editStatus(`✅ **History cleaned!**\nNew size: ${cleanResult.newSize} MB\nReduction: ${cleanResult.reduction} MB`);
          } else if (hotReload) {
            await editStatus('🔄 **Hot reloading commands...**');
            const reloadResult = await hotReloadCommands();
            await editStatus(`✅ **Hot reload complete**\nReloaded: ${reloadResult.reloaded} commands\nErrors: ${reloadResult.errors}`);
          }
          return;
        }
        
        const sizeMsg = result.historyCleaned ? 
          `(Cleaned: ${result.reduction || '0'} MB saved)` : 
          `(${result.sizeDiff >= 0 ? '+' : ''}${result.sizeDiff} MB)`;
        
        await editStatus(`✅ **Git Update Complete**\nUpdated to: ${result.newRev?.slice(0, 7) || 'N/A'}\nSize: ${result.sizeAfter} MB ${sizeMsg}\nInstalling dependencies...`);
        
      } else {
        await editStatus('📥 **Using ZIP update method**\nDownloading latest version...');
        result = await updateViaZip();
        
        await editStatus(`✅ **ZIP Update Complete**\nFiles updated: ${result.fileCount || 0}\nInstalling dependencies...`);
      }
      
      // Install dependencies (skip if soft update)
      if (!softUpdate) {
        await editStatus('📦 **Installing dependencies...**');
        
        try {
          await run('npm install --no-audit --no-fund --loglevel=error', 180000);
          await editStatus('✅ **Dependencies installed**');
        } catch {
          await editStatus('⚠️ **Could not install all dependencies**\nContinuing anyway...');
        }
      }
      
      // Try hot reload first if requested
      if (hotReload || softUpdate) {
        try {
          await editStatus('🔄 **Attempting hot reload...**');
          const reloadResult = await hotReloadCommands();
          
          if (reloadResult.reloaded > 0) {
            await editStatus(`✅ **Hot reload successful!**\nReloaded: ${reloadResult.reloaded} commands\nErrors: ${reloadResult.errors}\n\nBot updated without restart! 🎉`);
          } else if (reloadResult.errors > 0) {
            await editStatus(`⚠️ **Hot reload had issues**\nReloaded: ${reloadResult.reloaded} commands\nErrors: ${reloadResult.errors}\n\nConsider restarting for full update.`);
          } else {
            await editStatus('✅ **Update Applied Successfully**\nRunning without restart.\nSome changes may need restart to take effect.');
          }
          
        } catch (reloadError) {
          // (suppressed)
          await editStatus('⚠️ **Hot reload failed**\nFalling back to normal update...');
          
          await editStatus('✅ **Update Complete!**\nRestarting bot in 3 seconds...');
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          await sock.sendMessage(jid, {
            text: '🔄 **Restarting Now...**\nBot will be back in a moment!'
          }, { quoted: m });
          
          try {
            await run('pm2 restart all', 10000);
          } catch {
            // (suppressed)
            process.exit(0);
          }
        }
      } else {
        // Normal restart
        await editStatus('✅ **Update Complete!**\nRestarting bot in 3 seconds...');
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await sock.sendMessage(jid, {
          text: '🔄 **Restarting Now...**\nBot will be back in a moment!'
        }, { quoted: m });
        
        try {
          await run('pm2 restart all', 10000);
        } catch {
          // (suppressed)
          process.exit(0);
        }
      }
      
    } catch (err) {
      // (suppressed)
      
      let errorText = `❌ **Update Failed**\nError: ${err.message || err}\n\n`;
      
      if (err.message.includes('timeout')) {
        errorText += '**Reason:** Operation timed out\n';
        errorText += '**Solution:** Try again with better internet connection\n';
      } else if (err.message.includes('HTTP')) {
        errorText += '**Reason:** Download failed\n';
        errorText += '**Solution:** Check internet or try .update git\n';
      } else if (err.message.includes('Git')) {
        errorText += '**Reason:** Git operation failed\n';
        errorText += '**Solution:** Try .update zip instead\n';
      } else if (err.message.includes('clean')) {
        errorText += '**Reason:** History cleanup failed\n';
        errorText += '**Solution:** Try without clean option first\n';
      }
      
      errorText += '\n**Available Options:**\n';
      errorText += '`.update` - Smart update with auto-clean\n';
      errorText += '`.update clean` - Clean history only\n';
      errorText += '`.update deep` - Deep clean + update\n';
      errorText += '`.update git hot` - Git update + hot reload\n';
      errorText += '`.update size` - Check repository size\n';
      errorText += '`.update zip` - ZIP update (fallback)\n';
      errorText += '`.update soft` - Update without restart\n';
      
      try {
        if (statusMessage?.key) {
          await sock.sendMessage(jid, { text: errorText, edit: statusMessage.key });
        } else {
          await sock.sendMessage(jid, { text: errorText }, { quoted: m });
        }
      } catch {
        // Ignore if can't send error
      }
    }
  }
};
