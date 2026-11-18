const fs = require("fs");
const path = require("path");

const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");

const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const { xpForLevel, levelColor } = require("../utils/levels");
const { monthKey } = require("../utils/business");

GlobalFonts.registerFromPath(path.join(__dirname, "../assets/fonts/Poppins-Bold.ttf"), "Poppins");

// Icônes chargées une seule fois puis gardées en mémoire
const ICON_NAMES = ["money", "bank", "message", "mic", "trophy", "calendar"];
let iconsPromise = null;

function getIcons() {
    if (!iconsPromise) {
        iconsPromise = Promise.all(
            ICON_NAMES.map((name) => loadImage(fs.readFileSync(path.join(__dirname, `../assets/icons/${name}.png`))))
        ).then((images) => Object.fromEntries(ICON_NAMES.map((name, i) => [`${name}Icon`, images[i]])));
    }
    return iconsPromise;
}

// Coupe le texte avec « … » s'il dépasse la largeur disponible
function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
}

const fmt = (n) => `${n.toLocaleString("fr-FR")} $`;

function businessInfo(economy, userId) {
    const owned = economy.getBusinessByOwner(userId);
    if (owned) {
        const { stats, employees } = economy.getBusinessView(owned.id);
        return {
            owner: true,
            name: owned.name,
            detail: `Patron · ${fmt(stats.hourly)}/h · ${employees.length} employé(s) · ${stats.botCount} robot(s)`
        };
    }
    const job = economy.getEmployment(userId);
    if (!job) return null;
    const month = monthKey();
    const rank = economy.monthRanking(job.businessId, month).findIndex((r) => r.userId === userId);
    const awards = economy.recentAwards(job.businessId, 100).filter((a) => a.userId === userId).length;
    const parts = [`Employé · ${fmt(job.contributed)} rapportés`];
    if (rank >= 0) parts.push(rank === 0 ? "1er du mois" : `${rank + 1}e du mois`);
    if (awards) parts.push(`${awards}x employé du mois`);
    return { owner: false, name: job.name, detail: parts.join(" · ") };
}

