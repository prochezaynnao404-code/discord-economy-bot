const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");

const { xpForLevel, formatBonus, levelColor, announceSettings } = require("./levels");

/*
==================================================
IMAGES DES NIVEAUX
- carte de passage de niveau (annonce)
- carte de rang (/niveaux voir)
==================================================
*/

if (!GlobalFonts.has("DejaVu")) {
    GlobalFonts.registerFromPath(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"), "DejaVu");
}
if (!GlobalFonts.has("DejaVuBold")) {
    GlobalFonts.registerFromPath(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"), "DejaVuBold");
}

const nf = (n) => n.toLocaleString("fr-FR").replace(/\s/g, " ");

// Avatar rond ; si le téléchargement échoue, un disque avec l'initiale
async function drawAvatar(ctx, url, name, x, y, r, accent) {
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();

    let image = null;
    if (url) image = await loadImage(url).catch(() => null);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    if (image) {
        ctx.drawImage(image, x - r, y - r, r * 2, r * 2);
    } else {
        ctx.fillStyle = "#2c3444";
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.fillStyle = "white";
        ctx.font = `${Math.round(r)}px DejaVuBold`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((name || "?").charAt(0).toUpperCase(), x, y + 2);
    }
    ctx.restore();
}

function background(ctx, w, h, accent) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#0f172a");
    g.addColorStop(1, "#1e293b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.roundRect(16, 16, w - 32, h - 32, 22);
    ctx.fillStyle = "#161d29";
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(16, 16, w - 32, 8, [22, 22, 0, 0]);
    ctx.fill();
}

// Coupe un texte trop long avec « … »
function fit(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t}…`;
}

function progressBar(ctx, x, y, w, h, ratio, accent) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = "#2c3444";
    ctx.fill();
    const filled = Math.max(h, w * Math.min(Math.max(ratio, 0), 1));
    if (ratio > 0) {
        ctx.beginPath();
        ctx.roundRect(x, y, filled, h, h / 2);
        ctx.fillStyle = accent;
        ctx.fill();
    }
}

// ---------- Passage de niveau ----------

async function levelUpCard({ name, avatarURL, level, previous }) {
    const W = 900;
    const H = 260;
    const accent = levelColor(level);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    background(ctx, W, H, accent);

    await drawAvatar(ctx, avatarURL, name, 140, 135, 80, accent);

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#b8c1cc";
    ctx.font = "26px DejaVu";
    ctx.fillText("NIVEAU SUPÉRIEUR !", 260, 80);

    ctx.fillStyle = "white";
    ctx.font = "38px DejaVuBold";
    ctx.fillText(fit(ctx, name, 370), 260, 128);

    // Ancien niveau → nouveau niveau
    ctx.font = "30px DejaVuBold";
    ctx.fillStyle = "#6b7686";
    const from = String(previous);
    ctx.fillText(from, 260, 190);
    let x = 260 + ctx.measureText(from).width + 14;
    ctx.fillStyle = "#b8c1cc";
    ctx.fillText("→", x, 190);
    x += ctx.measureText("→").width + 14;
    ctx.fillStyle = accent;
    ctx.font = "54px DejaVuBold";
    ctx.fillText(String(level), x, 194);

    // Pastille du bonus
    const label = `Bonus ${formatBonus(level)}`;
    ctx.font = "24px DejaVuBold";
    const bw = ctx.measureText(label).width + 40;
    ctx.beginPath();
    ctx.roundRect(W - 50 - bw, 160, bw, 46, 23);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(label, W - 50 - bw / 2, 191);

    return new AttachmentBuilder(await canvas.encode("png"), { name: "niveau.png" });
}

// ---------- Carte de rang ----------

async function rankCard({ name, avatarURL, level, xp, rank, totalXp }) {
    const W = 900;
    const H = 280;
    const accent = levelColor(level);
    const needed = xpForLevel(level);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    background(ctx, W, H, accent);

    await drawAvatar(ctx, avatarURL, name, 140, 140, 85, accent);

    ctx.fillStyle = "white";
    ctx.font = "38px DejaVuBold";
    ctx.fillText(fit(ctx, name, 330), 265, 90);

    // Rang et niveau à droite
    ctx.textAlign = "right";
    ctx.font = "44px DejaVuBold";
    ctx.fillStyle = accent;
    const lvl = String(level);
    ctx.fillText(lvl, W - 50, 92);
    let x = W - 50 - ctx.measureText(lvl).width - 10;
    ctx.font = "22px DejaVu";
    ctx.fillStyle = "#b8c1cc";
    ctx.fillText("NIVEAU", x, 92);
    x -= ctx.measureText("NIVEAU").width + 26;
    ctx.font = "44px DejaVuBold";
    ctx.fillStyle = "white";
    const rk = rank ? `#${rank}` : "—";
    ctx.fillText(rk, x, 92);
    x -= ctx.measureText(rk).width + 10;
    ctx.font = "22px DejaVu";
    ctx.fillStyle = "#b8c1cc";
    ctx.fillText("RANG", x, 92);

    // Barre d'XP
    ctx.textAlign = "left";
    ctx.font = "22px DejaVu";
    ctx.fillStyle = "#b8c1cc";
    ctx.fillText(`XP totale : ${nf(totalXp)}`, 265, 150);
    ctx.textAlign = "right";
    ctx.fillStyle = "white";
    ctx.fillText(`${nf(xp)} / ${nf(needed)} XP`, W - 50, 150);
    progressBar(ctx, 265, 166, W - 315, 34, xp / needed, accent);

    ctx.textAlign = "left";
    ctx.font = "22px DejaVuBold";
    ctx.fillStyle = accent;
    ctx.fillText(`Bonus de gains ${formatBonus(level)}`, 265, 240);
    ctx.textAlign = "right";
    ctx.font = "18px DejaVu";
    ctx.fillStyle = "#8a94a6";
    ctx.fillText(`encore ${nf(needed - xp)} XP → niv. ${level + 1}`, W - 50, 240);

    return new AttachmentBuilder(await canvas.encode("png"), { name: "rang.png" });
}

// ---------- Annonce ----------

// Envoie l'annonce dans le salon configuré du serveur, sinon dans `fallback`.
async function announceLevelUp({ economy, guild, user, level, previous, fallback = null }) {
    const settings = announceSettings(economy, guild.id);
    if (!settings.enabled) return;

    let channel = settings.channelId ? guild.channels.cache.get(settings.channelId) : null;
    if (!channel?.isTextBased?.()) channel = fallback;
    if (!channel?.isTextBased?.()) return;

    const me = guild.members.me;
    const perms = me ? channel.permissionsFor(me) : null;
    if (perms && !perms.has(["SendMessages", "AttachFiles"])) return;

    const name = guild.members.cache.get(user.id)?.displayName || user.username;
    const card = await levelUpCard({
        name,
        avatarURL: user.displayAvatarURL({ extension: "png", forceStatic: true, size: 256 }),
        level,
        previous
    });
    await channel.send({
        content: `🎉 ${user} passe au **niveau ${level}** ! Bonus de gains : **${formatBonus(level)}**`,
        files: [card],
        allowedMentions: { parse: [] }
    });
}

module.exports = { levelUpCard, rankCard, announceLevelUp };
