const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");

const { SIZE, PALETTE } = require("./drawing");

/*
==================================================
RENDU DES DESSINS
- renderEditor : grille, curseur et palette (pendant le dessin)
- renderArtwork : œuvre encadrée, sans grille (galerie, résultats)
==================================================
*/

if (!GlobalFonts.has("Poppins")) {
    GlobalFonts.registerFromPath(path.join(__dirname, "../assets/fonts/Poppins-Bold.ttf"), "Poppins");
}

const toPixels = (input) => (Array.isArray(input) ? input : Array.from(input, (c) => parseInt(c, 16)));

function drawPixels(ctx, pixels, x0, y0, cell) {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            ctx.fillStyle = PALETTE[pixels[y * SIZE + x]].hex;
            ctx.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
        }
    }
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// state : { pixels, cursor, color, brush, penDown } ; showCursor : false pour la vue publique
function renderEditor(state, { showCursor = true } = {}) {
    const cell = 26;
    const pad = 18;
    const grid = SIZE * cell;
    const paletteH = showCursor ? 46 : 0;
    const canvas = createCanvas(grid + pad * 2, grid + pad * 2 + paletteH);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#1e1f24";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawPixels(ctx, toPixels(state.pixels), pad, pad, cell);

    // Grille légère
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    for (let i = 1; i < SIZE; i++) {
        const p = pad + i * cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(p, pad);
        ctx.lineTo(p, pad + grid);
        ctx.moveTo(pad, p);
        ctx.lineTo(pad + grid, p);
        ctx.stroke();
    }
    // Repères tous les 4 pixels
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    for (let i = 4; i < SIZE; i += 4) {
        const p = pad + i * cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(p, pad);
        ctx.lineTo(p, pad + grid);
        ctx.moveTo(pad, p);
        ctx.lineTo(pad + grid, p);
        ctx.stroke();
    }

    if (showCursor) {
        const r = state.brush === 3 ? 1 : 0;
        const x0 = Math.max(0, state.cursor.x - r);
        const y0 = Math.max(0, state.cursor.y - r);
        const x1 = Math.min(SIZE - 1, state.cursor.x + r);
        const y1 = Math.min(SIZE - 1, state.cursor.y + r);
        const cx = pad + x0 * cell;
        const cy = pad + y0 * cell;
        const w = (x1 - x0 + 1) * cell;
        const h = (y1 - y0 + 1) * cell;
        // Aperçu de la couleur au centre du curseur
        ctx.fillStyle = PALETTE[state.color].hex;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(pad + state.cursor.x * cell + 7, pad + state.cursor.y * cell + 7, cell - 14, cell - 14);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#ffffff";
        ctx.strokeRect(cx + 1, cy + 1, w - 2, h - 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = state.penDown ? "#e53935" : "#111111";
        ctx.strokeRect(cx + 1, cy + 1, w - 2, h - 2);

        // Palette en bas, couleur choisie entourée
        const sw = grid / PALETTE.length;
        const py = pad * 2 + grid - 6;
        PALETTE.forEach((c, i) => {
            ctx.fillStyle = c.hex;
            roundRect(ctx, pad + i * sw + 3, py, sw - 6, 30, 6);
            ctx.fill();
            if (i === state.color) {
                ctx.lineWidth = 3;
                ctx.strokeStyle = "#f7c948";
                roundRect(ctx, pad + i * sw + 1, py - 2, sw - 2, 34, 8);
                ctx.stroke();
            }
        });
    }
    return canvas.toBuffer("image/png");
}

// Œuvre encadrée avec titre et auteur
function renderArtwork(pixels, { title = "", author = "" } = {}) {
    const cell = 30;
    const grid = SIZE * cell;
    const frame = 34;
    const mat = 18;
    const footer = title || author ? 74 : 0;
    const W = grid + (frame + mat) * 2;
    const H = grid + (frame + mat) * 2 + footer;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // Mur
    ctx.fillStyle = "#2a2b31";
    ctx.fillRect(0, 0, W, H);

    // Cadre doré
    const gold = ctx.createLinearGradient(0, 0, W, grid + (frame + mat) * 2);
    gold.addColorStop(0, "#f7d774");
    gold.addColorStop(0.5, "#b8862b");
    gold.addColorStop(1, "#f0c95a");
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = gold;
    ctx.fillRect(6, 6, W - 12, grid + (frame + mat) * 2 - 12);
    ctx.shadowBlur = 0;

    // Passe-partout puis œuvre
    ctx.fillStyle = "#f4efe6";
    ctx.fillRect(frame, frame, grid + mat * 2, grid + mat * 2);
    drawPixels(ctx, toPixels(pixels), frame + mat, frame + mat, cell);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(frame + mat, frame + mat, grid, grid);

    if (footer) {
        const y = grid + (frame + mat) * 2;
        ctx.textAlign = "center";
        ctx.fillStyle = "#f4efe6";
        ctx.font = "26px Poppins";
        ctx.fillText(title.slice(0, 32), W / 2, y + 34);
        if (author) {
            ctx.fillStyle = "#a3acbd";
            ctx.font = "18px Poppins";
            ctx.fillText(author.slice(0, 40), W / 2, y + 60);
        }
    }
    return canvas.toBuffer("image/png");
}

module.exports = { renderEditor, renderArtwork };
