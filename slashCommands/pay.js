const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { EPHEMERAL, money } = require("../utils/helpers");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pay")
        .setDescription("Envoie de l'argent à un joueur")
        .addUserOption((option) =>
            option.setName("joueur").setDescription("Le joueur qui recevra l'argent").setRequired(true)
        )
        .addIntegerOption((option) =>
            option.setName("montant").setDescription("Montant à envoyer").setRequired(true).setMinValue(1)
        ),

    async execute(interaction) {
        const sender = interaction.user;
        const receiver = interaction.options.getUser("joueur");
        const amount = interaction.options.getInteger("montant");

        if (receiver.bot) {
            return interaction.reply({ content: "❌ Tu ne peux pas envoyer d'argent à un bot.", flags: EPHEMERAL });
        }
        if (receiver.id === sender.id) {
            return interaction.reply({ content: "❌ Tu ne peux pas t'envoyer de l'argent.", flags: EPHEMERAL });
        }

        // Transaction atomique : impossible d'envoyer plus que ce qu'on a
        if (!interaction.client.economy.transfer(sender.id, receiver.id, amount)) {
            return interaction.reply({ content: "❌ Tu n'as pas assez d'argent.", flags: EPHEMERAL });
        }

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor("Green")
                    .setTitle("💸 Paiement effectué")
                    .setDescription(`${sender} a envoyé **${money(amount)}** à ${receiver}.`)
            ]
        });
    }
};
