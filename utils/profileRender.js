const fs = require("fs");
const path = require("path");

const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

/*
==================================================
CARTE DE PROFIL
- Fond : avatar flouté teinté de la couleur du niveau
- En-tête : avatar, nom, badges, rang et niveau
- Barre d'XP, 6 tuiles de statistiques, bandeau entreprise
==================================================
*/

if (!GlobalFonts.has("Poppins")) {
    GlobalFonts.registerFromPath(path.join(__dirname, "../assets/fonts/Poppins-Bold.ttf"), "Poppins");
}

const W = 1200;
const H = 680;
const PAD = 48;

const ICON_NAMES = ["money", "bank", "message", "mic", "trophy", "calendar", "feu"];
let iconsPromise = null;

function getIcons() {
    if (!iconsPromise) {
        iconsPromise = Promise.all(
            ICON_NAMES.map((name) => loadImage(fs.readFileSync(path.join(__dirname, `../assets/icons/${name}.png`))))
        ).then((images) => Object.fromEntries(ICON_NAMES.map((name, i) => [name, images[i]])));
    }
    return iconsPromise;
}

// Les espaces insécables fines de fr-FR ne sont pas dans la police
const nf = (n) => Number(n).toLocaleString("fr-FR").replace(/\s/g, " ");

function hexToRgb(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = (hex, a) => `rgba(${hexToRgb(hex).join(", ")}, ${a})`;

// Éclaircit une couleur (pour les dégradés)
function lighten(hex, amount) {
    const [r, g, b] = hexToRgb(hex).map((c) => Math.round(c + (255 - c) * amount));
    return `rgb(${r}, ${g}, ${b})`;
}

function fit(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
    }
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

function text(ctx, value, x, y, { size = 24, color = "#ffffff", align = "left", max } = {}) {
    ctx.font = `${size}px Poppins`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(max ? fit(ctx, value, max) : value, x, y);
    ctx.textAlign = "left";
}

function drawBackground(ctx, avatar, accent) {
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, W, H);

    // Avatar en fond, très flouté
    if (avatar) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.filter = "blur(48px)";
        const size = W * 1.2;
        ctx.drawImage(avatar, -W * 0.1, (H - size) / 2, size, size);
        ctx.restore();
        ctx.filter = "none";
    }

    // Halo de la couleur du niveau + assombrissement
    const glow = ctx.createRadialGradient(180, 140, 0, 180, 140, 700);
    glow.addColorStop(0, rgba(accent, 0.35));
    glow.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, "rgba(8, 11, 22, 0.55)");
    shade.addColorStop(1, "rgba(8, 11, 22, 0.85)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);

    // Panneau principal façon verre
    roundRect(ctx, 24, 24, W - 48, H - 48, 30, "rgba(16, 21, 38, 0.72)", "rgba(255, 255, 255, 0.07)");
}

function drawAvatar(ctx, avatar, name, x, y, r, accent) {
    // Anneau dégradé avec halo
    ctx.save();
    ctx.shadowColor = rgba(accent, 0.8);
    ctx.shadowBlur = 30;
    const ring = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    ring.addColorStop(0, lighten(accent, 0.45));
    ring.addColorStop(1, accent);
    ctx.beginPath();
    ctx.arc(x, y, r + 7, 0, Math.PI * 2);
    ctx.fillStyle = ring;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = "#101526";
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r - 2, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) {
        ctx.drawImage(avatar, x - r, y - r, r * 2, r * 2);
    } else {
        ctx.fillStyle = "#2c3444";
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        text(ctx, (name || "?").charAt(0).toUpperCase(), x, y + r * 0.35, { size: r, align: "center" });
    }
    ctx.restore();
}

function drawLevelBadge(ctx, level, x, y, accent) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.strokeStyle = "#101526";
    ctx.lineWidth = 5;
    ctx.stroke();
    text(ctx, String(level), x, y + 9, { size: level >= 100 ? 20 : 26, align: "center" });
}

