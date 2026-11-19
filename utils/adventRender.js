const path = require("path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");

const { ADVENT, SPECIAL_DOORS } = require("./advent");

/*
==================================================
IMAGE DU CALENDRIER DE L'AVENT
- Ciel de nuit enneigé, guirlande lumineuse
- 24 cases en grille 6 × 4 :
  · ouverte   : boule de Noël (dorée si ticket d'or)
  · du jour   : paquet cadeau rouge avec ruban, qui brille
  · ratée     : case grisée barrée
  · à venir   : porte fermée avec cadenas
  · spéciale  : étoile dorée dans le coin
- Barre de progression et total gagné en bas
==================================================
*/

if (!GlobalFonts.has("Poppins")) {
    GlobalFonts.registerFromPath(path.join(__dirname, "../assets/fonts/Poppins-Bold.ttf"), "Poppins");
}
if (!GlobalFonts.has("DejaVu")) {
    GlobalFonts.registerFromPath(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"), "DejaVu");
}

const W = 1000;
const H = 950;
const COLS = 6;
const CELL = 132;
const GAP = 18;
const GRID_X = (W - (COLS * CELL + (COLS - 1) * GAP)) / 2;
const GRID_Y = 190;

const C = {
    skyTop: "#0b1530",
    skyBottom: "#1b2a4e",
    snow: "#eef4ff",
    gold: "#f7c948",
    goldDark: "#c9971c",
    red: "#d43c3c",
    redDark: "#9e2424",
    green: "#1f7a52",
    greenDark: "#135238",
    locked: "#24345a",
    lockedDark: "#1a2747",
    missed: "#2b2f3a",
    text: "#ffffff",
    muted: "#a9b6d3"
};

const nf = (n) => n.toLocaleString("fr-FR").replace(/\s/g, " ");

// Pseudo-aléatoire déterministe : la neige est la même à chaque rendu
function seeded(seed) {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function sky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(1, C.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Flocons
    const rand = seeded(2412);
    for (let i = 0; i < 140; i++) {
        const x = rand() * W;
        const y = rand() * H;
        const r = 0.8 + rand() * 2.4;
        ctx.globalAlpha = 0.25 + rand() * 0.55;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = C.snow;
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Congères en bas
    ctx.fillStyle = "#dfe8f7";
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - 46);
    for (let x = 0; x <= W; x += 50) {
        ctx.quadraticCurveTo(x + 25, H - 70 + Math.sin(x) * 10, x + 50, H - 46);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
}

// Guirlande lumineuse en haut
function garland(ctx) {
    ctx.strokeStyle = "#173d2c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    const points = [];
    for (let x = -20; x <= W + 20; x += 4) {
        const y = 22 + Math.abs(Math.sin((x / W) * Math.PI * 4)) * 26;
        points.push([x, y]);
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const colors = [C.red, C.gold, "#4cc9f0", "#5fd38d"];
    let n = 0;
    for (let i = 10; i < points.length; i += 16) {
        const [x, y] = points[i];
        const color = colors[n++ % colors.length];
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.ellipse(x, y + 8, 5, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }
    ctx.shadowBlur = 0;
}

function star(ctx, cx, cy, outer, inner, color) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

async function header(ctx, { year, user, subtitle }) {
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.font = "44px Poppins";
    ctx.fillStyle = C.text;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 10;
    ctx.fillText(`Calendrier de l'Avent ${year}`, GRID_X, 120);
    ctx.shadowBlur = 0;

    ctx.font = "20px DejaVu";
    ctx.fillStyle = C.muted;
    ctx.fillText(subtitle, GRID_X, 154);

    // Avatar à droite
    const r = 44;
    const x = W - GRID_X - r;
    const y = 112;
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.fillStyle = C.gold;
    ctx.fill();
    const image = user.avatarURL ? await loadImage(user.avatarURL).catch(() => null) : null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    if (image) ctx.drawImage(image, x - r, y - r, r * 2, r * 2);
    else {
        ctx.fillStyle = C.green;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.fillStyle = C.text;
        ctx.font = "40px Poppins";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((user.name || "?").charAt(0).toUpperCase(), x, y + 3);
    }
    ctx.restore();

    // Bonnet de Père Noël sur l'avatar
    ctx.save();
    ctx.translate(x + 18, y - r + 2);
    ctx.rotate(0.35);
    ctx.beginPath();
    ctx.moveTo(-30, 8);
    ctx.quadraticCurveTo(0, -48, 34, -18);
    ctx.lineTo(26, 8);
    ctx.closePath();
    ctx.fillStyle = C.red;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-34, 2, 64, 14, 7);
    ctx.fillStyle = C.snow;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(36, -18, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function cellBox(ctx, x, y, fill, dark, { glow } = {}) {
    if (glow) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = 26;
    } else {
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 5;
    }
    const g = ctx.createLinearGradient(x, y, x, y + CELL);
    g.addColorStop(0, fill);
    g.addColorStop(1, dark);
    ctx.beginPath();
    ctx.roundRect(x, y, CELL, CELL, 18);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
}

function dayNumber(ctx, x, y, day, color, size = 30) {
    ctx.font = `${size}px Poppins`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = color;
    ctx.fillText(String(day), x + 14, y + 10);
}

// Boule de Noël
function bauble(ctx, cx, cy, r, color, dark) {
    ctx.fillStyle = "#c9c9c9";
    ctx.fillRect(cx - 7, cy - r - 9, 14, 10);
    ctx.strokeStyle = "#c9c9c9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - r - 13, 5, 0, Math.PI * 2);
    ctx.stroke();
    const g = ctx.createRadialGradient(cx - r / 3, cy - r / 3, 2, cx, cy, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.25, color);
    g.addColorStop(1, dark);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r / 3.2, 0, 0, Math.PI);
    ctx.stroke();
}

function openedCell(ctx, x, y, door) {
    const golden = door.golden;
    cellBox(ctx, x, y, golden ? "#f4c542" : C.green, golden ? C.goldDark : C.greenDark);
    dayNumber(ctx, x, y, door.day, golden ? "#5a3b00" : "rgba(255,255,255,0.9)", 24);
    const palette = golden ? ["#fff3b0", "#b8860b"] : door.day % 2 ? [C.red, C.redDark] : [C.gold, C.goldDark];
    bauble(ctx, x + CELL / 2, y + CELL / 2 + 14, 30, ...palette);
    // Coche
    ctx.beginPath();
    ctx.arc(x + CELL - 24, y + 24, 13, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    ctx.strokeStyle = golden ? C.goldDark : C.green;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + CELL - 30, y + 24);
    ctx.lineTo(x + CELL - 25, y + 29);
    ctx.lineTo(x + CELL - 17, y + 19);
    ctx.stroke();
    ctx.lineCap = "butt";
}

function todayCell(ctx, x, y, day) {
    cellBox(ctx, x, y, "#e24b4b", C.redDark, { glow: C.gold });
    // Ruban
    ctx.fillStyle = C.gold;
    ctx.fillRect(x + CELL / 2 - 9, y, 18, CELL);
    ctx.fillRect(x, y + CELL / 2 - 9, CELL, 18);
    // Nœud
    ctx.save();
    ctx.translate(x + CELL / 2, y + CELL / 2);
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 18, -6, 18, 10, side * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = C.gold;
        ctx.fill();
        ctx.strokeStyle = C.goldDark;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = C.goldDark;
    ctx.fill();
    ctx.restore();
    // Bordure dorée
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 16);
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 4;
    ctx.stroke();
    // Numéro dans une pastille
    ctx.beginPath();
    ctx.arc(x + 30, y + 30, 21, 0, Math.PI * 2);
    ctx.fillStyle = C.snow;
    ctx.fill();
    ctx.font = "22px Poppins";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.redDark;
    ctx.fillText(String(day), x + 30, y + 32);
    // Bandeau
    ctx.beginPath();
    ctx.roundRect(x + 16, y + CELL - 32, CELL - 32, 22, 11);
    ctx.fillStyle = C.snow;
    ctx.fill();
    ctx.font = "14px Poppins";
    ctx.fillStyle = C.redDark;
    ctx.fillText("À OUVRIR", x + CELL / 2, y + CELL - 20);
}

function missedCell(ctx, x, y, day) {
    cellBox(ctx, x, y, C.missed, "#20232b");
    dayNumber(ctx, x, y, day, "rgba(255,255,255,0.28)");
    ctx.strokeStyle = "rgba(242,84,91,0.55)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    const m = 46;
    ctx.beginPath();
    ctx.moveTo(x + m, y + m + 8);
    ctx.lineTo(x + CELL - m, y + CELL - m + 8);
    ctx.moveTo(x + CELL - m, y + m + 8);
    ctx.lineTo(x + m, y + CELL - m + 8);
    ctx.stroke();
    ctx.lineCap = "butt";
}

function lockedCell(ctx, x, y, day) {
    cellBox(ctx, x, y, C.locked, C.lockedDark);
    // Double porte
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + CELL / 2, y + 14);
    ctx.lineTo(x + CELL / 2, y + CELL - 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x + 10, y + 10, CELL - 20, CELL - 20, 12);
    ctx.stroke();
    dayNumber(ctx, x, y, day, "rgba(255,255,255,0.85)");
    // Cadenas
    const cx = x + CELL / 2;
    const cy = y + CELL / 2 + 20;
    ctx.strokeStyle = "#6f7fa6";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 10, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(cx - 15, cy - 10, 30, 24, 5);
    ctx.fillStyle = "#6f7fa6";
    ctx.fill();
}

function progress(ctx, opened, total) {
    const y = GRID_Y + 4 * CELL + 3 * GAP + 30;
    const x = GRID_X;
    const w = W - 2 * GRID_X;
    const h = 22;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    if (opened > 0) {
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, C.red);
        g.addColorStop(1, C.gold);
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(h, (w * opened) / ADVENT.DAYS), h, h / 2);
        ctx.fillStyle = g;
        ctx.fill();
    }
    ctx.font = "22px Poppins";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = C.text;
    ctx.fillText(`${opened}/${ADVENT.DAYS} cases ouvertes`, x, y + 32);
    ctx.textAlign = "right";
    ctx.fillStyle = C.gold;
    ctx.fillText(`${nf(total)} $ gagnés`, x + w, y + 32);
}

