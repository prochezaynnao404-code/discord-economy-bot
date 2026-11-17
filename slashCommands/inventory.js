const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder().setName("inventory").setDescription("Voir ton inventaire"),

    async execute(interaction) {
        const items = interaction.client.economy.getInventory(interaction.user.id);
        const text =
            items.length === 0 ? "📦 Inventaire vide." : items.map((i) => `• ${i.item} ×${i.amount}`).join("\n");

        return interaction.reply({
            embeds: [new EmbedBuilder().setTitle("🎒 Inventaire").setColor("Purple").setDescription(text)]
        });
    }
};
