/*
==================================================
IA D'ÉCHECS (negamax + alpha-bêta sur chess.js)
Évaluation : matériel + tables de position simplifiées
==================================================
*/

const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Tables vues du côté blanc (rangée 8 en haut, index 0)
const PST = {
    p: [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [5, 5, 10, 25, 25, 10, 5, 5],
        [0, 0, 0, 20, 20, 0, 0, 0],
        [5, -5, -10, 0, 0, -10, -5, 5],
        [5, 10, 10, -20, -20, 10, 10, 5],
        [0, 0, 0, 0, 0, 0, 0, 0]
    ],
    n: [
        [-50, -40, -30, -30, -30, -30, -40, -50],
        [-40, -20, 0, 0, 0, 0, -20, -40],
        [-30, 0, 10, 15, 15, 10, 0, -30],
        [-30, 5, 15, 20, 20, 15, 5, -30],
        [-30, 0, 15, 20, 20, 15, 0, -30],
        [-30, 5, 10, 15, 15, 10, 5, -30],
        [-40, -20, 0, 5, 5, 0, -20, -40],
        [-50, -40, -30, -30, -30, -30, -40, -50]
    ],
    b: [
        [-20, -10, -10, -10, -10, -10, -10, -20],
        [-10, 0, 0, 0, 0, 0, 0, -10],
        [-10, 0, 5, 10, 10, 5, 0, -10],
        [-10, 5, 5, 10, 10, 5, 5, -10],
        [-10, 0, 10, 10, 10, 10, 0, -10],
        [-10, 10, 10, 10, 10, 10, 10, -10],
        [-10, 5, 0, 0, 0, 0, 5, -10],
        [-20, -10, -10, -10, -10, -10, -10, -20]
    ],
    r: [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [5, 10, 10, 10, 10, 10, 10, 5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [0, 0, 0, 5, 5, 0, 0, 0]
    ],
    q: [
        [-20, -10, -10, -5, -5, -10, -10, -20],
        [-10, 0, 0, 0, 0, 0, 0, -10],
        [-10, 0, 5, 5, 5, 5, 0, -10],
        [-5, 0, 5, 5, 5, 5, 0, -5],
        [0, 0, 5, 5, 5, 5, 0, -5],
        [-10, 5, 5, 5, 5, 5, 0, -10],
        [-10, 0, 5, 0, 0, 0, 0, -10],
        [-20, -10, -10, -5, -5, -10, -10, -20]
    ],
    k: [
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-20, -30, -30, -40, -40, -30, -30, -20],
        [-10, -20, -20, -20, -20, -20, -20, -10],
        [20, 20, 0, 0, 0, 0, 20, 20],
        [20, 30, 10, 0, 0, 10, 30, 20]
    ]
};

// Score du point de vue du camp au trait
function evaluate(chess) {
    let score = 0;
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (!piece) continue;
            const row = piece.color === "w" ? r : 7 - r;
            const value = VALUES[piece.type] + PST[piece.type][row][c];
            score += piece.color === "w" ? value : -value;
        }
    }
    return chess.turn() === "w" ? score : -score;
}

function orderMoves(moves) {
    // Captures (victime la plus chère d'abord) et promotions en premier
    const weight = (m) => (m.captured ? 10 * VALUES[m.captured] - VALUES[m.piece] : 0) + (m.promotion ? 800 : 0);
    return moves.sort((a, b) => weight(b) - weight(a));
}

function negamax(chess, depth, alpha, beta, ply) {
    if (chess.isCheckmate()) return -100000 + ply;
    if (chess.isDraw()) return 0;
    if (depth === 0) return evaluate(chess);

    let best = -Infinity;
    for (const move of orderMoves(chess.moves({ verbose: true }))) {
        chess.move(move);
        const score = -negamax(chess, depth - 1, -beta, -alpha, ply + 1);
        chess.undo();
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
    }
    return best;
}

// depth 1 = facile, 2 = normal, 3 = difficile
function bestMove(chess, depth) {
    const moves = orderMoves(chess.moves({ verbose: true }));
    let best = [];
    let bestScore = -Infinity;
    for (const move of moves) {
        chess.move(move);
        const score = -negamax(chess, depth - 1, -Infinity, Infinity, 1);
        chess.undo();
        if (score > bestScore) {
            bestScore = score;
            best = [move];
        } else if (score === bestScore) {
            best.push(move);
        }
    }
    return best[Math.floor(Math.random() * best.length)];
}

module.exports = { bestMove, evaluate };