module.exports = {
    data: new SlashCommandBuilder()

        .setName("profil")

        .setDescription("Affiche ton profil")

        .addUserOption((option) => option.setName("joueur").setDescription("Le joueur").setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const user = interaction.options.getUser("joueur") || interaction.user;
        if (user.bot) {
            return interaction.editReply({ content: "❌ Les bots n'ont pas de profil." });
        }

        const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
        const economy = interaction.client.economy;
        const data = economy.getUser(user.id);
        const rank = economy.levelRank(user.id);

        const { moneyIcon, bankIcon, messageIcon, micIcon, trophyIcon, calendarIcon } = await getIcons();

        const canvas = createCanvas(1100, 650);
        const ctx = canvas.getContext("2d");

        // ==========================
        // FOND
        // ==========================

        const gradient = ctx.createLinearGradient(0, 0, 1100, 650);

        gradient.addColorStop(0, "#0f172a");

        gradient.addColorStop(1, "#1e293b");

        ctx.fillStyle = gradient;

        ctx.fillRect(0, 0, 1100, 650);

        ctx.beginPath();

        ctx.roundRect(30, 30, 1040, 590, 30);

        ctx.fillStyle = "#161d29";

        ctx.fill();

        // ==========================
        // COULEUR DU NIVEAU
        // ==========================

        const accent = levelColor(data.level);

        ctx.fillStyle = accent;

        ctx.fillRect(30, 30, 1040, 10);

        // ==========================
        // AVATAR
        // ==========================

        const avatar = await loadImage(
            user.displayAvatarURL({
                extension: "png",

                forceStatic: true,

                size: 512
            })
        );

        // Contour

        ctx.beginPath();

        ctx.arc(120, 120, 78, 0, Math.PI * 2);

        ctx.fillStyle = accent;

        ctx.fill();

        // Avatar rond

        ctx.save();

        ctx.beginPath();

        ctx.arc(120, 120, 70, 0, Math.PI * 2);

        ctx.closePath();

        ctx.clip();

        ctx.drawImage(avatar, 50, 50, 140, 140);

        ctx.restore();

        // ==========================
        // NOM
        // ==========================

        ctx.fillStyle = "white";

        ctx.font = "bold 42px Poppins";

        ctx.fillText(user.username, 240, 110);

        // ==========================
        // NIVEAU
        // ==========================

        ctx.font = "24px Poppins";

        ctx.fillStyle = "#b8c1cc";

        ctx.fillText("Niveau", 240, 160);

        ctx.font = "bold 30px Poppins";

        ctx.fillStyle = accent;

        ctx.fillText(String(data.level), 350, 160);

        // ==========================
        // BARRE XP
        // ==========================

        const maxXP = xpForLevel(data.level);

        const percent = Math.min(data.xp / maxXP, 1);

        ctx.beginPath();

        ctx.roundRect(240, 190, 420, 28, 14);

        ctx.fillStyle = "#2c3444";

        ctx.fill();

        ctx.beginPath();

        ctx.roundRect(240, 190, 420 * percent, 28, 14);

        ctx.fillStyle = accent;

        ctx.fill();

        ctx.fillStyle = "white";

        ctx.font = "18px Poppins";

        ctx.fillText(`${data.xp} / ${maxXP} XP`, 360, 210);
        // ==========================
        // COLONNE DE DROITE
        // ==========================

        const days = Math.floor((Date.now() - (member?.joinedTimestamp ?? Date.now())) / 86400000);

        // Rang
        ctx.drawImage(trophyIcon, 720, 75, 30, 30);

        ctx.fillStyle = "#aab4c3";
        ctx.font = "22px Poppins";
        ctx.fillText("Rang", 765, 98);

        ctx.fillStyle = "white";
        ctx.font = "bold 28px Poppins";
        ctx.fillText(`#${rank}`, 930, 98);

        // Daily
        ctx.drawImage(calendarIcon, 720, 145, 30, 30);

        ctx.fillStyle = "#aab4c3";
        ctx.font = "22px Poppins";
        ctx.fillText("Daily", 765, 168);

        ctx.fillStyle = "white";
        ctx.font = "bold 28px Poppins";
        ctx.fillText(`${data.dailyStreak}/10`, 930, 168);

        // Depuis
        ctx.drawImage(micIcon, 720, 215, 30, 30);

        ctx.fillStyle = "#aab4c3";
        ctx.font = "22px Poppins";
        ctx.fillText("Depuis", 765, 238);

        ctx.fillStyle = "white";
        ctx.font = "bold 28px Poppins";
        ctx.fillText(`${days} jours`, 930, 238);

        // Ligne de séparation

        ctx.strokeStyle = "#2d3748";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(60, 290);
        ctx.lineTo(1040, 290);
        ctx.stroke();
        // ==========================
        // STATISTIQUES
        // ==========================

        const voice = data.voiceTime || 0;

        const hours = Math.floor(voice / 3600);

        const minutes = Math.floor((voice % 3600) / 60);

        // Argent

        ctx.drawImage(moneyIcon, 60, 340, 30, 30);

        ctx.fillStyle = "#aab4c3";
        ctx.font = "22px Poppins";
        ctx.fillText("Argent", 105, 364);

        ctx.fillStyle = "white";
        ctx.font = "bold 24px Poppins";
        ctx.fillText(`${data.money.toLocaleString()} $`, 250, 364);

        // Banque

        ctx.drawImage(bankIcon, 60, 410, 30, 30);

        ctx.fillStyle = "#aab4c3";
        ctx.font = "22px Poppins";
        ctx.fillText("Banque", 105, 434);

        ctx.fillStyle = "white";
        ctx.font = "bold 24px Poppins";
        ctx.fillText(`${(data.bank || 0).toLocaleString()} $`, 250, 434);

        // Messages

        ctx.drawImage(messageIcon, 60, 480, 30, 30);

        ctx.fillStyle = "#aab4c3";
        ctx.font = "22px Poppins";
        ctx.fillText("Messages", 105, 504);

        ctx.fillStyle = "white";
        ctx.font = "bold 24px Poppins";
        ctx.fillText(`${(data.messages || 0).toLocaleString()}`, 250, 504);

        // Vocal

        ctx.drawImage(micIcon, 560, 340, 30, 30);

        ctx.fillStyle = "#aab4c3";
        ctx.font = "22px Poppins";
        ctx.fillText("Vocal", 605, 364);

        ctx.fillStyle = "white";
        ctx.font = "bold 24px Poppins";
        ctx.fillText(`${hours}h ${minutes}m`, 760, 364);

        // Arrivée

        ctx.drawImage(calendarIcon, 560, 410, 30, 30);

        ctx.fillStyle = "#aab4c3";
        ctx.font = "22px Poppins";
        ctx.fillText("Arrivé", 605, 434);

        ctx.fillStyle = "white";
        ctx.font = "bold 24px Poppins";
        ctx.fillText(member?.joinedAt ? member.joinedAt.toLocaleDateString("fr-FR") : "—", 760, 434);

        // Entreprise (patron ou employé)

        const business = businessInfo(economy, user.id);

        ctx.drawImage(bankIcon, 560, 480, 30, 30);

        ctx.fillStyle = "#aab4c3";
        ctx.font = "22px Poppins";
        ctx.fillText("Entreprise", 605, 504);

        ctx.fillStyle = business ? "white" : "#6b7585";
        ctx.font = "bold 24px Poppins";
        ctx.fillText(fitText(ctx, business ? business.name : "Aucune", 270), 760, 504);

        if (business) {
            ctx.fillStyle = business.owner ? accent : "#aab4c3";
            ctx.font = "18px Poppins";
            ctx.fillText(fitText(ctx, business.detail, 430), 605, 538);
        }

        // ==========================
        // ENVOI
        // ==========================

        const attachment = new AttachmentBuilder(await canvas.encode("png"), {
            name: "profil.png"
        });

        await interaction.editReply({ files: [attachment] });
    }
};
