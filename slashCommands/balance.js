const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const createUser =
    require("../utils/createUser");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("balance")

        .setDescription(
            "Voir son argent"
        ),

    async execute(interaction) {

        const db =
            interaction.client.db;

        createUser(
            db,
            interaction.user.id,

            () => {

                db.get(
                    "SELECT * FROM users WHERE userId = ?",
                    [interaction.user.id],

                    (err, row) => {

                        const embed =
                            new EmbedBuilder()

                            .setTitle(
                                "💰 Balance"
                            )

                            .setColor(
                                "#00ff99"
                            )

                            .setThumbnail(
interaction.user.displayAvatarURL()
                            )

                            .addFields(

                                {
                                    name:
                                        "💵 Argent",

                                    value:
`${row.money}$`,

                                    inline: true
                                },

                                {
                                    name:
                                        "🏦 Banque",

                                    value:
`${row.bank}$`,

                                    inline: true
                                },

                                {
                                    name:
                                        "⭐ Niveau",

                                    value:
`${row.level}`,

                                    inline: true
                                }
                            );

                        interaction.reply({
                            embeds: [embed]
                        });
                    }
                );
            }
        );
    }
};