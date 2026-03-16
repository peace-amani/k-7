import db from './database.js';

let sudoData = { sudoers: [], addedAt: {}, jidMap: {} };
let configData = { sudomode: false };
let lidMap = {};
let currentBotId = 'default';

function cleanNumber(num) {
    return num.replace(/[^0-9]/g, '');
}

function getBotId() {
    return currentBotId;
}

export function setBotId(botId) {
    if (botId) {
        const cleaned = botId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        currentBotId = cleaned || botId.split('@')[0] || 'default';
    }
}

export async function initSudo(botId) {
    try {
        if (botId) setBotId(botId);

        if (!db.isAvailable()) return;

        const rows = await db.getAll('sudoers', { bot_id: getBotId() });
        if (rows && rows.length > 0) {
            sudoData.sudoers = [];
            sudoData.addedAt = {};
            sudoData.jidMap = {};
            for (const row of rows) {
                const num = row.phone_number;
                sudoData.sudoers.push(num);
                if (row.added_at) sudoData.addedAt[num] = row.added_at;
                if (row.jid) {
                    sudoData.jidMap[num] = row.jid.split(',').filter(Boolean);
                }
            }
        } else {
            sudoData.sudoers = [];
            sudoData.addedAt = {};
            sudoData.jidMap = {};
        }

        const configRow = await db.get('sudo_config', getBotId(), 'bot_id');
        if (configRow) {
            configData.sudomode = configRow.sudomode || false;
        } else {
            configData.sudomode = false;
        }

        const lidRows = await db.getAll('lid_map');
        if (lidRows && lidRows.length > 0) {
            lidMap = {};
            for (const row of lidRows) {
                lidMap[row.lid] = row.phone_number;
            }
        }

    } catch (err) {
        console.error('⚠️ Sudo: Init error:', err.message);
    }
}

function syncSudoToDb(data) {
    if (!db.isAvailable()) return;
    try {
        for (const num of data.sudoers) {
            const jids = (data.jidMap && data.jidMap[num]) || [];
            db.upsert('sudoers', {
                phone_number: num,
                bot_id: getBotId(),
                jid: jids.join(',') || null,
                added_at: (data.addedAt && data.addedAt[num]) || new Date().toISOString()
            }, 'phone_number,bot_id').catch(() => {});
        }
    } catch {}
}

export function addSudo(number, jid) {
    const clean = cleanNumber(number);
    if (!clean) return { success: false, reason: 'Invalid number' };
    if (sudoData.sudoers.includes(clean)) {
        if (jid && jid !== clean) {
            sudoData.jidMap = sudoData.jidMap || {};
            sudoData.jidMap[clean] = sudoData.jidMap[clean] || [];
            if (!sudoData.jidMap[clean].includes(jid)) {
                sudoData.jidMap[clean].push(jid);
            }
            syncSudoToDb(sudoData);
        }
        return { success: false, reason: 'Already a sudo user' };
    }
    sudoData.sudoers.push(clean);
    sudoData.addedAt = sudoData.addedAt || {};
    sudoData.addedAt[clean] = new Date().toISOString();
    if (jid && jid !== clean) {
        sudoData.jidMap = sudoData.jidMap || {};
        sudoData.jidMap[clean] = [jid];
    }
    syncSudoToDb(sudoData);
    return { success: true, number: clean };
}

export function addSudoJid(number, jid) {
    const clean = cleanNumber(number);
    if (!clean) return;
    if (!sudoData.sudoers.includes(clean)) return;
    sudoData.jidMap = sudoData.jidMap || {};
    sudoData.jidMap[clean] = sudoData.jidMap[clean] || [];
    const rawJid = jid.split('@')[0].split(':')[0];
    if (!sudoData.jidMap[clean].includes(rawJid)) {
        sudoData.jidMap[clean].push(rawJid);
        syncSudoToDb(sudoData);
    }
}

export function removeSudo(number) {
    const clean = cleanNumber(number);
    if (!clean) return { success: false, reason: 'Invalid number' };
    const index = sudoData.sudoers.indexOf(clean);
    if (index === -1) {
        return { success: false, reason: 'Not a sudo user' };
    }
    sudoData.sudoers.splice(index, 1);
    if (sudoData.addedAt) delete sudoData.addedAt[clean];
    if (sudoData.jidMap) delete sudoData.jidMap[clean];

    if (db.isAvailable()) {
        db.removeWhere('sudoers', { phone_number: clean, bot_id: getBotId() }).catch(() => {});
    }

    return { success: true, number: clean };
}

