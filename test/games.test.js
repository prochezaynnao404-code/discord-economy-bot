const test = require("node:test");
const assert = require("node:assert");
const { Chess } = require("chess.js");

const ck = require("../utils/games/checkers");
const c4 = require("../utils/games/connect4");
const ttt = require("../utils/games/tictactoe");
const bs = require("../utils/games/battleship");
const chessAi = require("../utils/games/chessAi");
const { HangmanGame } = require("../utils/games/hangman");

function emptyCheckers(pieces) {
    const board = new Array(51).fill(null);
    for (const [sq, p] of Object.entries(pieces)) board[sq] = p;
    return board;
}

// ---------- Dames ----------

test("dames : numérotation des cases", () => {
    for (let sq = 1; sq <= 50; sq++) {
        const [r, c] = ck.toRC(sq);
        assert.strictEqual(ck.toSq(r, c), sq);
    }
    assert.deepStrictEqual(ck.toRC(1), [0, 1]);
    assert.deepStrictEqual(ck.toRC(46), [9, 0]);
});

test("dames : 9 coups au départ pour les blancs", () => {
    const game = new ck.CheckersGame();
    assert.strictEqual(game.moves().length, 9);
});

test("dames : prise majoritaire obligatoire", () => {
    const board = emptyCheckers({ 32: "w", 28: "b", 19: "b", 45: "w", 40: "b", 3: "b" });
    const moves = ck.legalMoves(board, "w");
    assert.strictEqual(moves.length, 1);
    assert.deepStrictEqual(moves[0].path, [32, 23, 14]);
    assert.deepStrictEqual(moves[0].captured, [28, 19]);
});

test("dames : le pion prend en arrière", () => {
    // Pion blanc en 23, pion noir en 28 derrière lui
    const moves = ck.legalMoves(emptyCheckers({ 23: "w", 28: "b" }), "w");
    assert.strictEqual(moves.length, 1);
    assert.deepStrictEqual(moves[0].path, [23, 32]);
});

test("dames : la dame volante peut atterrir sur toute case libre après la prise", () => {
    const moves = ck.legalMoves(emptyCheckers({ 46: "W", 28: "b" }), "w");
    assert.deepStrictEqual(
        moves.map((m) => m.path.at(-1)).sort((a, b) => a - b),
        [5, 10, 14, 19, 23]
    );
    assert.ok(moves.every((m) => m.captured.length === 1 && m.captured[0] === 28));
});

test("dames : une pièce ne peut pas être prise deux fois", () => {
    // Dame blanche entourée d'un seul pion noir : un seul pion pris, jamais deux fois
    const moves = ck.legalMoves(emptyCheckers({ 46: "W", 37: "b" }), "w");
    assert.ok(moves.length > 0);
    assert.ok(moves.every((m) => new Set(m.captured).size === m.captured.length && m.captured.length === 1));
});

test("dames : promotion en fin de coup", () => {
    const game = new ck.CheckersGame();
    game.board = emptyCheckers({ 6: "w", 45: "b" });
    const move = game.moves().find((m) => m.path.at(-1) === 1);
    game.play(move);
    assert.strictEqual(game.board[1], "W");
});

test("dames : victoire quand l'adversaire n'a plus de coup", () => {
    const game = new ck.CheckersGame();
    game.board = emptyCheckers({ 32: "w", 28: "b" });
    game.play(game.moves()[0]);
    assert.deepStrictEqual(game.result?.winner, "w");
});

test("dames : lecture de la notation", () => {
    const game = new ck.CheckersGame();
    const moves = game.moves();
    assert.deepStrictEqual(ck.parseMove("32-28", moves).move.path, [32, 28]);
    assert.ok(ck.parseMove("32-30", moves).error);
    assert.ok(ck.parseMove("bonjour", moves).error);
    assert.strictEqual(ck.notation(moves[0], moves), `${moves[0].path[0]}-${moves[0].path[1]}`);
});

