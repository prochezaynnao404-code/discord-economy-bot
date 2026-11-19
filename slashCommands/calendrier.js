const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { EPHEMERAL, money } = require("../utils/helpers");
const { levelBonus } = require("../utils/levels");
const { ADVENT, calendarState } = require("../utils/advent");
const { renderAdvent } = require("../utils/adventRender");
const { syncTitles, newTitlesText } = require("../utils/titles");

const MEDALS = ["🥇", "🥈", "🥉"];
const NO_PINGS = { parse: [] };

// Case du jour pour le dessin : 0 = pas encore commencé, 25 = terminé
function todayOf(state) {
    if (state.phase === "ouvert") return state.day;
    return state.phase === "termine" ? ADVENT.DAYS + 1 : 0;
}

// Image + embed du calendrier
async function calendarView(economy, user, state) {
    const doors = economy.getAdventDoors(user.id, state.year);
    const openedToday = state.phase === "ouvert" && doors.some((d) => d.day === state.day);

    let subtitle;
    let status;
    if (state.phase === "avant") {
        subtitle = `${user.username} · ouverture le 1er décembre`;
        status = `🔒 Le calendrier ouvre le **1er décembre**, <t:${Math.floor(state.startsAt / 1000)}:R>.`;
    } else if (state.phase === "termine") {
        subtitle = `${user.username} · Joyeux Noël !`;
        status = "🎅 Le calendrier est terminé. **Joyeux Noël !**";
    } else if (openedToday) {
        subtitle = `${user.username} · reviens demain !`;
        status = "✅ Case du jour ouverte. Reviens demain pour la suivante !";
    } else {
        subtitle = `${user.username} · case n°${state.day} à ouvrir`;
        status = `🎁 La case n°**${state.day}** t'attend ! Clique sur le bouton pour l'ouvrir.`;
    }

    const image = await renderAdvent({
        year: state.year,
        doors,
        today: todayOf(state),
        user: { name: user.username, avatarURL: user.displayAvatarURL({ extension: "png", size: 128 }) },
        subtitle
    });
    const embed = new EmbedBuilder()
        .setColor("DarkRed")
        .setTitle(`🎄 Calendrier de l'Avent ${state.year}`)
        .setDescription(
            `${status}\n\n` +
                `🎫 Ticket d'or : gains ×${ADVENT.GOLDEN_MULTIPLIER} · ⭐ cases spéciales les 6, 12, 18 et 24\n` +
                `🛷 Les ${ADVENT.DAYS} cases : hotte complète **+${money(ADVENT.FULL_BONUS)}** et titre **Père Noël**`
        )
        .setImage("attachment://calendrier.png");
    return { embeds: [embed], files: [image] };
}

function openRow(state) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("advent:open")
            .setLabel(`Ouvrir la case n°${state.day}`)
            .setEmoji("🎁")
            .setStyle(ButtonStyle.Success)
    );
}

function rewardEmbed(result, user, titles) {
    const { door } = result;
    const base = result.money - (result.full ? ADVENT.FULL_BONUS : 0);
    const lines = [`💰 **+${money(base)}**   ✨ **+${result.xp} XP**`];
    if (result.golden) lines.push(`🎫 **Ticket d'or !** Gains ×${ADVENT.GOLDEN_MULTIPLIER} !`);
    if (result.full) lines.push(`🛷 **Hotte complète !** 24/24 cases : **+${money(ADVENT.FULL_BONUS)}** !`);
    if (result.level.leveledUp) lines.push(`⬆️ Niveau **${result.level.level}** atteint !`);
    if (titles) lines.push(titles);
    return new EmbedBuilder()
        .setColor(result.golden || door.special ? "Gold" : "DarkGreen")
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setTitle(`${door.emoji} Case n°${door.day} : ${door.label}${door.special ? " ✨" : ""}`)
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: `${result.opened}/${ADVENT.DAYS} cases ouvertes` });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("calendrier")
        .setDescription("Calendrier de l'Avent : une surprise chaque jour du 1er au 24 décembre")
        .addSubcommand((s) => s.setName("ouvrir").setDescription("Voir ton calendrier et ouvrir la case du jour"))
        .addSubcommand((s) => s.setName("classement").setDescription("Les plus assidus du calendrier")),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const user = interaction.user;
        const state = calendarState();

        if (interaction.options.getSubcommand() === "classement") {
            const top = economy.topAdvent(state.year, 10);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("DarkRed")
                        .setTitle(`🏆 Calendrier de l'Avent ${state.year}`)
                        .setDescription(
                            top
                                .map(
                                    (u, i) =>
                                        `${MEDALS[i] || `**${i + 1}.**`} <@${u.userId}> — ${u.doors}/${ADVENT.DAYS} cases · ${money(u.money)}`
                                )
                                .join("\n") || "_Personne n'a encore ouvert de case._"
                        )
                ],
                allowedMentions: NO_PINGS
            });
        }

        // Le rendu de l'image peut dépasser les 3 s accordées par Discord
        await interaction.deferReply(state.phase === "avant" ? { flags: EPHEMERAL } : {});
        const canOpen =
            state.phase === "ouvert" && !economy.getAdventDoors(user.id, state.year).some((d) => d.day === state.day);

        const message = await interaction.editReply({
            ...(await calendarView(economy, user, state)),
            components: canOpen ? [openRow(state)] : []
        });
        if (!canOpen) return;

        const collector = message.createMessageComponentCollector({ idle: 3 * 60 * 1000 });
        collector.on("collect", async (i) => {
            try {
                if (i.user.id !== user.id) {
                    return i.reply({
                        content: "❌ Ouvre ton propre calendrier avec `/calendrier ouvrir`.",
                        flags: EPHEMERAL
                    });
                }
                // Le jour a pu changer depuis l'affichage (minuit passé)
                const now = calendarState();
                if (now.phase !== "ouvert" || now.day !== state.day) {
                    collector.stop();
                    return i.reply({
                        content: "⏰ Cette case n'est plus disponible, relance `/calendrier ouvrir`.",
                        flags: EPHEMERAL
                    });
                }
                const { level } = economy.getUser(user.id);
                const result = economy.openAdventDoor(user.id, state.year, state.day, {
                    multiplier: 1 + levelBonus(level)
                });
                if (!result.ok) {
                    collector.stop();
                    return i.reply({ content: "✅ Tu as déjà ouvert la case du jour.", flags: EPHEMERAL });
                }
                const titles = newTitlesText(syncTitles(economy, user.id));
                collector.stop();
                await i.deferUpdate();
                await i.editReply({ ...(await calendarView(economy, user, state)), attachments: [], components: [] });
                await i.followUp({ embeds: [rewardEmbed(result, user, titles)], allowedMentions: NO_PINGS });
            } catch (err) {
                console.error("❌ Erreur calendrier :", err);
                i.reply({ content: "❌ Une erreur est survenue.", flags: EPHEMERAL }).catch(() => {});
            }
        });
        collector.on("end", () => interaction.editReply({ components: [] }).catch(() => {}));
    }
};
