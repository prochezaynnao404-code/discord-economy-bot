/*
==================================================
DAMES INTERNATIONALES (10x10)
- Cases noires numérotées de 1 à 50 (notation officielle)
- Noirs en haut (1-20), Blancs en bas (31-50), les Blancs commencent
- Prise obligatoire ET majoritaire, les pions prennent en arrière
- Dames volantes, une pièce ne peut être prise qu'une fois par rafle
- Promotion uniquement si le pion termine son coup sur la dernière rangée
- Nulle : répétition 3 fois, ou 25 coups de chaque camp sans prise
  ni mouvement de pion
==================================================
*/

const SIZE = 10;
const DIRS = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
];

function toRC(sq) {
    const r = Math.floor((sq - 1) / 5);
    const pos = (sq - 1) % 5;
    return [r, r % 2 === 0 ? pos * 2 + 1 : pos * 2];
}

function toSq(r, c) {
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || (r + c) % 2 === 0) return 0;
    return r * 5 + Math.floor(c / 2) + 1;
}

const colorOf = (p) => (p ? p.toLowerCase() : null);
const isKing = (p) => p === "W" || p === "B";
const other = (side) => (side === "w" ? "b" : "w");

function initialBoard() {
    const board = new Array(51).fill(null);
    for (let sq = 1; sq <= 20; sq++) board[sq] = "b";
    for (let sq = 31; sq <= 50; sq++) board[sq] = "w";
    return board;
}

// Recherche récursive des rafles depuis `from`
function captureSequences(board, start, piece) {
    const side = colorOf(piece);
    const results = [];

    function explore(sq, path, captured) {
        const [r, c] = toRC(sq);
        let extended = false;

        for (const [dr, dc] of DIRS) {
            if (isKing(piece)) {
                // Dame volante : glisse jusqu'à une pièce, la prend, atterrit sur n'importe quelle case libre derrière
                let rr = r + dr;
                let cc = c + dc;
                let target = toSq(rr, cc);
                while (target && (board[target] === null || target === start) && !captured.includes(target)) {
                    rr += dr;
                    cc += dc;
                    target = toSq(rr, cc);
                }
                if (!target || captured.includes(target) || colorOf(board[target]) !== other(side)) continue;
                rr += dr;
                cc += dc;
                let land = toSq(rr, cc);
                while (land && (board[land] === null || land === start)) {
                    extended = true;
                    explore(land, [...path, land], [...captured, target]);
                    rr += dr;
                    cc += dc;
                    land = toSq(rr, cc);
                }
            } else {
                const target = toSq(r + dr, c + dc);
                const land = toSq(r + 2 * dr, c + 2 * dc);
                if (!target || !land || captured.includes(target)) continue;
                if (colorOf(board[target]) !== other(side)) continue;
                if (board[land] !== null && land !== start) continue;
                extended = true;
                explore(land, [...path, land], [...captured, target]);
            }
        }

        if (!extended && captured.length > 0) results.push({ path, captured });
    }

    explore(start, [start], []);
    return results;
}

function simpleMoves(board, sq, piece) {
    const [r, c] = toRC(sq);
    const moves = [];
    for (const [dr, dc] of DIRS) {
        if (isKing(piece)) {
            let rr = r + dr;
            let cc = c + dc;
            let to = toSq(rr, cc);
            while (to && board[to] === null) {
                moves.push({ path: [sq, to], captured: [] });
                rr += dr;
                cc += dc;
                to = toSq(rr, cc);
            }
        } else {
            const forward = piece === "w" ? -1 : 1;
            if (dr !== forward) continue;
            const to = toSq(r + dr, c + dc);
            if (to && board[to] === null) moves.push({ path: [sq, to], captured: [] });
        }
    }
    return moves;
}

