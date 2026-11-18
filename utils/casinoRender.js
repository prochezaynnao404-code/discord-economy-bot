const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

/*
==================================================
ANIMATIONS DU CASINO
Chaque jeu produit un GIF (l'animation) puis une image fixe (le résultat).
Tout est dessiné à la main : les emojis couleur ne sont pas disponibles
sur la plupart des hébergeurs Linux.
==================================================
*/

if (!GlobalFonts.has("DejaVu")) {
    GlobalFonts.registerFromPath(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"), "DejaVu");
}
if (!GlobalFonts.has("DejaVuBold")) {
    GlobalFonts.registerFromPath(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"), "DejaVuBold");
}

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeOutQuart = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 4);
const lerp = (a, b, t) => a + (b - a) * t;

/*
---------- GIF / PNG ----------
*/

// draw(ctx, i, n) dessine l'image i ; delayOf(i) = durée de l'image en ms
function makeGif(width, height, frameCount, draw, { delay = 50, delayOf = null, name = "animation.gif" } = {}) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
        ctx.save();
        draw(ctx, i, frameCount);
        ctx.restore();
        frames.push(ctx.getImageData(0, 0, width, height).data.slice());
    }

    // Palette commune construite à partir de quelques images (pas de scintillement)
    const samples = [0, Math.floor(frameCount / 3), Math.floor((2 * frameCount) / 3), frameCount - 1];
    const sample = new Uint8ClampedArray(samples.length * frames[0].length);
    samples.forEach((s, k) => sample.set(frames[s], k * frames[0].length));
    const palette = quantize(sample, 256);

    const gif = GIFEncoder();
    let duration = 0;
    frames.forEach((rgba, i) => {
        const d = delayOf ? delayOf(i) : delay;
        duration += d;
        // repeat -1 : l'animation n'est jouée qu'une fois
        gif.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay: d, repeat: -1 });
    });
    gif.finish();

    // Aperçu pour le développement : CASINO_PREVIEW_DIR=dossier enregistre 4 images de l'animation
    if (process.env.CASINO_PREVIEW_DIR) {
        const fs = require("fs");
        const path = require("path");
        samples.forEach((s, k) => {
            const c = createCanvas(width, height);
            const img = c.getContext("2d").createImageData(width, height);
            img.data.set(frames[s]);
            c.getContext("2d").putImageData(img, 0, 0);
            fs.writeFileSync(path.join(process.env.CASINO_PREVIEW_DIR, `${name}-${k}.png`), c.toBuffer("image/png"));
        });
    }
    return { attachment: new AttachmentBuilder(Buffer.from(gif.bytes()), { name }), name, duration };
}

function makePng(width, height, draw, name = "resultat.png") {
    const canvas = createCanvas(width, height);
    draw(canvas.getContext("2d"));
    return { attachment: new AttachmentBuilder(canvas.toBuffer("image/png"), { name }), name };
}

/*
---------- Outils de dessin ----------
*/

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

