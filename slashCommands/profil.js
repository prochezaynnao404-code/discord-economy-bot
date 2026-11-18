const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { xpForLevel, levelColor } = require("../utils/levels");
const { monthKey } = require("../utils/business");
const { ivresseState } = require("../utils/bar");
const { renderProfile } = require("../utils/profileRender");
const { RARITIES, syncTitles, equippedTitle, newTitlesText } = require("../utils/titles");

const fmt = (n) => `${Number(n).toLocaleString("fr-FR").replace(/\s/g, " ")} $`;

const BADGE_COLORS = {
    gold: "#f7c948",
    amber: "#d9a441",
    purple: "#a77bf3",
    blue: "#5b8def",
    green: "#43c59e",
    red: "#f2545b"
};

function businessInfo(economy, userId) {
    const owned = economy.getBusinessByOwner(userId);
    if (owned) {
        const { stats, employees } = economy.getBusinessView(owned.id);
        return {
            owner: true,
            name: owned.name,
            detail: `${fmt(stats.hourly)}/h  ·  ${employees.length} employé(s)  ·  ${stats.botCount} robot(s)`
        };
    }
    const job = economy.getEmployment(userId);
    if (!job) return null;
    const rank = economy.monthRanking(job.businessId, monthKey()).findIndex((r) => r.userId === userId);
    const parts = [`${fmt(job.contributed)} rapportés`];
    if (rank >= 0) parts.push(rank === 0 ? "1er du mois" : `${rank + 1}e du mois`);
    return { owner: false, name: job.name, detail: parts.join("  ·  ") };
}

// Badges affichés sous le nom (les plus prestigieux d'abord)
function badgesFor(economy, data, rank, business) {
    const badges = [];
    if (data.level <= 1 && data.xp === 0) rank = null; // pas de badge de rang sans activité
    if (rank === 1) badges.push({ label: "N°1 du serveur", color: BADGE_COLORS.gold });
    else if (rank && rank <= 3) badges.push({ label: "Top 3", color: BADGE_COLORS.gold });
    else if (rank && rank <= 10) badges.push({ label: "Top 10", color: BADGE_COLORS.blue });

    const awards = economy.countEmployeeAwards(data.userId);
    if (awards) badges.push({ label: `Employé du mois ×${awards}`, color: BADGE_COLORS.gold });
    if (business?.owner) badges.push({ label: "Patron", color: BADGE_COLORS.amber });

    const wealth = data.money + data.bank;
    if (wealth >= 100_000_000) badges.push({ label: "Milliardaire en herbe", color: BADGE_COLORS.purple });
    else if (wealth >= 10_000_000) badges.push({ label: "Multimillionnaire", color: BADGE_COLORS.purple });
    else if (wealth >= 1_000_000) badges.push({ label: "Millionnaire", color: BADGE_COLORS.purple });

    if (data.dailyStreak >= 7) badges.push({ label: "Assidu", color: BADGE_COLORS.green });
    if (data.drinks >= 20) badges.push({ label: "Habitué du bar", color: BADGE_COLORS.amber });

    const drunk = ivresseState(economy.getIvresse(data.userId));
    if (drunk.workFail > 0) badges.push({ label: drunk.label, color: BADGE_COLORS.red });
    return badges;
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
        const fresh = syncTitles(economy, user.id);
        const data = economy.getUser(user.id);
        const title = equippedTitle(data);
        const rank = economy.levelRank(user.id);
        const business = businessInfo(economy, user.id);
        const joinedAt = member?.joinedAt ?? null;

        const png = await renderProfile({
            username: user.username,
            displayName: member?.displayName || user.globalName || user.username,
            avatarUrl: (member ?? user).displayAvatarURL({ extension: "png", forceStatic: true, size: 512 }),
            accent: levelColor(data.level),
            level: data.level,
            xp: data.xp,
            xpMax: xpForLevel(data.level),
            rank,
            money: data.money,
            bank: data.bank || 0,
            messages: data.messages || 0,
            voiceSeconds: data.voiceTime || 0,
            dailyStreak: Math.min(data.dailyStreak, ECONOMY.DAILY_STREAK_MAX),
            dailyMax: ECONOMY.DAILY_STREAK_MAX,
            joinedAt,
            memberDays: joinedAt ? Math.floor((Date.now() - joinedAt.getTime()) / 86400000) : 0,
            badges: badgesFor(economy, data, rank, business),
            title: title && { name: title.name, color: RARITIES[title.rarity].color },
            business
        });

        // Nouveaux titres : on ne l'annonce qu'au joueur concerné
        const notice = user.id === interaction.user.id ? newTitlesText(fresh) : "";
        await interaction.editReply({
            content: notice || undefined,
            files: [new AttachmentBuilder(png, { name: "profil.png" })]
        });
    }
};
