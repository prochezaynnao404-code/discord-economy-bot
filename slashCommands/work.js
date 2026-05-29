const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const jobs = [

    {
        name: "🚕 Chauffeur",
        word: "LIVRAISON"
    },

    {
        name: "💻 Développeur",
        word: "JAVASCRIPT"
    },

    {
        name: "👮 Policier",
        word: "ARRESTATION"
    },

    {
        name: "👨‍🍳 Cuisinier",
        word: "CUISINE"
    }
];

const cooldowns =
    new Map();

module.exports = {

    data: new SlashCommandBuilder()

        .setName("work")

        .setDescription(
            "Travail interactif"
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const userId =
            interaction.user.id;

        // =====================
        // COOLDOWN
        // =====================

        const cooldown =
            30 * 60 * 1000;

        if (
            cooldowns.has(userId)
        ) {

            const expiration =
                cooldowns.get(userId)
                + cooldown;

            if (
                Date.now()
                < expiration
            ) {

                const remaining =
                    Math.ceil(
                        (expiration - Date.now())
                        / 60000
                    );

                return interaction.editReply({

                    content:
`⏳ Tu dois attendre ${remaining} minutes.`,

                    meral: true
                });
            }
        }

        cooldowns.set(
            userId,
            Date.now()
        );

        const job =
            jobs[
                Math.floor(
                    Math.random()
                    * jobs.length
                )
            ];

        const embed =
            new EmbedBuilder()

            .setTitle(
                "💼 Travail"
            )

            .setColor(
                "Blue"
            )

            .setDescription(
`${job.name}

Tape rapidement :

${job.word}

⏳ 10 secondes`
            );

        await interaction.editReply({
            embeds: [embed]
        });

        const filter =
            m =>
                m.author.id
                === userId;

        const collector =
            interaction.channel.createMessageCollector({

                filter,

                time: 10000,

                max: 1
            });

        collector.on(
            "collect",

            msg => {

                const db =
                    interaction.client.db;

                if (
                    msg.content.toUpperCase()
                    === job.word
                ) {

                    const gain =
                        Math.floor(
                            Math.random() * 7500
                        ) + 4500;

                    db.run(
                        `UPDATE users
                        SET money = money + ?
                        WHERE userId = ?`,
                        [
                            gain,
                            userId
                        ]
                    );

                    msg.reply(
`✅ Travail réussi

💰 +${gain}$`
                    );

                } else {

                    msg.reply(
                        "❌ Mauvaise réponse."
                    );
                }
            }
        );
    }
};
