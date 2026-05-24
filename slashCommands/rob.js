const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const cooldowns =
    new Map();

module.exports = {

    data: new SlashCommandBuilder()

        .setName("rob")

        .setDescription(
            "Braquage hardcore"
        ),

    async execute(interaction) {

        const userId =
            interaction.user.id;

        // =====================
        // COOLDOWN 48H
        // =====================

        const cooldown =
            48 * 60 * 60 * 1000;

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

                const hours =
                    Math.ceil(
                        (expiration - Date.now())
                        / 3600000
                    );

                return interaction.reply({

                    content:
`🚔 Attends encore ${hours}h.`,

                    ephemeral: true
                });
            }
        }

        cooldowns.set(
            userId,
            Date.now()
        );

        // =====================
        // PHASE 1
        // =====================

        const letters = [
            "A",
            "B",
            "X",
            "Y"
        ];

        let sequence =
            "";

        for (
            let i = 0;
            i < 6;
            i++
        ) {

            sequence +=
                letters[
                    Math.floor(
                        Math.random()
                        * letters.length
                    )
                ] + " ";
        }

        const embed =
            new EmbedBuilder()

            .setTitle(
                "🔫 BRAQUAGE"
            )

            .setColor(
                "Red"
            )

            .setDescription(
`🧠 Phase 1 — Sécurité

Retape :

${sequence}

⏳ 12 secondes`
            );

        await interaction.reply({
            embeds: [embed]
        });

        const filter =
            m =>
                m.author.id
                === userId;

        const collector1 =
            interaction.channel.createMessageCollector({

                filter,

                time: 12000,

                max: 1
            });

        collector1.on(
            "collect",

            msg => {

                // =====================
                // FAIL PHASE 1
                // =====================

                if (
                    msg.content.trim()
                    !== sequence.trim()
                ) {

                    const db =
                        interaction.client.db;

                    const loss =
                        Math.floor(
                            Math.random() * 10000
                        ) + 5000;

                    db.run(
                        `UPDATE users
                        SET money = money - ?
                        WHERE userId = ?`,
                        [
                            loss,
                            userId
                        ]
                    );

                    return msg.reply(
`🚔 Alarme déclenchée

💸 -${loss}$`
                    );
                }

                // =====================
                // PHASE 2
                // =====================

                const arrows = [
                    "⬆️",
                    "⬇️",
                    "⬅️",
                    "➡️"
                ];

                let lock =
                    "";

                for (
                    let i = 0;
                    i < 5;
                    i++
                ) {

                    lock +=
                        arrows[
                            Math.floor(
                                Math.random()
                                * arrows.length
                            )
                        ] + " ";
                }

                msg.reply(
`🔓 Phase 2 — Crochetage

Retape :

${lock}

⏳ 15 secondes`
                );

                const collector2 =
                    interaction.channel.createMessageCollector({

                        filter,

                        time: 15000,

                        max: 1
                    });

                collector2.on(
                    "collect",

                    msg2 => {

                        const db =
                            interaction.client.db;

                        // SUCCESS

                        if (
                            msg2.content.trim()
                            === lock.trim()
                        ) {

                            const gain =
                                Math.floor(
                                    Math.random() * 30000
                                ) + 10000;

                            db.run(
                                `UPDATE users
                                SET money = money + ?
                                WHERE userId = ?`,
                                [
                                    gain,
                                    userId
                                ]
                            );

                            msg2.reply(
`💰 BRAQUAGE RÉUSSI

+${gain}$`
                            );

                        } else {

                            // FAIL PHASE 2

                            const loss =
                                Math.floor(
                                    Math.random() * 15000
                                ) + 5000;

                            db.run(
                                `UPDATE users
                                SET money = money - ?
                                WHERE userId = ?`,
                                [
                                    loss,
                                    userId
                                ]
                            );

                            msg2.reply(
`🚔 Mauvais crochetage

💸 -${loss}$`
                            );
                        }
                    }
                );

                collector2.on(
                    "end",

                    collected => {

                        if (
                            collected.size === 0
                        ) {

                            interaction.followUp(
                                "⏰ Temps écoulé."
                            );
                        }
                    }
                );
            }
        );

        collector1.on(
            "end",

            collected => {

                if (
                    collected.size === 0
                ) {

                    interaction.followUp(
                        "⏰ Braquage annulé."
                    );
                }
            }
        );
    }
};