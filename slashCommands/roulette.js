const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const createUser =
    require("../utils/createUser");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("roulette")

        .setDescription(
            "Jouer à la roulette"
        )

        .addStringOption(option =>

            option

            .setName("couleur")

            .setDescription(
                "Rouge ou noir"
            )

            .setRequired(true)

            .addChoices(

                {
                    name: "Rouge",
                    value: "rouge"
                },

                {
                    name: "Noir",
                    value: "noir"
                }
            )
        )

        .addIntegerOption(option =>

            option

            .setName("mise")

            .setDescription(
                "Montant de la mise"
            )

            .setRequired(true)
        ),

    async execute(interaction) {

        const db =
            interaction.client.db;

        const color =
            interaction.options.getString(
                "couleur"
            );

        const bet =
            interaction.options.getInteger(
                "mise"
            );

        // =====================
        // CHECK NEGATIVE
        // =====================

        if (bet <= 0) {

            return interaction.reply({

                content:
                    "❌ Mise invalide.",

                ephemeral: true
            });
        }

        createUser(
            db,
            interaction.user.id,

            () => {

                db.get(
                    "SELECT * FROM users WHERE userId = ?",
                    [interaction.user.id],

                    (err, row) => {

                        if (!row) return;

                        // =====================
                        // NOT ENOUGH MONEY
                        // =====================

                        if (
                            row.money < bet
                        ) {

                            return interaction.reply({

                                content:
                                    "❌ Pas assez d'argent.",

                                ephemeral: true
                            });
                        }

                        const result =
                            Math.random() < 0.5
                            ? "rouge"
                            : "noir";

                        // =====================
                        // WIN
                        // =====================

                        if (
                            result === color
                        ) {

                            const gain =
                                bet;

                            db.run(
                                `UPDATE users
                                SET money = money + ?
                                WHERE userId = ?`,
                                [
                                    gain,
                                    interaction.user.id
                                ]
                            );

                            const embed =
                                new EmbedBuilder()

                                .setTitle(
                                    "🎰 Roulette"
                                )

                                .setColor(
                                    "Green"
                                )

                                .setDescription(
`🎯 Résultat : ${result}

✅ Tu as gagné ${gain}$`
                                );

                            return interaction.reply({
                                embeds: [embed]
                            });
                        }

                        // =====================
                        // LOSE
                        // =====================

                        db.run(
                            `UPDATE users
                            SET money = money - ?
                            WHERE userId = ?`,
                            [
                                bet,
                                interaction.user.id
                            ]
                        );

                        const embed =
                            new EmbedBuilder()

                            .setTitle(
                                "🎰 Roulette"
                            )

                            .setColor(
                                "Red"
                            )

                            .setDescription(
`🎯 Résultat : ${result}

❌ Tu as perdu ${bet}$`
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