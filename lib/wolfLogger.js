const _BOX_INNER = 30;
const _dash = (n) => '─'.repeat(Math.max(0, n));

function _boxTop(NB, R, icon, label) {
    const title   = `〔 ${icon} ${label} 〕`;
    const tVisLen = title.length + 2;
    const rpad    = Math.max(2, _BOX_INNER - 2 - tVisLen + 2);
    return `${NB}┌──${title}${_dash(rpad)}┐${R}`;
}
function _boxBot(NB, R) { return `${NB}└${_dash(_BOX_INNER + 2)}┘${R}`; }
function _boxRow(DOT, D, N, W, R, lbl, val) {
    const pad = ' '.repeat(Math.max(0, 9 - lbl.length));
    return `  ${DOT}  ${D}${lbl}${pad}${R}${N}:${R} ${W}${val}${R}`;
}

function _printBox({ color, icon, label, rows }) {
    const NB  = `\x1b[1m${color}`;
    const N   = color;
    const D   = '\x1b[2m\x1b[38;2;100;120;130m';
    const W   = '\x1b[38;2;200;215;225m';
    const R   = '\x1b[0m';
    const DOT = `${N}▣${R}`;
    const r   = (l, v) => _boxRow(DOT, D, N, W, R, l, v);
    const lines = ['', _boxTop(NB, R, icon, label)];
    for (const { key, val } of rows) {
        if (val !== null && val !== undefined && val !== '') lines.push(r(key, String(val)));
    }
    lines.push(_boxBot(NB, R), '');
    process.stdout.write(lines.join('\n') + '\n');
}

const _BL  = '\x1b[38;2;34;193;255m';
const _ORG = '\x1b[38;2;255;110;0m';
const _MAG = '\x1b[38;2;180;0;255m';

export const WolfLogger = {
    statusReply(action, from) {
        _printBox({
            color: _BL,
            icon:  '📲',
            label: 'STATUS REPLY',
            rows: [
                { key: 'Action', val: action },
                ...(from ? [{ key: 'From', val: from }] : []),
            ],
        });
    },

    antidelete(action, type, id) {
        _printBox({
            color: _ORG,
            icon:  '🗑️',
            label: 'ANTIDELETE',
            rows: [
                { key: 'Action', val: action },
                ...(type ? [{ key: 'Type',  val: type }] : []),
                ...(id   ? [{ key: 'ID',    val: String(id).slice(0, 12) + '...' }] : []),
            ],
        });
    },

    statusAD(action, type, id) {
        _printBox({
            color: _MAG,
            icon:  '🗑️',
            label: 'STATUS AD',
            rows: [
                { key: 'Action', val: action },
                ...(type ? [{ key: 'Type',  val: type }] : []),
                ...(id   ? [{ key: 'ID',    val: String(id).slice(0, 12) + '...' }] : []),
            ],
        });
    },
};
