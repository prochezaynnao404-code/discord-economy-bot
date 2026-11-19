const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { EPHEMERAL, money } = require("../utils/helpers");
const { levelBonus } = require("../utils/levels");
const { ADVENT, doorContent, calendarState } = require("../utils/advent");
const { syncTitles, newTitlesText } = require("../utils/titles");

const MEDALS = ["🥇", "🥈", "🥉"];
const NO_PINGS = { parse: [] };

// Grille 4 × 6 : contenu des cases ouvertes, 🎁 aujourd'hui, ❌ ratée, 🔒 à venir
function grid(doors, today) {
    const opened = new Set(doors.map((d) => d.day));
    const lines = [];
    for (let row = 0; row < 4; row++) {
        const cells = [];
        for (let col = 1; col <= 6; col++) {
            const day = row * 6 + col;
            let icon;
            if (opened.has(day)) icon = doorContent(day).emoji;
            else if (day === today) icon = "🎁";
            else if (today && day < today) icon = "❌";
            else icon = "🔒";
            cells.push(`\`${String(day).padStart(2, "0")}\`${icon}`);
        }
        lines.push(cells.join("  "));
    }
    return lines.join("\n");
}

function calendarEmbed(economy, user, state) {
    const doors = economy.getAdventDoors(user.id, state.year);
    const total = doors.reduce((sum, d) => sum + d.money, 0);
    const today = state.phase === "ouvert" ? state.day : state.phase === "termine" ? ADVENT.DAYS + 1 : 0;
    const openedToday = doors.some((d) => d.day === state.day);

    let status;
    if (state.phase === "ouvert") {
        status = openedToday
            ? "✅ Tu as déjà ouvert la case du jour. Reviens demain !"
            : `🎁 La case n°**${state.day}** t'attend !`;
    } else {
        status = "🎅 Le calendrier est terminé. Joyeux Noël !";
    }

    return new EmbedBuilder()
        .setColor("DarkRed")
        .setTitle(`🎄 Calendrier de l'Avent ${state.year}`)
        .setDescription(
            `${grid(doors, today)}\n\n${status}\n\n` +
                `📦 Cases ouvertes : **${doors.length}/${ADVENT.DAYS}**\n` +
                `💰 Total gagné : **${money(total)}**\n\n` +
                `_Une case par jour, à ouvrir le jour même. Ouvre les ${ADVENT.DAYS} cases pour la hotte complète ` +
                `(**+${money(ADVENT.FULL_BONUS)}**) et le titre Père Noël !_`
        )
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() });
}

function openRow(state, disabled) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("advent:open")
            .setLabel(`Ouvrir la case n°${state.day}`)
            .setEmoji("🎁")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled)
    );
}

function rewardText(result, user) {
    const { door } = result;
    const lines = [
        `${door.emoji} **${user.username}** ouvre la case n°**${door.day}** : ${door.label}${door.special ? " ✨" : ""} !`,
        `💰 **${money(result.money - (result.full ? ADVENT.FULL_BONUS : 0))}** · ✨ **${result.xp} XP**`
    ];
    if (result.golden) lines.push(`🎫 **Ticket d'or !** Gains ×${ADVENT.GOLDEN_MULTIPLIER} !`);
    if (result.full) lines.push(`🛷 **Hotte complète !** 24/24 cases : **+${money(ADVENT.FULL_BONUS)}** !`);
    if (result.level.leveledUp) lines.push(`⬆️ Niveau **${result.level.level}** atteint !`);
    return lines.join("\n");
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

        if (state.phase === "avant") {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("DarkRed")
                        .setTitle(`🎄 Calendrier de l'Avent ${state.year}`)
                        .setDescription(
                            `🔒 Le calendrier ouvre le **1er décembre**, <t:${Math.floor(state.startsAt / 1000)}:R>.\n\n` +
                                `Chaque jour jusqu'au 24, ouvre une case pour gagner de l'argent et de l'XP. ` +
                                `Certaines cases sont spéciales 🎅⛄🦌🌟 et un ticket d'or 🎫 peut tripler tes gains !`
                        )
                ],
                flags: EPHEMERAL
            });
        }

        const alreadyOpened = () => economy.getAdventDoors(user.id, state.year).some((d) => d.day === state.day);
        const canOpen = state.phase === "ouvert" && !alreadyOpened();

        const response = await interaction.reply({
            embeds: [calendarEmbed(economy, user, state)],
            components: canOpen ? [openRow(state, false)] : [],
            withResponse: true
        });
        if (!canOpen) return;

        const collector = response.resource.message.createMessageComponentCollector({ idle: 3 * 60 * 1000 });
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
                await i.update({ embeds: [calendarEmbed(economy, user, state)], components: [] });
                await i.followUp({
                    content: rewardText(result, user) + (titles ? `\n${titles}` : ""),
                    allowedMentions: NO_PINGS
                });
            } catch (err) {
                console.error("❌ Erreur calendrier :", err);
                i.reply({ content: "❌ Une erreur est survenue.", flags: EPHEMERAL }).catch(() => {});
            }
        });
        collector.on("end", () => interaction.editReply({ components: [] }).catch(() => {}));
    }
};