export function getSudoList() {
    return { sudoers: sudoData.sudoers || [], addedAt: sudoData.addedAt || {}, jidMap: sudoData.jidMap || {} };
}

export function isSudoNumber(number) {
    const clean = cleanNumber(number);
    if (!clean) return false;
    if (sudoData.sudoers.includes(clean)) return true;
    if (sudoData.jidMap) {
        for (const [sudoNum, jids] of Object.entries(sudoData.jidMap)) {
            if (sudoData.sudoers.includes(sudoNum) && jids.includes(clean)) {
                return true;
            }
        }
    }
    return false;
}

export function isSudoJid(senderJid) {
    if (!senderJid) return false;
    const rawNumber = senderJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (!rawNumber) return false;
    if (sudoData.sudoers.includes(rawNumber)) return true;
    if (sudoData.jidMap) {
        for (const [sudoNum, jids] of Object.entries(sudoData.jidMap)) {
            if (sudoData.sudoers.includes(sudoNum) && jids.includes(rawNumber)) {
                return true;
            }
        }
    }
    return false;
}

export function clearAllSudo(ownerNumber) {
    const removed = sudoData.sudoers.length;
    const oldSudoers = [...sudoData.sudoers];
    sudoData.sudoers = [];
    sudoData.addedAt = {};
    sudoData.jidMap = {};

    if (db.isAvailable()) {
        for (const num of oldSudoers) {
            db.removeWhere('sudoers', { phone_number: num, bot_id: getBotId() }).catch(() => {});
        }
    }

    return { removed };
}

export function getSudoMode() {
    return configData.sudomode || false;
}

export function setSudoMode(enabled) {
    configData.sudomode = enabled;

    if (db.isAvailable()) {
        db.upsert('sudo_config', {
            id: 'main',
            bot_id: getBotId(),
            sudomode: enabled,
            updated_at: new Date().toISOString()
        }, 'id,bot_id').catch(() => {});
    }

    return enabled;
}

export function getSudoCount() {
    return sudoData.sudoers.length;
}

export function mapLidToPhone(lidNumber, phoneNumber) {
    if (!lidNumber || !phoneNumber || lidNumber === phoneNumber) return;
    if (lidMap[lidNumber] === phoneNumber) return;
    lidMap[lidNumber] = phoneNumber;

    if (db.isAvailable()) {
        db.upsert('lid_map', {
            lid: lidNumber,
            phone_number: phoneNumber,
            updated_at: new Date().toISOString()
        }, 'lid').catch(() => {});
    }
}

export function getPhoneFromLid(lidNumber) {
    return lidMap[lidNumber] || null;
}

export function isSudoByLid(lidNumber) {
    if (!lidNumber) return false;
    const phone = lidMap[lidNumber];
    if (!phone) return false;
    return sudoData.sudoers.includes(phone);
}

export function hasUnmappedSudos() {
    if (!sudoData.sudoers || sudoData.sudoers.length === 0) return false;
    const mappedPhones = new Set(Object.values(lidMap));
    return sudoData.sudoers.some(phone => !mappedPhones.has(phone));
}

export async function migrateSudoToSupabase() {
    if (!db.isAvailable()) return false;
    try {
        for (const num of sudoData.sudoers) {
            const jids = (sudoData.jidMap && sudoData.jidMap[num]) || [];
            await db.upsert('sudoers', {
                phone_number: num,
                bot_id: getBotId(),
                jid: jids.join(',') || null,
                added_at: (sudoData.addedAt && sudoData.addedAt[num]) || new Date().toISOString()
            }, 'phone_number,bot_id');
        }

        await db.upsert('sudo_config', {
            id: 'main',
            bot_id: getBotId(),
            sudomode: configData.sudomode || false,
            updated_at: new Date().toISOString()
        }, 'id,bot_id');

        for (const [lid, phone] of Object.entries(lidMap)) {
            await db.upsert('lid_map', {
                lid,
                phone_number: phone,
                updated_at: new Date().toISOString()
            }, 'lid');
        }

        return true;
    } catch (err) {
        console.error('⚠️ Supabase: Sudo migration error:', err.message);
        return false;
    }
}
