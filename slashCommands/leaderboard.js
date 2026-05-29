const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("daily")

        .setDescription(
            "Récupère ton daily"
        ),

    async execute(interaction) {

        await interaction.deferReply({
            flags: 64
        });

        const db =
            interaction.client.db;

        const userId =
            interaction.user.id;

        db.get(
            "SELECT * FROM users WHERE userId = ?",
            [userId],

            (err, user) => {

                if (err) {

                    console.log(err);

                    return interaction.editReply({

                        content:
                            "❌ Erreur base de données."
                    });
                }

                // =====================
                // CREATE USER
                // =====================

                if (!user) {

                    db.run(
                        `
                        INSERT INTO users (
                            userId,
                            money,
                            lastDaily,
                            dailyStreak
                        )
                        VALUES (?, ?, ?, ?)
                        `,
                        [
                            userId,
                            0,
                            0,
                            0
                        ],

                        () => {

                            interaction.editReply({

                                content:
                                    "✅ Compte créé.\nRefais la commande."
                            });
                        }
                    );

                    return;
                }

                const now =
                    Date.now();

                const cooldown =
                    86400000;

                // =====================
                // COOLDOWN
                // =====================

                if (
                    user.lastDaily
                    && now - user.lastDaily
                    < cooldown
                ) {

                    const timeLeft =
                        cooldown -
                        (
                            now
                            - user.lastDaily
                        );

                    const hours =
                        Math.floor(
                            timeLeft / 3600000
                        );

                    const minutes =
                        Math.floor(
                            (
                                timeLeft
                                % 3600000
                            ) / 60000
                        );

                    return interaction.editReply({

                        embeds: [

                            new EmbedBuilder()

                            .setColor("Red")

                            .setTitle(
                                "⏳ DAILY"
                            )

                            .setDescription(
`Reviens dans
${hours}h ${minutes}m`
                            )
                        ]
                    });
                }

                // =====================
                // STREAK
                // =====================

                let streak =
                    (
                        user.dailyStreak
                        || 0
                    ) + 1;

                let reward =
                    5000;

                // =====================
                // BONUS X2
                // =====================

                if (
                    streak >= 10
                ) {

                    reward *= 2;

                    streak = 0;
                }

                db.run(
                    `
                    UPDATE users

                    SET money = money + ?,
                    lastDaily = ?,
                    dailyStreak = ?

                    WHERE userId = ?
                    `,
                    [
                        reward,
                        now,
                        streak,
                        userId
                    ],

                    () => {

                        interaction.editReply({

                            embeds: [

                                new EmbedBuilder()

                                .setColor("Green")

                                .setTitle(
                                    "🎁 DAILY"
                                )

                                .setDescription(
`💰 Gain :
${reward}$

🔥 Série :
${streak}/10`
                                )
                            ]
                        });
                    }
                );
            }
        );
    }
};