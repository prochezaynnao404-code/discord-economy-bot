const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("inventory")

        .setDescription(
            "Voir inventaire"
        ),

    async execute(interaction) {

        const db =
            interaction.client.db;

        db.all(
            `SELECT * FROM inventory
            WHERE userId = ?`,
            [interaction.user.id],

            (err, items) => {

                let text =
                    "";

                if (
                    items.length === 0
                ) {

                    text =
                        "📦 Inventaire vide.";

                } else {

                    items.forEach(
                        item => {

                            text +=
`• ${item.item}
x${item.amount}

`;
                        }
                    );
                }

                const embed =
                    new EmbedBuilder()

                    .setTitle(
                        "🎒 Inventaire"
                    )

                    .setColor(
                        "Purple"
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