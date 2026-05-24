const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const createUser =
    require("../utils/createUser");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("daily")

        .setDescription(
            "Récompense journalière"
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

                        const now =
                            Date.now();

                        const last =
                            row.lastDaily;

                        const cooldown =
                            86400000;

                        if (
                            now - last
                            < cooldown
                        ) {

                            return interaction.reply({

                                content:
                                    "⏳ Déjà récupéré aujourd'hui.",

                                ephemeral: true
                            });
                        }

                        let streak =
                            row.streak + 1;

                        let multiplier =
                            1;

                        if (
                            streak >= 10
                        ) {

                            multiplier = 2;
                        }

                        const reward =
                            5000
                            * multiplier;

                        db.run(
                            `UPDATE users
                            SET money = money + ?,
                            streak = ?,
                            multiplier = ?,
                            lastDaily = ?
                            WHERE userId = ?`,
                            [
                                reward,
                                streak,
                                multiplier,
                                now,
                                interaction.user.id
                            ]
                        );

                        const embed =
                            new EmbedBuilder()

                            .setTitle(
                                "🎁 Daily"
                            )

                            .setColor(
                                "Blue"
                            )

                            .setDescription(
`💰 Gain : ${reward}$

🔥 Streak : ${streak}

⚡ Multiplicateur : x${multiplier}`
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