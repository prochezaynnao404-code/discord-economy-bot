const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const OWNER_ID = process.env.OWNER_ID;

module.exports = {
    data: new SlashCommandBuilder()
        .setName("give")
        .setDescription("Donne de l'argent à un joueur")
        .addUserOption(option =>
            option
                .setName("joueur")
                .setDescription("Le joueur")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("montant")
                .setDescription("Montant")
                .setRequired(true)
        ),

    async execute(interaction) {

        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content: "❌ Accès refusé.",
                flags: 64
            });
        }

        const target =
            interaction.options.getUser("joueur");

        const amount =
            interaction.options.getInteger("montant");

        const db =
            interaction.client.db;

        db.run(
            `
            INSERT OR IGNORE INTO users(userId)
            VALUES(?)
            `,
            [target.id]
        );

        db.run(
            `
            UPDATE users
            SET money = money + ?
            WHERE userId = ?
            `,
            [amount, target.id],
            err => {

                if (err) {
                    return interaction.reply({
                        content: "❌ Erreur.",
                        flags: 64
                    });
                }

                interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Green")
                            .setTitle("💸 GIVE")
                            .setDescription(
                                `${target} a reçu **${amount}$**`
                            )
                    ]
                });
            }
        );
    }
};