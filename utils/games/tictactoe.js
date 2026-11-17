/*
==================================================
MORPION — board : tableau de 9 cases (0 vide, 1 = X, 2 = O)
==================================================
*/

const LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
];

function winner(board) {
    for (const line of LINES) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return { player: board[a], line };
    }
    return null;
}

const isFull = (board) => board.every((v) => v !== 0);
const freeCells = (board) => board.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);

function minimax(board, player) {
    const win = winner(board);
    if (win) return win.player === player ? 1 : -1;
    if (isFull(board)) return 0;
    let best = -Infinity;
    for (const i of freeCells(board)) {
        board[i] = player;
        best = Math.max(best, -minimax(board, 3 - player));
        board[i] = 0;
    }
    return best;
}

function perfectMove(board, player) {
    let best = [];
    let bestScore = -Infinity;
    for (const i of freeCells(board)) {
        board[i] = player;
        const score = -minimax(board, 3 - player);
        board[i] = 0;
        if (score > bestScore) {
            bestScore = score;
            best = [i];
        } else if (score === bestScore) best.push(i);
    }
    return best[Math.floor(Math.random() * best.length)];
}

// difficulté : 0 = aléatoire, 0.5 = parfois parfait, 1 = imbattable
function botMove(board, player, skill) {
    if (Math.random() < skill) return perfectMove(board, player);
    const free = freeCells(board);
    return free[Math.floor(Math.random() * free.length)];
}

module.exports = { winner, isFull, freeCells, perfectMove, botMove };
