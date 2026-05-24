const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("quests")

        .setDescription(
            "Récupérer la récompense"
        ),

    async execute(interaction) {

        const db =
            interaction.client.db;

        db.get(
            "SELECT * FROM users WHERE userId = ?",
            [interaction.user.id],

            (err, row) => {

                if (!row) return;

                // =====================
                // NOT COMPLETED
                // =====================

                if (
                    row.questCompleted !== 1
                ) {

                    return interaction.reply({

                        content:
`❌ Quête non terminée

📈 Progression :
${row.questProgress}/${row.questGoal}`,

                        ephemeral: true
                    });
                }

                // =====================
                // REWARD
                // =====================

                const reward =
                    10000;

                db.run(
                    `UPDATE users

                    SET money = money + ?,
                    activeQuest = 'none',
                    questProgress = 0,
                    questGoal = 0,
                    questCompleted = 0

                    WHERE userId = ?`,

                    [
                        reward,
                        interaction.user.id
                    ]
                );

                const embed =
                    new EmbedBuilder()

                    .setTitle(
                        "🎯 Quête terminée"
                    )

                    .setColor(
                        "Green"
                    )

                    .setDescription(
`💰 Récompense :
+${reward}$`
                    );

                interaction.reply({
                    embeds: [embed]
                });
            }
        );
    }
};