const {
    SlashCommandBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("give")
        .setDescription("Donner de l'argent")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Utilisateur")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("montant")
                .setDescription("Montant")
                .setRequired(true)
        ),

    async execute(interaction) {

        // Remplace par ton ID Discord
        const OWNER_ID = "1184567704133324891";

        if (
            interaction.user.id !== OWNER_ID
        ) {
            return interaction.reply({
                content:
                    "❌ Seul le propriétaire du bot peut utiliser cette commande.",
                flags: 64
            });
        }

        const user =
            interaction.options.getUser(
                "user"
            );

        const montant =
            interaction.options.getInteger(
                "montant"
            );

        const db =
            interaction.client.db;

        db.run(
            `UPDATE users
             SET money = money + ?
             WHERE userId = ?`,
            [
                montant,
                user.id
            ]
        );

        await interaction.reply(
            `✅ ${montant}$ ajoutés à ${user.tag}`
        );
    }
};