// Pastilles de badges ; renvoie la largeur utilisée
function drawBadges(ctx, badges, x, y, maxWidth) {
    let cx = x;
    ctx.font = "16px Poppins";
    for (const b of badges) {
        const w = ctx.measureText(b.label).width + 40;
        if (cx + w - x > maxWidth) break;
        roundRect(ctx, cx, y, w, 32, 16, rgba(b.color, 0.16), rgba(b.color, 0.45));
        ctx.beginPath();
        ctx.arc(cx + 16, y + 16, 5, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
        text(ctx, b.label, cx + 28, y + 22, { size: 16, color: lighten(b.color, 0.55) });
        cx += w + 10;
    }
}

function drawXpBar(ctx, { xp, max, level }, x, y, w, accent) {
    const ratio = Math.max(0, Math.min(1, xp / max));
    text(ctx, `Progression vers le niveau ${level + 1}`, x, y, { size: 18, color: "#8b95a8" });
    text(ctx, `${nf(xp)} / ${nf(max)} XP  ·  ${Math.floor(ratio * 100)} %`, x + w, y, {
        size: 18,
        color: "#c9d1e0",
        align: "right"
    });

    const by = y + 14;
    const h = 22;
    roundRect(ctx, x, by, w, h, h / 2, "rgba(255, 255, 255, 0.07)");
    if (ratio > 0) {
        const fillW = Math.max(h, w * ratio);
        const grad = ctx.createLinearGradient(x, 0, x + fillW, 0);
        grad.addColorStop(0, accent);
        grad.addColorStop(1, lighten(accent, 0.4));
        ctx.save();
        ctx.shadowColor = rgba(accent, 0.7);
        ctx.shadowBlur = 16;
        roundRect(ctx, x, by, fillW, h, h / 2, grad);
        ctx.restore();
        // Reflet
        roundRect(ctx, x + 4, by + 3, Math.max(0, fillW - 8), h / 3, h / 6, "rgba(255, 255, 255, 0.22)");
    }
}

function drawTile(ctx, { icon, label, value, sub, dots }, x, y, w, h, accent) {
    roundRect(ctx, x, y, w, h, 20, "rgba(255, 255, 255, 0.045)", "rgba(255, 255, 255, 0.06)");

    // Pastille d'icône
    roundRect(ctx, x + 18, y + (h - 56) / 2, 56, 56, 16, rgba(accent, 0.16));
    ctx.drawImage(icon, x + 30, y + (h - 32) / 2, 32, 32);

    const tx = x + 92;
    const tw = w - 92 - 18;
    text(ctx, label.toUpperCase(), tx, y + 36, { size: 14, color: "#7f8aa0" });
    text(ctx, value, tx, y + 70, { size: 26, max: tw });

    if (dots) {
        for (let i = 0; i < dots.max; i++) {
            ctx.beginPath();
            ctx.arc(tx + 6 + i * 16, y + 86, 5, 0, Math.PI * 2);
            ctx.fillStyle = i < dots.value ? accent : "rgba(255, 255, 255, 0.12)";
            ctx.fill();
        }
    } else if (sub) {
        text(ctx, sub, tx, y + 92, { size: 14, color: "#7f8aa0", max: tw });
    }
}

function drawBusiness(ctx, business, icons, x, y, w, h, accent) {
    const color = business ? accent : "#5c6578";
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, rgba(color, business ? 0.22 : 0.1));
    grad.addColorStop(1, "rgba(255, 255, 255, 0.03)");
    roundRect(ctx, x, y, w, h, 20, grad, rgba(color, 0.35));

    ctx.drawImage(icons.bank, x + 22, y + (h - 36) / 2, 36, 36);
    text(ctx, business ? (business.owner ? "PATRON" : "EMPLOYÉ") : "ENTREPRISE", x + 76, y + 30, {
        size: 13,
        color: business ? lighten(accent, 0.5) : "#7f8aa0"
    });
    text(ctx, business ? business.name : "Aucune entreprise", x + 76, y + 58, {
        size: 24,
        color: business ? "#ffffff" : "#8b95a8",
        max: w * 0.45
    });
    text(ctx, business ? business.detail : "Fonde la tienne avec /entreprise creer", x + w - 24, y + 50, {
        size: 17,
        color: "#c9d1e0",
        align: "right",
        max: w * 0.45
    });
}