function legalMoves(board, side) {
    let captures = [];
    for (let sq = 1; sq <= 50; sq++) {
        if (colorOf(board[sq]) === side) captures.push(...captureSequences(board, sq, board[sq]));
    }

    if (captures.length > 0) {
        const max = Math.max(...captures.map((m) => m.captured.length));
        captures = captures.filter((m) => m.captured.length === max);
        // Supprime les doublons (même départ, arrivée et pièces prises)
        const seen = new Set();
        return captures.filter((m) => {
            const key = `${m.path[0]}-${m.path.at(-1)}-${[...m.captured].sort((a, b) => a - b).join(",")}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    const moves = [];
    for (let sq = 1; sq <= 50; sq++) {
        if (colorOf(board[sq]) === side) moves.push(...simpleMoves(board, sq, board[sq]));
    }
    return moves;
}

function applyMove(board, move) {
    const next = [...board];
    const from = move.path[0];
    const to = move.path.at(-1);
    let piece = next[from];
    next[from] = null;
    for (const sq of move.captured) next[sq] = null;
    const [r] = toRC(to);
    if (piece === "w" && r === 0) piece = "W";
    if (piece === "b" && r === SIZE - 1) piece = "B";
    next[to] = piece;
    return next;
}

function notation(move, allMoves = []) {
    const sep = move.captured.length ? "x" : "-";
    const from = move.path[0];
    const to = move.path.at(-1);
    const ambiguous = allMoves.some(
        (m) => m !== move && m.path[0] === from && m.path.at(-1) === to && m.captured.length === move.captured.length
    );
    return ambiguous ? move.path.join(sep) : `${from}${sep}${to}`;
}

// Interprète "32-28", "19x30", "19x30x39"... Renvoie { move } ou { error }
function parseMove(text, moves) {
    const nums = String(text)
        .split(/[^0-9]+/)
        .filter(Boolean)
        .map(Number);
    if (nums.length < 2 || nums.some((n) => n < 1 || n > 50)) {
        return { error: "Format attendu : `32-28` ou `19x30` (numéros des cases de 1 à 50)." };
    }

    const matches = moves.filter((m) => {
        if (m.path[0] !== nums[0] || m.path.at(-1) !== nums.at(-1)) return false;
        let i = 1;
        for (const sq of nums.slice(1, -1)) {
            i = m.path.indexOf(sq, i);
            if (i === -1) return false;
            i++;
        }
        return true;
    });

    if (matches.length === 0)
        return { error: "Coup illégal. N'oublie pas que la prise est obligatoire et majoritaire." };
    if (matches.length > 1) {
        return {
            error: `Coup ambigu, précise le chemin : ${matches.map((m) => `\`${m.path.join("x")}\``).join(", ")}`
        };
    }
    return { move: matches[0] };
}

/*
==================================================
PARTIE
==================================================
*/

class CheckersGame {
    constructor() {
        this.board = initialBoard();
        this.turn = "w";
        this.quietPlies = 0; // coups de dames sans prise
        this.positions = new Map();
        this.lastMove = null;
        this.result = null; // { winner: "w"|"b"|null, reason }
        this.remember();
    }

    key() {
        return (
            this.turn +
            this.board
                .slice(1)
                .map((p) => p || ".")
                .join("")
        );
    }

    remember() {
        const k = this.key();
        this.positions.set(k, (this.positions.get(k) || 0) + 1);
        return this.positions.get(k);
    }

    moves() {
        return legalMoves(this.board, this.turn);
    }

    play(move) {
        const piece = this.board[move.path[0]];
        this.board = applyMove(this.board, move);
        this.lastMove = move;
        this.quietPlies = move.captured.length === 0 && isKing(piece) ? this.quietPlies + 1 : 0;
        this.turn = other(this.turn);

        const count = this.remember();
        if (this.moves().length === 0) {
            this.result = { winner: other(this.turn), reason: "plus aucun coup possible" };
        } else if (count >= 3) {
            this.result = { winner: null, reason: "répétition de position" };
        } else if (this.quietPlies >= 50) {
            this.result = { winner: null, reason: "25 coups de dames sans prise" };
        }
    }

    count(side) {
        let men = 0;
        let kings = 0;
        for (let sq = 1; sq <= 50; sq++) {
            if (colorOf(this.board[sq]) !== side) continue;
            if (isKing(this.board[sq])) kings++;
            else men++;
        }
        return { men, kings };
    }
}

/*
==================================================
IA (negamax + élagage alpha-bêta)
==================================================
*/

function evaluate(board, side) {
    let score = 0;
    for (let sq = 1; sq <= 50; sq++) {
        const p = board[sq];
        if (!p) continue;
        const [r, c] = toRC(sq);
        let value = isKing(p) ? 320 : 100;
        if (!isKing(p)) value += (p === "w" ? 9 - r : r) * 3; // avancement
        if (c >= 3 && c <= 6) value += 4; // contrôle du centre
        score += colorOf(p) === side ? value : -value;
    }
    return score;
}

function negamax(board, side, depth, alpha, beta) {
    const moves = legalMoves(board, side);
    if (moves.length === 0) return -100000 - depth;
    if (depth === 0) return evaluate(board, side);
    let best = -Infinity;
    for (const move of moves) {
        const score = -negamax(applyMove(board, move), other(side), depth - 1, -beta, -alpha);
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
    }
    return best;
}

function bestMove(game, depth) {
    const moves = game.moves();
    let best = [];
    let bestScore = -Infinity;
    for (const move of moves) {
        const score = -negamax(applyMove(game.board, move), other(game.turn), depth - 1, -Infinity, Infinity);
        if (score > bestScore) {
            bestScore = score;
            best = [move];
        } else if (score === bestScore) {
            best.push(move);
        }
    }
    return best[Math.floor(Math.random() * best.length)];
}

module.exports = { CheckersGame, legalMoves, applyMove, parseMove, notation, bestMove, toRC, toSq, isKing, colorOf };
