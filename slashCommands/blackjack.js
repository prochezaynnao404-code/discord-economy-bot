const {

    SlashCommandBuilder,

    ActionRowBuilder,

    ButtonBuilder,

    ButtonStyle,

    EmbedBuilder

} = require("discord.js");

const createUser =
    require("../utils/createUser");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("blackjack")

        .setDescription(
            "Jouer au blackjack"
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

        const bet =
            interaction.options.getInteger(
                "mise"
            );

        // =====================
        // CHECK BET
        // =====================

        if (bet <= 0) {

            return interaction.reply({

                content:
                    "❌ Mise invalide.",

                flags: 64
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
                        // MONEY CHECK
                        // =====================

                        if (
                            row.money < bet
                        ) {

                            return interaction.reply({

                                content:
                                    "❌ Pas assez d'argent.",

                                flags: 64
                            });
                        }

                        // =====================
                        // REMOVE BET
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

                        // =====================
                        // START CARDS
                        // =====================

                        const player =
                            Math.floor(
                                Math.random() * 10
                            ) + 10;

                        const dealer =
                            Math.floor(
                                Math.random() * 10
                            ) + 10;

                        // =====================
                        // DIRECT BLACKJACK
                        // =====================

                        if (
                            player === 21
                        ) {

                            db.run(
                                `UPDATE users
                                SET money = money + ?
                                WHERE userId = ?`,
                                [
                                    bet * 2,
                                    interaction.user.id
                                ]
                            );

                            const embed =
                                new EmbedBuilder()

                                .setTitle(
                                    "🃏 BLACKJACK"
                                )

                                .setColor(
                                    "Gold"
                                )

                                .setDescription(
`🎉 BLACKJACK

👤 Toi : 21
🤖 Dealer : ${dealer}

💰 Gain :
+${bet}$`
                                );

                            return interaction.reply({
                                embeds: [embed]
                            });
                        }

                        // =====================
                        // BUTTONS
                        // =====================

                        const buttons =
                            new ActionRowBuilder()

                            .addComponents(

                                new ButtonBuilder()

                                .setCustomId(
                                    `hit_${player}_${dealer}_${bet}`
                                )

                                .setLabel(
                                    "HIT"
                                )

                                .setStyle(
                                    ButtonStyle.Primary
                                ),

                                new ButtonBuilder()

                                .setCustomId(
                                    `stand_${player}_${dealer}_${bet}`
                                )

                                .setLabel(
                                    "STAND"
                                )

                                .setStyle(
                                    ButtonStyle.Success
                                )
                            );

                        // =====================
                        // EMBED
                        // =====================

                        const embed =
                            new EmbedBuilder()

                            .setTitle(
                                "🃏 BLACKJACK"
                            )

                            .setColor(
                                "Blue"
                            )

                            .setDescription(
`👤 Toi : ${player}
🤖 Dealer : ${dealer}

💰 Mise :
${bet}$`
                            );

                        interaction.reply({

                            embeds: [embed],

                            components: [
                                buttons
                            ]
                        });
                    }
                );
            }
        );
    }
};