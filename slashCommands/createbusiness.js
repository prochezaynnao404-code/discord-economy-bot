const {
    SlashCommandBuilder
} = require("discord.js");

const createUser =
    require("../utils/createUser");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("createbusiness")
        .setDescription(
            "Créer une entreprise"
        )
        .addStringOption(option =>
            option
            .setName("nom")
            .setDescription("Nom entreprise")
            .setRequired(true)
        ),

    async execute(interaction) {

        const db = interaction.client.db;

        const name =
            interaction.options.getString(
                "nom"
            );

        createUser(
            db,
            interaction.user.id,
            () => {

                db.get(
                    "SELECT * FROM users WHERE userId = ?",
                    [interaction.user.id],
                    (err, row) => {

                        const price = 10000000;

                        if (
                            row.money < price
                        ) {

                            return interaction.reply(
                                "❌ Il faut 10000000$."
                            );
                        }

                        db.run(
                            "UPDATE users SET money = money - ? WHERE userId = ?",
                            [
                                price,
                                interaction.user.id
                            ]
                        );

                        db.run(
                            `INSERT INTO businesses
                            (ownerId, name)
                            VALUES (?, ?)`,
                            [
                                interaction.user.id,
                                name
                            ]
                        );

                        interaction.reply(
`🏢 Entreprise créée

Nom : ${name}`
                        );
                    }
                );
            }
        );
    }
};