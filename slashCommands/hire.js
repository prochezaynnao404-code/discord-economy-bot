const {
    SlashCommandBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("hire")
        .setDescription(
            "Recruter un employé"
        )
        .addUserOption(option =>
            option
            .setName("joueur")
            .setDescription("Utilisateur")
            .setRequired(true)
        ),

    async execute(interaction) {

        const db = interaction.client.db;

        const target =
            interaction.options.getUser(
                "joueur"
            );

        db.get(
            "SELECT * FROM businesses WHERE ownerId = ?",
            [interaction.user.id],
            (err, business) => {

                if (!business) {

                    return interaction.reply(
                        "❌ Tu n'as pas d'entreprise."
                    );
                }

                db.run(
                    `INSERT INTO employees
                    (businessId, userId)
                    VALUES (?, ?)`,
                    [
                        business.id,
                        target.id
                    ]
                );

                interaction.reply(
`✅ ${target.username}
a été recruté`
                );
            }
        );
    }
};