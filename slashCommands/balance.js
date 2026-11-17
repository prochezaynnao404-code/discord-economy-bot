const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { money } = require("../utils/helpers");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("balance")
        .setDescription("Voir son argent")
        .addUserOption((option) => option.setName("joueur").setDescription("Voir le solde d'un autre joueur")),

    async execute(interaction) {
        const target = interaction.options.getUser("joueur") || interaction.user;
        const row = interaction.client.economy.getUser(target.id);

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`💰 Balance de ${target.username}`)
                    .setColor("#00ff99")
                    .setThumbnail(target.displayAvatarURL())
                    .addFields(
                        { name: "💵 Argent", value: money(row.money), inline: true },
                        { name: "🏦 Banque", value: money(row.bank), inline: true },
                        { name: "⭐ Niveau", value: String(row.level), inline: true }
                    )
            ]
        });
    }
};
