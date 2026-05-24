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

        const db =
            interaction.client.db;

        db.all(
            `SELECT * FROM users
            ORDER BY money DESC
            LIMIT 10`,

            [],

            (err, rows) => {

                let text = "";

                rows.forEach(
                    (user, index) => {

                        text +=
`${index + 1}. <@${user.userId}>
💰 ${user.money}$

`;
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
                        text
                    );

                interaction.reply({
                    embeds: [embed]
                });
            }
        );
    }
};