const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("leaderboard")

        .setDescription(
            "Classement argent"
        ),

    async execute(interaction) {

        await interaction.deferReply();

        const db =
            interaction.client.db;

        db.all(
            `
            SELECT *
            FROM users
            ORDER BY money DESC
            LIMIT 10
            `,

            [],

            async (err, rows) => {

                if (err) {

                    console.log(err);

                    return interaction.editReply({

                        content:
                            "❌ Erreur leaderboard."
                    });
                }

                if (!rows || rows.length === 0) {

                    return interaction.editReply({

                        content:
                            "❌ Aucun joueur."
                    });
                }

                let description = "";

                rows.forEach(

                    (user, index) => {

                        description +=
`${index + 1}. <@${user.userId}> — ${user.money}$\n`;
                    }
                );

                const embed =
                    new EmbedBuilder()

                    .setTitle(
                        "🏆 Leaderboard"
                    )

                    .setColor(
                        "Gold"
                    )

                    .setDescription(
                        description
                    );

                interaction.editReply({

                    embeds: [embed]
                });
            }
        );
    }
};