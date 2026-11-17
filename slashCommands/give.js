const { SlashCommandBuilder } = require("discord.js");

const { OWNER_ID } = require("../config");
const { EPHEMERAL, money } = require("../utils/helpers");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("give")
        .setDescription("[Propriétaire] Donner ou retirer de l'argent")
        .setDefaultMemberPermissions(0)
        .addUserOption((option) => option.setName("user").setDescription("Utilisateur").setRequired(true))
        .addIntegerOption((option) =>
            option.setName("montant").setDescription("Montant (minimum 1)").setRequired(true).setMinValue(1)
        )
        .addBooleanOption((option) =>
            option.setName("retirer").setDescription("Retirer l'argent au lieu de le donner").setRequired(false)
        ),

    async execute(interaction) {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content: "❌ Seul le propriétaire du bot peut utiliser cette commande.",
                flags: EPHEMERAL
            });
        }

        const economy = interaction.client.economy;
        const user = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("montant");
        const remove = interaction.options.getBoolean("retirer") ?? false;

        if (user.bot) {
            return interaction.reply({ content: "❌ Les bots n'ont pas de compte.", flags: EPHEMERAL });
        }

        if (remove) {
            const taken = economy.takeUpTo(user.id, amount);
            return interaction.reply({ content: `✅ ${money(taken)} retirés à ${user.tag}`, flags: EPHEMERAL });
        }

        economy.addMoney(user.id, amount);
        return interaction.reply({ content: `✅ ${money(amount)} ajoutés à ${user.tag}`, flags: EPHEMERAL });
    }
};