// doors : cases ouvertes ({ day, money, golden }) ; today : case du jour (0 = pas encore, 25 = terminé)
async function renderAdvent({ year, doors, today, user, subtitle }) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    sky(ctx);
    garland(ctx);
    await header(ctx, { year, user, subtitle });

    const byDay = new Map(doors.map((d) => [d.day, d]));
    for (let day = 1; day <= ADVENT.DAYS; day++) {
        const col = (day - 1) % COLS;
        const row = Math.floor((day - 1) / COLS);
        const x = GRID_X + col * (CELL + GAP);
        const y = GRID_Y + row * (CELL + GAP);
        const door = byDay.get(day);
        if (door) openedCell(ctx, x, y, { ...door, day });
        else if (day === today) todayCell(ctx, x, y, day);
        else if (day < today) missedCell(ctx, x, y, day);
        else lockedCell(ctx, x, y, day);
        if (SPECIAL_DOORS[day] && day !== today) {
            ctx.shadowColor = C.gold;
            ctx.shadowBlur = 10;
            star(ctx, x + CELL - 22, y + CELL - 22, 13, 6, C.gold);
            ctx.shadowBlur = 0;
        }
    }

    progress(
        ctx,
        doors.length,
        doors.reduce((sum, d) => sum + d.money, 0)
    );

    return new AttachmentBuilder(await canvas.encode("png"), { name: "calendrier.png" });
}

module.exports = { renderAdvent };
