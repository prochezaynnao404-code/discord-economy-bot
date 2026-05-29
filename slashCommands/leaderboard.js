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

        const db =
            interaction.client.db;

        const userId =
            interaction.user.id;

        db.get(
            "SELECT * FROM users WHERE userId = ?",
            [userId],

            (err, user) => {

                if (!user) {

                    db.run(
                        `
                        INSERT INTO users (
                            userId
                        )
                        VALUES (?)
                        `,
                        [userId]
                    );

                    return interaction.reply({
                        content: "Réessaie la commande.",
                        flags: 64
                    });
                }

                const now =
                    Date.now();

                const cooldown =
                    86400000;

                // COOLDOWN

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

                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("⏳ DAILY")
                                .setDescription(`Reviens dans\n${hours}h ${minutes}m`)
                        ],
                        flags: 64
                    });
                }

                // STREAK

                let streak =
                    (
                        user.dailyStreak
                        || 0
                    ) + 1;

                let reward =
                    5000;

                // BONUS X2

                if (
                    streak >= 10
                ) {

                    reward *= 2;

                    streak = 0;
                }

                const newMoney =
                    user.money + reward;

                db.run(
                    `
                    UPDATE users

                    SET money = ?,
                    lastDaily = ?,
                    dailyStreak = ?

                    WHERE userId = ?
                    `,
                    [
                        newMoney,
                        now,
                        streak,
                        userId
                    ]
                );

                 interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Green")
                            .setTitle("🎁 DAILY")
                            .setDescription(`💰 Gain :\n${reward}$\n\n🔥 Série :\n${streak}/10`)
                    ],
                    flags: 64
                });
            }
        );
    }
};
