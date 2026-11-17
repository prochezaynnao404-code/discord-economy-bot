const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { money } = require("../utils/helpers");

const TYPES = {
    money: { title: "💵 Argent", format: (u) => money(u.money) },
    bank: { title: "🏦 Banque", format: (u) => money(u.bank) },
    level: { title: "⭐ Niveau", format: (u) => `niveau ${u.level} (${u.xp} XP)` },
    messages: { title: "💬 Messages", format: (u) => `${u.messages.toLocaleString("fr-FR")} messages` },
    voiceTime: {
        title: "🎙️ Vocal",
        format: (u) => `${Math.floor(u.voiceTime / 3600)} h ${Math.floor((u.voiceTime % 3600) / 60)} min`
    }
};

const MEDALS = ["🥇", "🥈", "🥉"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Classement des joueurs")
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Classement à afficher (argent par défaut)")
                .addChoices(...Object.entries(TYPES).map(([value, t]) => ({ name: t.title, value })))
        ),

    async execute(interaction) {
        const type = interaction.options.getString("type") || "money";
        const rows = interaction.client.economy.top(type, 10);

        if (rows.length === 0) {
            return interaction.reply({ content: "❌ Aucun joueur." });
        }

        const description = rows
            .map((u, i) => `${MEDALS[i] || `**${i + 1}.**`} <@${u.userId}> — ${TYPES[type].format(u)}`)
            .join("\n");

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`🏆 Classement ${TYPES[type].title}`)
                    .setColor("Gold")
                    .setDescription(description)
            ],
            allowedMentions: { parse: [] }
        });
    }
};
