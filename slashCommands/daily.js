const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { EPHEMERAL, money, duration } = require("../utils/helpers");

module.exports = {
    data: new SlashCommandBuilder().setName("daily").setDescription("Récupère ton daily"),

    async execute(interaction) {
        const result = interaction.client.economy.claimDaily(interaction.user.id, {
            reward: ECONOMY.DAILY_REWARD,
            streakMax: ECONOMY.DAILY_STREAK_MAX,
            cooldown: 24 * 60 * 60 * 1000
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
                            `🔥 Série : **${result.streak}/${ECONOMY.DAILY_STREAK_MAX}**\n\n` +
                            "_La série repart à zéro si tu rates plus d'un jour._"
                    )
            ]
        });
    }
};
