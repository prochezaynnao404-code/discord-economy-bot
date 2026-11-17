const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");

const { toRC, isKing, colorOf } = require("./checkers");

// Police contenant les symboles des pièces d'échecs
GlobalFonts.registerFromPath(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"), "DejaVu");
GlobalFonts.registerFromPath(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"), "DejaVuBold");

const GLYPHS = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

function attachment(canvas, name) {
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
}

/*
==================================================
ÉCHIQUIER
chess : instance chess.js, flip : vue côté noirs
==================================================
*/

function renderChess(chess, { flip = false, lastMove = null } = {}) {
    const cell = 72;
    const margin = 28;
    const size = cell * 8 + margin * 2;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(0, 0, size, size);

    const board = chess.board(); // [rangée 8 .. rangée 1][a .. h]
    const checkSquare = chess.inCheck()
        ? board.flat().find((p) => p && p.type === "k" && p.color === chess.turn())?.square
        : null;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const br = flip ? 7 - r : r;
            const bc = flip ? 7 - c : c;
            const square = "abcdefgh"[bc] + (8 - br);
            const x = margin + c * cell;
            const y = margin + r * cell;

            let color = (br + bc) % 2 === 0 ? "#eeeed2" : "#769656";
            if (lastMove && (lastMove.from === square || lastMove.to === square)) {
                color = (br + bc) % 2 === 0 ? "#f6f669" : "#baca2b";
            }
            if (square === checkSquare) color = "#e05c5c";
            ctx.fillStyle = color;
            ctx.fillRect(x, y, cell, cell);

            const piece = board[br][bc];
            if (piece) {
                ctx.font = `${cell * 0.8}px DejaVu`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.lineWidth = 3;
                ctx.strokeStyle = piece.color === "w" ? "#111" : "#ddd";
                ctx.fillStyle = piece.color === "w" ? "#fff" : "#111";
                ctx.strokeText(GLYPHS[piece.type], x + cell / 2, y + cell / 2 + 3);
                ctx.fillText(GLYPHS[piece.type], x + cell / 2, y + cell / 2 + 3);
            }
        }
    }

    // Coordonnées
    ctx.fillStyle = "#ccc";
    ctx.font = "16px DejaVuBold";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 8; i++) {
        const file = "abcdefgh"[flip ? 7 - i : i];
        const rank = String(flip ? i + 1 : 8 - i);
        ctx.fillText(file, margin + i * cell + cell / 2, size - margin / 2);
        ctx.fillText(file, margin + i * cell + cell / 2, margin / 2);
        ctx.fillText(rank, margin / 2, margin + i * cell + cell / 2);
        ctx.fillText(rank, size - margin / 2, margin + i * cell + cell / 2);
    }

    return attachment(canvas, "echiquier.png");
}

/*
==================================================
DAMIER 10x10 (cases numérotées)
==================================================
*/

function renderCheckers(board, { lastMove = null } = {}) {
    const cell = 60;
    const margin = 12;
    const size = cell * 10 + margin * 2;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#3b2a1a";
    ctx.fillRect(0, 0, size, size);

    // Cases
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? "#f0d9b5" : "#a9744f";
            ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
        }
    }

    const highlight = new Set(lastMove ? lastMove.path : []);
    const captured = new Set(lastMove ? lastMove.captured : []);

    for (let sq = 1; sq <= 50; sq++) {
        const [r, c] = toRC(sq);
        const x = margin + c * cell;
        const y = margin + r * cell;

        if (highlight.has(sq)) {
            ctx.fillStyle = "rgba(255, 230, 80, 0.55)";
            ctx.fillRect(x, y, cell, cell);
        }
        if (captured.has(sq)) {
            ctx.fillStyle = "rgba(220, 50, 50, 0.45)";
            ctx.fillRect(x, y, cell, cell);
        }

        // Numéro de la case
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = "13px DejaVuBold";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(String(sq), x + 3, y + 2);

        const piece = board[sq];
        if (!piece) continue;
        const white = colorOf(piece) === "w";
        const cx = x + cell / 2;
        const cy = y + cell / 2 + 3;

        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = white ? "#f7f3ea" : "#1d1d1d";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = white ? "#8a7d66" : "#777";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.24, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.stroke();

        if (isKing(piece)) {
            ctx.fillStyle = "#d4a017";
            ctx.font = `${cell * 0.4}px DejaVu`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("♛", cx, cy + 1);
        }
    }

    return attachment(canvas, "damier.png");
}

module.exports = { renderChess, renderCheckers };