/**
 * data : { username, displayName, avatarUrl, accent, level, xp, xpMax, rank, money, bank,
 *          messages, voiceSeconds, dailyStreak, dailyMax, joinedAt, memberDays, badges, business }
 */
async function renderProfile(data) {
    const icons = await getIcons();
    const avatar = data.avatarUrl ? await loadImage(data.avatarUrl).catch(() => null) : null;
    const accent = data.accent;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    drawBackground(ctx, avatar, accent);

    // ---------- En-tête ----------
    const ax = PAD + 92;
    const ay = 140;
    drawAvatar(ctx, avatar, data.username, ax, ay, 82, accent);
    drawLevelBadge(ctx, data.level, ax + 62, ay + 62, accent);

    const nx = ax + 120;
    const handle = data.displayName !== data.username ? `@${data.username}  ·  ` : "";
    const since = `${handle}membre depuis ${data.memberDays} jour${data.memberDays > 1 ? "s" : ""}`;

    if (data.title) {
        // Avec titre : nom, titre (couleur de rareté, lumineux), puis la ligne d'infos
        text(ctx, data.displayName, nx, 104, { size: 44, max: 560 });
        ctx.save();
        ctx.shadowColor = rgba(data.title.color, 0.75);
        ctx.shadowBlur = 14;
        text(ctx, `« ${data.title.name} »`, nx, 140, { size: 24, color: lighten(data.title.color, 0.15), max: 560 });
        ctx.restore();
        text(ctx, since, nx, 170, { size: 16, color: "#8b95a8", max: 560 });
        drawBadges(ctx, data.badges, nx, 184, 600);
    } else {
        text(ctx, data.displayName, nx, 118, { size: 46, max: 560 });
        text(ctx, since, nx, 154, { size: 18, color: "#8b95a8", max: 560 });
        drawBadges(ctx, data.badges, nx, 178, 600);
    }

    // Rang et niveau à droite
    const rx = W - PAD - 10;
    text(ctx, "RANG", rx - 150, 92, { size: 14, color: "#7f8aa0", align: "right" });
    text(ctx, `#${data.rank ?? "—"}`, rx - 150, 148, { size: 50, color: lighten(accent, 0.25), align: "right" });
    text(ctx, "NIVEAU", rx, 92, { size: 14, color: "#7f8aa0", align: "right" });
    text(ctx, String(data.level), rx, 148, { size: 50, align: "right" });

    // ---------- XP ----------
    drawXpBar(ctx, { xp: data.xp, max: data.xpMax, level: data.level }, PAD, 268, W - PAD * 2, accent);

    // ---------- Tuiles ----------
    const hours = Math.floor(data.voiceSeconds / 3600);
    const minutes = Math.floor((data.voiceSeconds % 3600) / 60);
    const tiles = [
        { icon: icons.money, label: "Argent", value: `${nf(data.money)} $`, sub: "En poche" },
        {
            icon: icons.bank,
            label: "Banque",
            value: `${nf(data.bank)} $`,
            sub: `Patrimoine : ${nf(data.money + data.bank)} $`
        },
        {
            icon: icons.feu,
            label: "Série daily",
            value: `${data.dailyStreak} / ${data.dailyMax}`,
            dots: { value: data.dailyStreak, max: data.dailyMax }
        },
        { icon: icons.message, label: "Messages", value: nf(data.messages), sub: "Envoyés sur le serveur" },
        {
            icon: icons.mic,
            label: "Vocal",
            value: `${hours} h ${String(minutes).padStart(2, "0")}`,
            sub: "Temps total"
        },
        {
            icon: icons.calendar,
            label: "Arrivée",
            value: data.joinedAt ? data.joinedAt.toLocaleDateString("fr-FR") : "—",
            sub: "Date d'arrivée"
        }
    ];
    const gap = 20;
    const tw = (W - PAD * 2 - gap * 2) / 3;
    const th = 104;
    tiles.forEach((t, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        drawTile(ctx, t, PAD + col * (tw + gap), 318 + row * (th + gap), tw, th, accent);
    });

    // ---------- Entreprise ----------
    drawBusiness(ctx, data.business, icons, PAD, 566, W - PAD * 2, 70, accent);

    return canvas.encode("png");
}

module.exports = { renderProfile };
