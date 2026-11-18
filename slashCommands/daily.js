const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { EPHEMERAL, money, duration } = require("../utils/helpers");
const { levelBonus, formatBonus } = require("../utils/levels");

module.exports = {
    data: new SlashCommandBuilder().setName("daily").setDescription("Récupère ton daily"),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const { level } = economy.getUser(interaction.user.id);
        const result = economy.claimDaily(interaction.user.id, {
            reward: ECONOMY.DAILY_REWARD,
            streakMax: ECONOMY.DAILY_STREAK_MAX,
            cooldown: 24 * 60 * 60 * 1000,
            multiplier: 1 + levelBonus(level)
        });

        if (!result.ok) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Red")
                        .setTitle("⏳ DAILY")
                        .setDescription(`Reviens dans **${duration(result.remaining)}**`)
                ],
                flags: EPHEMERAL
            });
        }

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor("Green")
                    .setTitle("🎁 DAILY")
                    .setDescription(
                        `💰 Gain : **${money(result.gain)}**${result.bonus ? " (bonus x2 !)" : ""}\n` +
                            (levelBonus(level) > 0 ? `⭐ Bonus niveau ${level} : **${formatBonus(level)}**\n` : "") +
                            `🔥 Série : **${result.streak}/${ECONOMY.DAILY_STREAK_MAX}**\n\n` +
                            "_La série repart à zéro si tu rates plus d'un jour._"
                    )
            ]
        });
    }
};
