const { EmbedBuilder } = require("discord.js");

module.exports = {
    async execute(interaction) {
        await interaction.deferReply();

        const db = interaction.client.db;

        db.all(
            "SELECT * FROM users ORDER BY money DESC LIMIT 10",
            [],
            async (err, rows) => {
                if (err) {
                    return interaction.editReply({
                        content: "❌ Erreur leaderboard."
                    });
                }

                let description = "";
                rows.forEach((user, index) => {
                    description += `${index + 1}. <@${user.userId}> — ${user.money}$\n`;
                });

                const embed = new EmbedBuilder()
                    .setTitle("🏆 Leaderboard")
                    .setColor("Gold")
                    .setDescription(description);

                await interaction.editReply({
                    embeds: [embed]
                });
            }
        );
    }
};
