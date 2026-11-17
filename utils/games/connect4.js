/*
==================================================
PUISSANCE 4 (7 colonnes x 6 rangées)
board[r][c] : rangée 0 = haut. Valeurs : 0 vide, 1 joueur 1, 2 joueur 2
==================================================
*/

const ROWS = 6;
const COLS = 7;
const ORDER = [3, 2, 4, 1, 5, 0, 6]; // le centre d'abord (meilleur élagage)

function emptyBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function canPlay(board, col) {
    return col >= 0 && col < COLS && board[0][col] === 0;
}

// Renvoie la rangée où le jeton tombe, ou -1
function drop(board, col, player) {
    if (!canPlay(board, col)) return -1;
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === 0) {
            board[r][col] = player;
            return r;
        }
    }
    return -1;
}

function undo(board, col) {
    for (let r = 0; r < ROWS; r++) {
        if (board[r][col] !== 0) {
            board[r][col] = 0;
            return;
        }
    }
}

// Renvoie les 4 cases gagnantes ou null
function winningLine(board) {
    const dirs = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1]
    ];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const p = board[r][c];
            if (!p) continue;
            for (const [dr, dc] of dirs) {
                const cells = [[r, c]];
                for (let k = 1; k < 4; k++) {
                    const rr = r + dr * k;
                    const cc = c + dc * k;
                    if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || board[rr][cc] !== p) break;
                    cells.push([rr, cc]);
                }
                if (cells.length === 4) return { player: p, cells };
            }
        }
    }
    return null;
}

const isFull = (board) => board[0].every((v) => v !== 0);

// ---------- IA ----------

function scoreWindow(window, player) {
    const mine = window.filter((v) => v === player).length;
    const theirs = window.filter((v) => v === 3 - player).length;
    const empty = 4 - mine - theirs;
    if (mine === 3 && empty === 1) return 5;
    if (mine === 2 && empty === 2) return 2;
    if (theirs === 3 && empty === 1) return -4;
    return 0;
}

function evaluate(board, player) {
    let score = 0;
    for (let r = 0; r < ROWS; r++) if (board[r][3] === player) score += 3;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (c + 3 < COLS)
                score += scoreWindow(
                    [0, 1, 2, 3].map((k) => board[r][c + k]),
                    player
                );
            if (r + 3 < ROWS)
                score += scoreWindow(
                    [0, 1, 2, 3].map((k) => board[r + k][c]),
                    player
                );
            if (r + 3 < ROWS && c + 3 < COLS)
                score += scoreWindow(
                    [0, 1, 2, 3].map((k) => board[r + k][c + k]),
                    player
                );
            if (r + 3 < ROWS && c - 3 >= 0)
                score += scoreWindow(
                    [0, 1, 2, 3].map((k) => board[r + k][c - k]),
                    player
                );
        }
    }
    return score;
}

function negamax(board, player, depth, alpha, beta) {
    const win = winningLine(board);
    if (win) return win.player === player ? 100000 + depth : -100000 - depth;
    if (isFull(board)) return 0;
    if (depth === 0) return evaluate(board, player);

    let best = -Infinity;
    for (const col of ORDER) {
        if (!canPlay(board, col)) continue;
        drop(board, col, player);
        const score = -negamax(board, 3 - player, depth - 1, -beta, -alpha);
        undo(board, col);
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
    }
    return best;
}

function bestColumn(board, player, depth) {
    let best = [];
    let bestScore = -Infinity;
    for (const col of ORDER) {
        if (!canPlay(board, col)) continue;
        drop(board, col, player);
        const score = -negamax(board, 3 - player, depth - 1, -Infinity, Infinity);
        undo(board, col);
        if (score > bestScore) {
            bestScore = score;
            best = [col];
        } else if (score === bestScore) {
            best.push(col);
        }
    }
    return best[Math.floor(Math.random() * best.length)];
}

module.exports = { ROWS, COLS, emptyBoard, canPlay, drop, winningLine, isFull, bestColumn };
