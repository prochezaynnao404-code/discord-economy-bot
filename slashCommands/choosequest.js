const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("choosequest")

        .setDescription(
            "Choisir une quête"
        )

        .addStringOption(option =>

            option

            .setName("quete")

            .setDescription(
                "Type de quête"
            )

            .setRequired(true)

            .addChoices(

                {
                    name: "Messages",
                    value: "messages"
                },

                {
                    name: "Vocal",
                    value: "vocal"
                },

                {
                    name: "Casino",
                    value: "casino"
                }
            )
        ),

    async execute(interaction) {

        const db =
            interaction.client.db;

        const quest =
            interaction.options.getString(
                "quete"
            );

        let goal = 0;

        if (quest === "messages")
            goal = 30;

        if (quest === "vocal")
            goal = 30;

        if (quest === "casino")
            goal = 5;

        db.run(
            `UPDATE users

            SET activeQuest = ?,
            questProgress = 0,
            questGoal = ?,
            questCompleted = 0

            WHERE userId = ?`,

            [
                quest,
                goal,
                interaction.user.id
            ]
        );

        const embed =
            new EmbedBuilder()

            .setTitle(
                "🎯 Nouvelle quête"
            )

            .setColor(
                "Blue"
            )

            .setDescription(
`📌 Quête :
${quest}

🎯 Objectif :
${goal}`
            );

        interaction.reply({
            embeds: [embed]
        });
    }
};