const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("rob")

        .setDescription(
            "Braque une banque"
        ),

    async execute(interaction) {

    await interaction.deferReply();

    const db =
        interaction.client.db;

    const userId =
        interaction.user.id;

        db.get(
            "SELECT * FROM users WHERE userId = ?",
            [userId],

            async (err, user) => {

                if (!user) {

                    return interaction.followUp({

                        content:
                            "❌ Utilisateur introuvable.",

                        flags: 64
                    });
                }

                const now =
                    Date.now();

                const cooldown =
                    172800000;

                // ======================
                // COOLDOWN
                // ======================

                if (
                    user.lastRob
                    && now - user.lastRob
                    < cooldown
                ) {

                    const timeLeft =
                        cooldown -
                        (
                            now
                            - user.lastRob
                        );

                    const hours =
                        Math.floor(
                            timeLeft / 3600000
                        );

                    return interaction.channel.send({

                        embeds: [

                            new EmbedBuilder()

                            .setColor("Red")

                            .setTitle(
                                "🚨 BRAQUAGE"
                            )

                            .setDescription(
`⏳ Attends encore
${hours} heures`
                            )
                        ],

                        flags: 64
                    });
                }

                // ======================
                // PHASE 1
                // ======================

                const words = [

                    "piratage",

                    "banque",

                    "discret",

                    "infiltration",

                    "alarme",

                    "caméra"
                ];

                const randomWord =
                    words[
                        Math.floor(
                            Math.random()
                            * words.length
                        )
                    ];


                await interaction.channel.send({

                    embeds: [

                        new EmbedBuilder()

                        .setColor("Orange")

                        .setTitle(
                            "🏦 PHASE 1"
                        )

                        .setDescription(
`Retape ce mot :

\`${randomWord}\`

⏳ 10 secondes`
                        )
                    ]
                });

                const filter =
                    msg =>
                        msg.author.id
                        === interaction.user.id;

                const collected =
                    await interaction.channel.awaitMessages({

                        filter,

                        max: 1,

                        time: 10000,

                        errors: ["time"]
                    })

                    .catch(() => null);

                // FAIL

                if (
                    !collected
                ) {

                    return interaction.editReply({

                        content:
                            "🚨 Temps écoulé.",

                        flags: 64
                    });
                }

                const answer =
                    collected.first().content;

                if (
                    answer.toLowerCase()
                    !== randomWord
                ) {

                    return interaction.channel.send({

                        content:
                            "🚨 Mauvais mot.\nLa police arrive.",

                        flags: 64
                    });
                }

                // ======================
                // PHASE 2
                // ======================

                const code =
                    Math.floor(
                        1000 + Math.random() * 9000
                    ).toString();

                await interaction.channel.send({

                    embeds: [

                        new EmbedBuilder()

                        .setColor("Red")

                        .setTitle(
                            "🔓 PHASE 2"
                        )

                        .setDescription(
`Retape ce code :

\`${code}\`

⏳ 8 secondes`
                        )
                    ]
                });

                const collected2 =
                    await interaction.channel.awaitMessages({

                        filter,

                        max: 1,

                        time: 8000,

                        errors: ["time"]
                    })

                    .catch(() => null);

                // FAIL

                if (
                    !collected2
                ) {

                    return interaction.channel.send({

                        content:
                            "🚨 Trop lent.\nBraquage raté.",

                        flags: 64
                    });
                }

                const answer2 =
                    collected2.first().content;

                if (
                    answer2
                    !== code
                ) {

                    return interaction.followUp({

                        content:
                            "🚨 Mauvais code.\nTu t'es fait arrêter.",

                        flags: 64
                    });
                }

                // ======================
                // PHASE 3
                // ======================

                const wireColors = [

                    "rouge",

                    "bleu",

                    "vert",

                    "jaune"
                ];

                const correctWire =
                    wireColors[
                        Math.floor(
                            Math.random()
                            * wireColors.length
                        )
                    ];

                await interaction.channel.send({

                    embeds: [

                        new EmbedBuilder()

                        .setColor("DarkRed")

                        .setTitle(
                            "💣 PHASE 3"
                        )

                        .setDescription(
`Quelle couleur couper ?

🟥 rouge
🟦 bleu
🟩 vert
🟨 jaune

Tape :
\`${correctWire}\`

⏳ 6 secondes`
                        )
                    ]
                });

                const collected3 =
                    await interaction.channel.awaitMessages({

                        filter,

                        max: 1,

                        time: 6000,

                        errors: ["time"]
                    })

                    .catch(() => null);

                // FAIL

                if (
                    !collected3
                ) {

                    return interaction.channel.send({
                        content:
                            "💥 Bombe explosée.",

                        flags: 64
                    });
                }

                const answer3 =
                    collected3.first().content
                    .toLowerCase();

                if (
                    answer3
                    !== correctWire
                ) {

                    return interaction.channel.send({

                        content:
                            "💥 Mauvais câble.\nBraquage échoué.",

                        flags: 64
                    });
                }

                // ======================
                // SUCCESS
                // ======================

                const reward =
                    Math.floor(
                        Math.random() * 15000
                    ) + 5000;

                db.run(
                    `
                    UPDATE users

                    SET money = money + ?,
                    lastRob = ?

                    WHERE userId = ?
                    `,
                    [
                        reward,
                        now,
                        userId
                    ]
                );

                await interaction.channel.send({

    embeds: [

        new EmbedBuilder()

        .setColor("Green")

        .setTitle(
            "🏆 BRAQUAGE RÉUSSI"
        )

        .setDescription(
`💰 Gain :
${reward}$`
        )
    ]
});
            }
        );
    }
};