function text(
    ctx,
    str,
    x,
    y,
    { size = 20, color = "#fff", bold = true, align = "center", baseline = "middle", stroke = null } = {}
) {
    ctx.font = `${size}px ${bold ? "DejaVuBold" : "DejaVu"}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (stroke) {
        ctx.lineWidth = Math.max(2, size / 8);
        ctx.strokeStyle = stroke;
        ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
}

function background(ctx, w, h, top, bottom) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

/*
==================================================
MACHINE À SOUS
==================================================
*/

function drawSymbol(ctx, symbol, cx, cy, s) {
    ctx.save();
    ctx.lineJoin = "round";
    switch (symbol) {
        case "🍒": {
            ctx.strokeStyle = "#2e7d32";
            ctx.lineWidth = s * 0.06;
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.18, cy + s * 0.05);
            ctx.quadraticCurveTo(cx - s * 0.1, cy - s * 0.25, cx + s * 0.08, cy - s * 0.36);
            ctx.moveTo(cx + s * 0.2, cy + s * 0.1);
            ctx.quadraticCurveTo(cx + s * 0.18, cy - s * 0.2, cx + s * 0.08, cy - s * 0.36);
            ctx.stroke();
            ctx.fillStyle = "#43a047";
            ctx.beginPath();
            ctx.ellipse(cx + s * 0.2, cy - s * 0.34, s * 0.14, s * 0.06, -0.4, 0, TAU);
            ctx.fill();
            for (const [dx, dy] of [
                [-0.18, 0.18],
                [0.2, 0.22]
            ]) {
                ctx.fillStyle = "#d32f2f";
                ctx.beginPath();
                ctx.arc(cx + dx * s, cy + dy * s, s * 0.2, 0, TAU);
                ctx.fill();
                ctx.fillStyle = "rgba(255,255,255,0.45)";
                ctx.beginPath();
                ctx.arc(cx + dx * s - s * 0.07, cy + dy * s - s * 0.07, s * 0.05, 0, TAU);
                ctx.fill();
            }
            break;
        }
        case "🍋": {
            ctx.fillStyle = "#fdd835";
            ctx.strokeStyle = "#f9a825";
            ctx.lineWidth = s * 0.04;
            ctx.beginPath();
            ctx.ellipse(cx, cy, s * 0.36, s * 0.26, -0.35, 0, TAU);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + s * 0.33, cy - s * 0.12, s * 0.06, 0, TAU);
            ctx.arc(cx - s * 0.33, cy + s * 0.12, s * 0.06, 0, TAU);
            ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.beginPath();
            ctx.ellipse(cx - s * 0.1, cy - s * 0.08, s * 0.12, s * 0.05, -0.35, 0, TAU);
            ctx.fill();
            break;
        }
        case "🍊": {
            ctx.fillStyle = "#fb8c00";
            ctx.beginPath();
            ctx.arc(cx, cy + s * 0.04, s * 0.32, 0, TAU);
            ctx.fill();
            ctx.fillStyle = "#43a047";
            ctx.beginPath();
            ctx.ellipse(cx + s * 0.1, cy - s * 0.3, s * 0.13, s * 0.06, -0.5, 0, TAU);
            ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.beginPath();
            ctx.arc(cx - s * 0.12, cy - s * 0.06, s * 0.07, 0, TAU);
            ctx.fill();
            break;
        }
        case "🍇": {
            ctx.strokeStyle = "#5d4037";
            ctx.lineWidth = s * 0.05;
            ctx.beginPath();
            ctx.moveTo(cx, cy - s * 0.28);
            ctx.lineTo(cx + s * 0.06, cy - s * 0.4);
            ctx.stroke();
            const rows = [
                [-0.2, -0.18, 3],
                [0, -0.0, 2],
                [0, 0.18, 1]
            ];
            ctx.fillStyle = "#7b1fa2";
            for (const [, dy, n] of rows) {
                for (let k = 0; k < n; k++) {
                    const dx = (k - (n - 1) / 2) * 0.2;
                    ctx.beginPath();
                    ctx.arc(cx + dx * s, cy + (dy + 0.04) * s, s * 0.11, 0, TAU);
                    ctx.fill();
                }
            }
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            ctx.beginPath();
            ctx.arc(cx - s * 0.23, cy - s * 0.18, s * 0.035, 0, TAU);
            ctx.fill();
            break;
        }
        case "🔔": {
            ctx.fillStyle = "#fbc02d";
            ctx.strokeStyle = "#c49000";
            ctx.lineWidth = s * 0.04;
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.32, cy + s * 0.2);
            ctx.quadraticCurveTo(cx - s * 0.22, cy + s * 0.12, cx - s * 0.2, cy - s * 0.08);
            ctx.quadraticCurveTo(cx - s * 0.18, cy - s * 0.34, cx, cy - s * 0.34);
            ctx.quadraticCurveTo(cx + s * 0.18, cy - s * 0.34, cx + s * 0.2, cy - s * 0.08);
            ctx.quadraticCurveTo(cx + s * 0.22, cy + s * 0.12, cx + s * 0.32, cy + s * 0.2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy + s * 0.27, s * 0.07, 0, TAU);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy - s * 0.38, s * 0.05, 0, TAU);
            ctx.fill();
            break;
        }
        case "7️⃣":
            text(ctx, "7", cx, cy + s * 0.03, { size: s * 0.85, color: "#e53935", stroke: "#4a0d0d" });
            break;
        case "💎": {
            const top = cy - s * 0.2;
            const mid = cy - s * 0.05;
            const bot = cy + s * 0.32;
            ctx.fillStyle = "#4dd0e1";
            ctx.strokeStyle = "#006064";
            ctx.lineWidth = s * 0.03;
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.2, top);
            ctx.lineTo(cx + s * 0.2, top);
            ctx.lineTo(cx + s * 0.36, mid);
            ctx.lineTo(cx, bot);
            ctx.lineTo(cx - s * 0.36, mid);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.36, mid);
            ctx.lineTo(cx + s * 0.36, mid);
            ctx.moveTo(cx - s * 0.12, mid);
            ctx.lineTo(cx, bot);
            ctx.lineTo(cx + s * 0.12, mid);
            ctx.moveTo(cx - s * 0.2, top);
            ctx.lineTo(cx - s * 0.12, mid);
            ctx.moveTo(cx + s * 0.2, top);
            ctx.lineTo(cx + s * 0.12, mid);
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,0.55)";
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.16, top + s * 0.03);
            ctx.lineTo(cx - s * 0.04, top + s * 0.03);
            ctx.lineTo(cx - s * 0.1, mid - s * 0.02);
            ctx.closePath();
            ctx.fill();
            break;
        }
    }
    ctx.restore();
}

const SLOT_W = 480;
const SLOT_H = 280;
const REEL = { y: 60, w: 120, h: 150, gap: 22, symbol: 100 };
const reelX = (i) => (SLOT_W - (3 * REEL.w + 2 * REEL.gap)) / 2 + i * (REEL.w + REEL.gap);

function slotFrame(ctx, columns, { highlight = false, banner = null } = {}) {
    background(ctx, SLOT_W, SLOT_H, "#2a0845", "#120320");
    // Cadre de la machine
    roundRect(ctx, 20, 18, SLOT_W - 40, SLOT_H - 36, 22);
    ctx.fillStyle = "#6a1b9a";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#ffd54f";
    ctx.stroke();
    text(ctx, "★ MACHINE À SOUS ★", SLOT_W / 2, 40, { size: 18, color: "#ffd54f" });

    for (let i = 0; i < 3; i++) {
        const x = reelX(i);
        ctx.save();
        roundRect(ctx, x, REEL.y, REEL.w, REEL.h, 12);
        ctx.fillStyle = "#fafafa";
        ctx.fill();
        ctx.clip();
        // columns[i] = [{ symbol, offset }] : offset en pixels depuis le centre
        for (const { symbol, offset } of columns[i]) {
            drawSymbol(ctx, symbol, x + REEL.w / 2, REEL.y + REEL.h / 2 + offset, REEL.symbol);
        }
        // Ombres haut/bas pour l'effet de rouleau
        const g = ctx.createLinearGradient(0, REEL.y, 0, REEL.y + REEL.h);
        g.addColorStop(0, "rgba(0,0,0,0.45)");
        g.addColorStop(0.25, "rgba(0,0,0,0)");
        g.addColorStop(0.75, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0,0.45)");
        ctx.fillStyle = g;
        ctx.fillRect(x, REEL.y, REEL.w, REEL.h);
        ctx.restore();
        roundRect(ctx, x, REEL.y, REEL.w, REEL.h, 12);
        ctx.lineWidth = 4;
        ctx.strokeStyle = highlight ? "#ffeb3b" : "#3e0a5c";
        ctx.stroke();
    }

    // Ligne de gain
    ctx.strokeStyle = highlight ? "rgba(255,235,59,0.9)" : "rgba(255,82,82,0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, REEL.y + REEL.h / 2);
    ctx.lineTo(SLOT_W - 32, REEL.y + REEL.h / 2);
    ctx.stroke();

    if (banner) {
        roundRect(ctx, 90, SLOT_H - 62, SLOT_W - 180, 36, 18);
        ctx.fillStyle = banner.color;
        ctx.fill();
        text(ctx, banner.text, SLOT_W / 2, SLOT_H - 44, { size: 18, color: "#fff", stroke: "rgba(0,0,0,0.5)" });
    }
}

function slotAnimation(finalReels, symbols) {
    const FRAMES = 46;
    const stopAt = [18, 28, 38];
    const spacing = REEL.symbol + 10;
    const speed = 55; // pixels par image
    // Bande de symboles aléatoires par rouleau, qui se termine par le symbole final
    const strips = finalReels.map(() =>
        Array.from({ length: 60 }, () => symbols[Math.floor(Math.random() * symbols.length)])
    );

    const columnsAt = (frame) =>
        finalReels.map((final, r) => {
            if (frame >= stopAt[r]) {
                // Arrêt avec un petit rebond
                const since = frame - stopAt[r];
                const bounce = since < 4 ? Math.sin((since / 4) * Math.PI) * 12 : 0;
                return [
                    { symbol: strips[r][1], offset: -spacing + bounce },
                    { symbol: final, offset: bounce },
                    { symbol: strips[r][2], offset: spacing + bounce }
                ];
            }
            const scroll = (frame * speed) % spacing;
            const base = Math.floor((frame * speed) / spacing);
            return [-1, 0, 1, 2].map((k) => ({
                symbol: strips[r][(base + k + 3) % strips[r].length],
                offset: k * spacing - scroll
            }));
        });

    return makeGif(SLOT_W, SLOT_H, FRAMES, (ctx, i) => slotFrame(ctx, columnsAt(i)), {
        delay: 55,
        name: "machine.gif"
    });
}

function slotResult(finalReels, banner) {
    const columns = finalReels.map((s) => [{ symbol: s, offset: 0 }]);
    return makePng(SLOT_W, SLOT_H, (ctx) => slotFrame(ctx, columns, { highlight: banner.win, banner }), "machine.png");
}

/*
==================================================
ROULETTE (européenne)
==================================================
*/

const ROULETTE_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29,
    7, 28, 12, 35, 3, 26
];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const R_SIZE = 400;
const R_C = R_SIZE / 2;

function rouletteFrame(ctx, wheelAngle, ball, result = null) {
    background(ctx, R_SIZE, R_SIZE, "#0b3d1e", "#06210f");
    const outer = 180;
    const pocketOuter = 150;
    const pocketInner = 108;
    const n = ROULETTE_ORDER.length;
    const slice = TAU / n;

    // Bois
    ctx.beginPath();
    ctx.arc(R_C, R_C, outer, 0, TAU);
    ctx.fillStyle = "#5d3a1a";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(R_C, R_C, outer - 12, 0, TAU);
    ctx.fillStyle = "#8d5a2b";
    ctx.fill();

    // Cases
    ROULETTE_ORDER.forEach((num, i) => {
        const a0 = wheelAngle + i * slice - Math.PI / 2 - slice / 2;
        ctx.beginPath();
        ctx.arc(R_C, R_C, pocketOuter, a0, a0 + slice);
        ctx.arc(R_C, R_C, pocketInner, a0 + slice, a0, true);
        ctx.closePath();
        ctx.fillStyle = num === 0 ? "#1b8a3a" : RED.has(num) ? "#c62828" : "#1a1a1a";
        if (result !== null && num === result) ctx.fillStyle = "#ffd54f";
        ctx.fill();
        ctx.strokeStyle = "#c9a227";
        ctx.lineWidth = 1;
        ctx.stroke();

        const mid = a0 + slice / 2;
        ctx.save();
        ctx.translate(R_C + Math.cos(mid) * 135, R_C + Math.sin(mid) * 135);
        ctx.rotate(mid + Math.PI / 2);
        text(ctx, String(num), 0, 0, { size: 11, color: result !== null && num === result ? "#000" : "#fff" });
        ctx.restore();
    });

    // Moyeu
    const hub = ctx.createRadialGradient(R_C - 20, R_C - 20, 10, R_C, R_C, pocketInner);
    hub.addColorStop(0, "#d9b25f");
    hub.addColorStop(1, "#6d4c1f");
    ctx.beginPath();
    ctx.arc(R_C, R_C, pocketInner - 2, 0, TAU);
    ctx.fillStyle = hub;
    ctx.fill();
    ctx.save();
    ctx.translate(R_C, R_C);
    ctx.rotate(wheelAngle);
    ctx.strokeStyle = "#f5e6b3";
    ctx.lineWidth = 6;
    for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -60);
        ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(R_C, R_C, 14, 0, TAU);
    ctx.fillStyle = "#f5e6b3";
    ctx.fill();

    // Bille
    const bx = R_C + Math.cos(ball.angle) * ball.radius;
    const by = R_C + Math.sin(ball.angle) * ball.radius;
    ctx.beginPath();
    ctx.arc(bx, by, 7, 0, TAU);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.stroke();
}

function rouletteGeometry(result) {
    const index = ROULETTE_ORDER.indexOf(result);
    const slice = TAU / ROULETTE_ORDER.length;
    const wheelFinal = 3.1; // angle final de la roue (arbitraire)
    const ballFinal = wheelFinal + index * slice - Math.PI / 2;
    return { wheelFinal, ballFinal };
}

function rouletteAnimation(result) {
    const FRAMES = 64;
    const { wheelFinal, ballFinal } = rouletteGeometry(result);
    return makeGif(
        R_SIZE,
        R_SIZE,
        FRAMES,
        (ctx, i) => {
            const t = i / (FRAMES - 1);
            const wheel = wheelFinal - (1 - easeOutCubic(t)) * TAU * 3;
            const ballAngle = ballFinal + (1 - easeOutQuart(t)) * TAU * 5;
            // La bille tourne sur le bord puis tombe dans la case
            const radius = t < 0.65 ? 165 : lerp(165, 128, easeOutCubic((t - 0.65) / 0.35));
            rouletteFrame(ctx, wheel, { angle: ballAngle, radius });
        },
        { delay: 50, name: "roulette.gif" }
    );
}

function rouletteResult(result) {
    const { wheelFinal, ballFinal } = rouletteGeometry(result);
    return makePng(
        R_SIZE,
        R_SIZE,
        (ctx) => rouletteFrame(ctx, wheelFinal, { angle: ballFinal, radius: 128 }, result),
        "roulette.png"
    );
}

/*
==================================================
PILE OU FACE
==================================================
*/

const COIN = 300;

function coinFace(ctx, cx, cy, r, scaleY, side) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, Math.max(0.04, Math.abs(scaleY)));
    // Tranche
    ctx.beginPath();
    ctx.arc(0, 6, r, 0, TAU);
    ctx.fillStyle = "#9c7a1c";
    ctx.fill();
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, "#fff3b0");
    g.addColorStop(1, "#d4a017");
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#a67c00";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, TAU);
    ctx.lineWidth = 2;
    ctx.stroke();
    if (side === "face") {
        text(ctx, "♛", 0, -r * 0.05, { size: r * 0.95, color: "#8a6500", bold: false });
    } else {
        text(ctx, "1", 0, r * 0.02, { size: r * 1.0, color: "#8a6500" });
    }
    ctx.restore();
}

function coinFrame(ctx, { angle, height, result = null, label = null }) {
    background(ctx, COIN, COIN, "#1d2b53", "#0b1226");
    // Ombre
    const shadowScale = 1 - height / 220;
    ctx.beginPath();
    ctx.ellipse(COIN / 2, 262, 60 * shadowScale, 12 * shadowScale, 0, 0, TAU);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fill();
    const scaleY = Math.cos(angle);
    // Côté visible : alterne à chaque demi-tour
    const side = Math.floor((angle + Math.PI / 2) / Math.PI) % 2 === 0 ? "pile" : "face";
    coinFace(ctx, COIN / 2, 160 - height, 75, scaleY, result ?? side);
    if (label) text(ctx, label, COIN / 2, 32, { size: 24, color: "#ffd54f", stroke: "#000" });
}

function coinAnimation(result) {
    const FRAMES = 40;
    // Nombre de demi-tours : pair -> on retombe sur pile, impair -> face
    const halfTurns = 10 + (result === "face" ? 1 : 0);
    return makeGif(
        COIN,
        COIN,
        FRAMES,
        (ctx, i) => {
            const t = i / (FRAMES - 1);
            const angle = easeOutCubic(t) * halfTurns * Math.PI;
            const height = Math.sin(Math.PI * Math.min(1, t * 1.05)) * 110;
            coinFrame(ctx, { angle, height: Math.max(0, height) });
        },
        { delay: 50, name: "piece.gif" }
    );
}

function coinResult(result) {
    return makePng(
        COIN,
        COIN,
        (ctx) => coinFrame(ctx, { angle: 0, height: 0, result, label: result === "pile" ? "PILE" : "FACE" }),
        "piece.png"
    );
}

/*
==================================================
ROUE DE LA FORTUNE
==================================================
*/

const WHEEL_COLORS = {
    0: "#37474f",
    0.5: "#8d6e63",
    1: "#eceff1",
    1.5: "#42a5f5",
    2: "#66bb6a",
    3: "#fdd835",
    8: "#e53935"
};
const W_SIZE = 420;

function wheelFrame(ctx, segments, angle, winIndex = null) {
    background(ctx, W_SIZE, W_SIZE, "#311b92", "#120a3a");
    const c = W_SIZE / 2;
    const r = 175;
    const slice = TAU / segments.length;

    ctx.beginPath();
    ctx.arc(c, c + 4, r + 12, 0, TAU);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, r + 10, 0, TAU);
    ctx.fillStyle = "#ffca28";
    ctx.fill();

    segments.forEach((m, i) => {
        const a0 = angle + i * slice - Math.PI / 2 - slice / 2;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, r, a0, a0 + slice);
        ctx.closePath();
        ctx.fillStyle = WHEEL_COLORS[m];
        ctx.fill();
        ctx.strokeStyle = winIndex === i ? "#fff" : "rgba(0,0,0,0.35)";
        ctx.lineWidth = winIndex === i ? 4 : 1.5;
        ctx.stroke();

        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(a0 + slice / 2);
        const dark = m === 1 || m === 3;
        text(ctx, `x${String(m).replace(".", ",")}`, r - 34, 0, { size: 16, color: dark ? "#222" : "#fff" });
        ctx.restore();
    });

    // Ampoules
    for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * (r + 5), c + Math.sin(a) * (r + 5), 3, 0, TAU);
        ctx.fillStyle = k % 2 ? "#fff8e1" : "#ff7043";
        ctx.fill();
    }

    // Centre
    ctx.beginPath();
    ctx.arc(c, c, 26, 0, TAU);
    ctx.fillStyle = "#ffca28";
    ctx.fill();
    text(ctx, "★", c, c + 1, { size: 26, color: "#6d4c00", bold: false });

    // Pointeur
    ctx.beginPath();
    ctx.moveTo(c - 16, 6);
    ctx.lineTo(c + 16, 6);
    ctx.lineTo(c, 40);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#b71c1c";
    ctx.lineWidth = 3;
    ctx.stroke();
}

function wheelAnimation(segments, finalIndex) {
    const FRAMES = 64;
    const slice = TAU / segments.length;
    const final = -finalIndex * slice; // la case gagnante sous le pointeur
    return makeGif(
        W_SIZE,
        W_SIZE,
        FRAMES,
        (ctx, i) => {
            const t = i / (FRAMES - 1);
            wheelFrame(ctx, segments, final - (1 - easeOutQuart(t)) * TAU * 4);
        },
        { delay: 50, name: "roue.gif" }
    );
}

function wheelResult(segments, finalIndex) {
    const slice = TAU / segments.length;
    return makePng(W_SIZE, W_SIZE, (ctx) => wheelFrame(ctx, segments, -finalIndex * slice, finalIndex), "roue.png");
}

/*
==================================================
COURSE DE CHEVAUX
==================================================
*/

const HORSE_COLORS = ["#e53935", "#1e88e5", "#8e24aa", "#43a047", "#fb8c00"];
const RACE_W = 520;
const RACE_H = 300;

function raceFrame(ctx, horses, positions, length, { pickIndex, winnerIndex = null, gallop = 0 }) {
    background(ctx, RACE_W, RACE_H, "#7cb342", "#558b2f");
    const top = 34;
    const laneH = (RACE_H - top - 14) / horses.length;
    const startX = 92;
    const finishX = RACE_W - 40;

    text(ctx, "HIPPODROME", RACE_W / 2, 18, { size: 16, color: "#fff", stroke: "rgba(0,0,0,0.5)" });

    horses.forEach((horse, i) => {
        const y = top + i * laneH;
        ctx.fillStyle = i % 2 ? "#a1887f" : "#bcaaa4";
        ctx.fillRect(startX - 6, y + 2, finishX - startX + 12, laneH - 4);
        // Nom
        text(ctx, horse.name, 8, y + laneH / 2, {
            size: 13,
            color: i === pickIndex ? "#ffeb3b" : "#fff",
            align: "left",
            stroke: "rgba(0,0,0,0.6)"
        });
        // Cheval
        const p = positions[i] / length;
        const x = lerp(startX + 14, finishX - 18, p);
        const bob = Math.sin(gallop + i * 1.7) * 3;
        ctx.save();
        ctx.translate(x, y + laneH / 2 + bob);
        ctx.scale(-1, 1); // le cavalier regarde vers la droite
        text(ctx, "♞", 0, 0, { size: laneH * 0.9, color: HORSE_COLORS[i], bold: false, stroke: "#fff" });
        ctx.restore();
        if (winnerIndex === i) {
            text(ctx, "★", x + 26, y + laneH / 2 - 8, { size: 22, color: "#ffeb3b", stroke: "#000", bold: false });
        }
    });

    // Ligne d'arrivée en damier
    const sq = 8;
    for (let yy = top; yy < RACE_H - 14; yy += sq) {
        for (let k = 0; k < 2; k++) {
            ctx.fillStyle = (Math.floor((yy - top) / sq) + k) % 2 ? "#fff" : "#000";
            ctx.fillRect(finishX + k * sq, yy, sq, sq);
        }
    }
}

function raceAnimation(horses, frames, length, pickIndex) {
    const SUB = 6; // images intermédiaires entre deux étapes
    const keyframes = [horses.map(() => 0), ...frames];
    const total = (keyframes.length - 1) * SUB + 1;
    return makeGif(
        RACE_W,
        RACE_H,
        total,
        (ctx, i) => {
            const k = Math.min(keyframes.length - 2, Math.floor(i / SUB));
            const t = i === total - 1 ? 1 : (i % SUB) / SUB;
            const positions = keyframes[k].map((p, h) => lerp(p, keyframes[k + 1][h], t));
            raceFrame(ctx, horses, positions, length, { pickIndex, gallop: i * 1.3 });
        },
        { delay: 70, name: "course.gif" }
    );
}

function raceResult(horses, finalPositions, length, pickIndex, winnerIndex) {
    return makePng(
        RACE_W,
        RACE_H,
        (ctx) => raceFrame(ctx, horses, finalPositions, length, { pickIndex, winnerIndex }),
        "course.png"
    );
}

/*
==================================================
CRASH : courbe de la fusée (une image par seconde)
==================================================
*/

const CRASH_W = 480;
const CRASH_H = 270;

function crashImage({ multiplier, elapsed, state, cashout = null }) {
    return makePng(
        CRASH_W,
        CRASH_H,
        (ctx) => {
            background(ctx, CRASH_W, CRASH_H, "#0d1b2a", "#1b263b");
            const left = 46;
            const bottom = CRASH_H - 30;
            const width = CRASH_W - left - 20;
            const height = bottom - 40;

            // Échelles qui s'adaptent pour que la courbe reste visible
            const maxT = Math.max(8000, elapsed * 1.15);
            const maxM = Math.max(2, multiplier * 1.25);
            const X = (t) => left + (t / maxT) * width;
            const Y = (m) => bottom - ((m - 1) / (maxM - 1)) * height;

            // Grille
            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            ctx.lineWidth = 1;
            for (let k = 0; k <= 4; k++) {
                const m = 1 + ((maxM - 1) * k) / 4;
                ctx.beginPath();
                ctx.moveTo(left, Y(m));
                ctx.lineTo(left + width, Y(m));
                ctx.stroke();
                text(ctx, `x${m.toFixed(1)}`, left - 6, Y(m), {
                    size: 11,
                    color: "#90a4ae",
                    align: "right",
                    bold: false
                });
            }

            // Courbe
            const color = state === "crashed" ? "#ef5350" : state === "cashed" ? "#66bb6a" : "#29b6f6";
            const steps = 60;
            ctx.beginPath();
            ctx.moveTo(X(0), Y(1));
            for (let s = 1; s <= steps; s++) {
                const t = (elapsed * s) / steps;
                ctx.lineTo(X(t), Y(Math.exp((0.12 * t) / 1000)));
            }
            ctx.lineTo(X(elapsed), bottom);
            ctx.lineTo(X(0), bottom);
            ctx.closePath();
            ctx.fillStyle = state === "crashed" ? "rgba(239,83,80,0.18)" : "rgba(41,182,246,0.18)";
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(X(0), Y(1));
            for (let s = 1; s <= steps; s++) {
                const t = (elapsed * s) / steps;
                ctx.lineTo(X(t), Y(Math.exp((0.12 * t) / 1000)));
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.stroke();

            // Fusée (ou explosion) au bout de la courbe
            const tipX = X(elapsed);
            const tipY = Y(multiplier);
            if (state === "crashed") {
                for (const [r, col] of [
                    [34, "rgba(255,87,34,0.5)"],
                    [24, "rgba(255,152,0,0.8)"],
                    [13, "#ffeb3b"]
                ]) {
                    ctx.beginPath();
                    for (let k = 0; k < 16; k++) {
                        const a = (k / 16) * TAU;
                        const rr = k % 2 ? r : r * 0.55;
                        ctx.lineTo(tipX + Math.cos(a) * rr, tipY + Math.sin(a) * rr);
                    }
                    ctx.closePath();
                    ctx.fillStyle = col;
                    ctx.fill();
                }
            } else {
                const slope = Math.atan2(Y(multiplier) - Y(multiplier * 0.97), X(elapsed) - X(elapsed * 0.97 || 1));
                ctx.save();
                ctx.translate(tipX, tipY);
                ctx.rotate(Number.isFinite(slope) ? slope : -0.3);
                ctx.fillStyle = "#ff7043";
                ctx.beginPath();
                ctx.moveTo(-16, -5);
                ctx.lineTo(-26, 0);
                ctx.lineTo(-16, 5);
                ctx.fill();
                ctx.fillStyle = "#eceff1";
                ctx.beginPath();
                ctx.moveTo(14, 0);
                ctx.lineTo(4, -7);
                ctx.lineTo(-16, -7);
                ctx.lineTo(-16, 7);
                ctx.lineTo(4, 7);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = "#e53935";
                ctx.beginPath();
                ctx.moveTo(-16, -7);
                ctx.lineTo(-22, -12);
                ctx.lineTo(-10, -7);
                ctx.moveTo(-16, 7);
                ctx.lineTo(-22, 12);
                ctx.lineTo(-10, 7);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(0, 0, 3, 0, TAU);
                ctx.fillStyle = "#29b6f6";
                ctx.fill();
                ctx.restore();
            }

            // Multiplicateur en gros
            const big = state === "crashed" ? `CRASH x${multiplier.toFixed(2)}` : `x${multiplier.toFixed(2)}`;
            text(ctx, big, CRASH_W / 2, 30, { size: 30, color, stroke: "#000" });
            if (cashout) text(ctx, cashout, CRASH_W / 2, 60, { size: 16, color: "#c8e6c9", bold: false });
        },
        "crash.png"
    );
}

/*
==================================================
BLACKJACK : table de jeu
==================================================
*/

const BJ_W = 520;
const BJ_H = 320;
const CARD_W = 62;
const CARD_H = 88;
const RED_SUITS = new Set(["♥", "♦"]);

function drawCard(ctx, x, y, card, faceDown = false) {
    ctx.save();
    roundRect(ctx, x + 2, y + 3, CARD_W, CARD_H, 7);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    roundRect(ctx, x, y, CARD_W, CARD_H, 7);
    if (faceDown) {
        ctx.fillStyle = "#1565c0";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.clip();
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 2;
        for (let k = -CARD_H; k < CARD_W + CARD_H; k += 10) {
            ctx.beginPath();
            ctx.moveTo(x + k, y);
            ctx.lineTo(x + k - CARD_H, y + CARD_H);
            ctx.stroke();
        }
    } else {
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.strokeStyle = "#bbb";
        ctx.lineWidth = 1;
        ctx.stroke();
        const color = RED_SUITS.has(card.suit) ? "#d32f2f" : "#212121";
        text(ctx, card.rank, x + 7, y + 13, { size: 16, color, align: "left" });
        text(ctx, card.suit, x + 7, y + 30, { size: 14, color, align: "left", bold: false });
        text(ctx, card.suit, x + CARD_W / 2, y + CARD_H / 2 + 8, { size: 34, color, bold: false });
    }
    ctx.restore();
}

// hands : { dealer: [{card, x, y, faceDown}], player: [...] } avec positions déjà calculées
function tableFrame(ctx, { cards, dealerLabel, playerLabel, banner = null }) {
    background(ctx, BJ_W, BJ_H, "#1b5e20", "#0d3b12");
    ctx.beginPath();
    ctx.ellipse(BJ_W / 2, BJ_H / 2, BJ_W / 2 - 14, BJ_H / 2 - 14, 0, 0, TAU);
    ctx.strokeStyle = "rgba(255,213,79,0.35)";
    ctx.lineWidth = 3;
    ctx.stroke();
    text(ctx, "BLACKJACK PAIE 3 CONTRE 2", BJ_W / 2, BJ_H / 2, { size: 13, color: "rgba(255,213,79,0.6)" });
    text(ctx, dealerLabel, 20, 22, { size: 15, color: "#fff", align: "left" });
    text(ctx, playerLabel, 20, BJ_H - 20, { size: 15, color: "#fff", align: "left" });

    // Sabot
    drawCard(ctx, BJ_W - 84, 18, null, true);

    for (const c of cards) drawCard(ctx, c.x, c.y, c.card, c.faceDown);

    if (banner) {
        roundRect(ctx, BJ_W / 2 - 150, BJ_H / 2 - 22, 300, 44, 22);
        ctx.fillStyle = banner.color;
        ctx.fill();
        text(ctx, banner.text, BJ_W / 2, BJ_H / 2, { size: 20, color: "#fff", stroke: "rgba(0,0,0,0.5)" });
    }
}

const DEALER_Y = 38;
const PLAYER_Y = BJ_H - CARD_H - 38;
const slotX = (i) => 40 + i * (CARD_W + 10);
const DECK = { x: BJ_W - 84, y: 18 };

function layout(game, { hideHole }) {
    return [
        ...game.dealer.map((card, i) => ({ card, x: slotX(i), y: DEALER_Y, faceDown: hideHole && i === 1 })),
        ...game.player.map((card, i) => ({ card, x: slotX(i), y: PLAYER_Y, faceDown: false }))
    ];
}

// Distribue depuis le sabot les cartes listées dans `order` : [{ hand: "dealer" | "player", index }]
function dealAnimation(game, order, labels, { hideHole }) {
    const PER_CARD = 6;
    const final = layout(game, { hideHole });
    const find = (o) =>
        final.find((c) => c.y === (o.hand === "dealer" ? DEALER_Y : PLAYER_Y) && c.x === slotX(o.index));
    const moving = order.map(find);
    const fixed = final.filter((c) => !moving.includes(c));
    const FRAMES = moving.length * PER_CARD + 4;

    return makeGif(
        BJ_W,
        BJ_H,
        FRAMES,
        (ctx, i) => {
            const cards = [...fixed];
            moving.forEach((c, k) => {
                const t = (i - k * PER_CARD) / PER_CARD;
                if (t <= 0) return;
                const e = easeOutCubic(t);
                cards.push({ ...c, x: lerp(DECK.x, c.x, e), y: lerp(DECK.y, c.y, e), faceDown: t < 0.5 || c.faceDown });
            });
            tableFrame(ctx, { cards, ...labels });
        },
        { delay: 45, name: "table.gif" }
    );
}

function tableImage(game, labels, { hideHole, banner = null }) {
    return makePng(
        BJ_W,
        BJ_H,
        (ctx) => tableFrame(ctx, { cards: layout(game, { hideHole }), ...labels, banner }),
        "table.png"
    );
}

module.exports = {
    makeGif,
    makePng,
    slotAnimation,
    slotResult,
    rouletteAnimation,
    rouletteResult,
    coinAnimation,
    coinResult,
    wheelAnimation,
    wheelResult,
    raceAnimation,
    raceResult,
    crashImage,
    dealAnimation,
    tableImage,
    layout,
    slotX,
    DEALER_Y,
    PLAYER_Y
};