test("dames : l'IA joue un coup légal", () => {
    const game = new ck.CheckersGame();
    const move = ck.bestMove(game, 4);
    assert.ok(game.moves().some((m) => m.path.join() === move.path.join()));
});

// ---------- Puissance 4 ----------

test("puissance 4 : détection d'alignement et IA", () => {
    const board = c4.emptyBoard();
    for (const col of [0, 1, 2]) c4.drop(board, col, 1);
    assert.strictEqual(c4.winningLine(board), null);
    // L'IA (joueur 2) doit bloquer en colonne 3
    assert.strictEqual(c4.bestColumn(board, 2, 4), 3);
    // Et gagner si elle peut
    const board2 = c4.emptyBoard();
    for (let i = 0; i < 3; i++) c4.drop(board2, 6, 2);
    assert.strictEqual(c4.bestColumn(board2, 2, 2), 6);
    c4.drop(board2, 6, 2);
    assert.strictEqual(c4.winningLine(board2).player, 2);
});

test("puissance 4 : colonne pleine refusée", () => {
    const board = c4.emptyBoard();
    for (let i = 0; i < 6; i++) assert.notStrictEqual(c4.drop(board, 0, 1 + (i % 2)), -1);
    assert.strictEqual(c4.drop(board, 0, 1), -1);
});

// ---------- Morpion ----------

test("morpion : deux IA parfaites font match nul", () => {
    const board = new Array(9).fill(0);
    let player = 1;
    while (!ttt.winner(board) && !ttt.isFull(board)) {
        board[ttt.perfectMove(board, player)] = player;
        player = 3 - player;
    }
    assert.strictEqual(ttt.winner(board), null);
});

// ---------- Bataille navale ----------

test("bataille navale : flotte valide et tirs", () => {
    const fleet = bs.randomFleet();
    let cells = 0;
    for (const row of fleet.grid) for (const v of row) if (v !== -1) cells++;
    assert.strictEqual(cells, 17);

    // Les bateaux ne se touchent pas (même en diagonale)
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            const v = fleet.grid[r][c];
            if (v === -1) continue;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const n = fleet.grid[r + dr]?.[c + dc];
                    if (n !== undefined && n !== -1) assert.strictEqual(n, v);
                }
            }
        }
    }

    assert.deepStrictEqual(bs.parseCoord("b7"), [6, 1]);
    assert.deepStrictEqual(bs.parseCoord("10J"), [9, 9]);
    assert.strictEqual(bs.parseCoord("K1"), null);

    // L'IA finit toujours par tout couler en 100 tirs maximum
    let shots = 0;
    while (!bs.allSunk(fleet)) {
        const [r, c] = bs.botShot(fleet, 2);
        assert.notStrictEqual(bs.fire(fleet, r, c).result, "already");
        shots++;
    }
    assert.ok(shots <= 100);
});

// ---------- Échecs ----------

test("échecs : l'IA trouve le mat en un", () => {
    const chess = new Chess("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
    assert.strictEqual(chessAi.bestMove(chess, 2).san, "Ra8#");
});

test("échecs : l'IA difficile répond en un temps raisonnable", () => {
    const chess = new Chess();
    chess.move("e4");
    const start = Date.now();
    const move = chessAi.bestMove(chess, 3);
    assert.ok(move);
    assert.ok(Date.now() - start < 8000, `trop lent : ${Date.now() - start} ms`);
});

// ---------- Pendu ----------

test("pendu : lettres, accents et défaite", () => {
    const game = new HangmanGame("pastèque");
    assert.strictEqual(game.guessLetter("e"), "good");
    assert.strictEqual(game.guessLetter("E"), "already");
    assert.strictEqual(game.masked, "_ _ _ _ E _ _ E");
    assert.ok(game.guessWord("pasteque"));
    assert.ok(game.won);

    const lose = new HangmanGame("kiwi");
    for (const l of "ABCDEFG") lose.guessLetter(l);
    assert.ok(lose.lost);
});
