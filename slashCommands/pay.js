const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("pay")
        .setDescription("Envoie de l'argent à un joueur")
        .addUserOption(option =>
            option
                .setName("joueur")
                .setDescription("Le joueur qui recevra l'argent")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("montant")
                .setDescription("Montant à envoyer")
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction) {

        const db = interaction.client.db;

        const sender = interaction.user;
        const receiver = interaction.options.getUser("joueur");
        const amount = interaction.options.getInteger("montant");

        if (receiver.bot) {
            return interaction.reply({
                content: "❌ Tu ne peux pas envoyer d'argent à un bot.",
                flags: 64
            });
        }

        if (receiver.id === sender.id) {
            return interaction.reply({
                content: "❌ Tu ne peux pas t'envoyer de l'argent.",
                flags: 64
            });
        }

        db.get(
            "SELECT money FROM users WHERE userId = ?",
            [sender.id],
            (err, row) => {

                if (err || !row) {
                    return interaction.reply({
                        content: "❌ Ton compte n'existe pas.",
                        flags: 64
                    });
                }

                if (row.money < amount) {
                    return interaction.reply({
                        content: "❌ Tu n'as pas assez d'argent.",
                        flags: 64
                    });
                }

                db.serialize(() => {

                    db.run(
                        "UPDATE users SET money = money - ? WHERE userId = ?",
                        [amount, sender.id]
                    );

                    db.run(
                        "INSERT OR IGNORE INTO users(userId, money, bank, level, xp) VALUES(?, 0, 0, 1, 0)",
                        [receiver.id]
                    );

                    db.run(
                        "UPDATE users SET money = money + ? WHERE userId = ?",
                        [amount, receiver.id]
                    );

                    const embed = new EmbedBuilder()
                        .setColor("Green")
                        .setTitle("💸 Paiement effectué")
                        .setDescription(
`${sender} a envoyé **${amount}$** à ${receiver}.`
                        );

                    interaction.reply({
                        embeds: [embed]
                    });

                });

            }
        );

    }

};