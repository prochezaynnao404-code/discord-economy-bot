const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const GAMES = {
    echecs: "♟️ Échecs",
    dames: "⚪ Dames",
    puissance4: "🔴 Puissance 4",
    morpion: "❌ Morpion",
    pfc: "✂️ Pierre-feuille-ciseaux",
    bataillenavale: "🚢 Bataille navale",
    pendu: "🪢 Pendu"
};

function label(key) {
    if (key === "pendu_multi") return "🪢 Pendu (multijoueur)";
    const bot = key.endsWith("_bot");
    const base = GAMES[key.replace(/_bot$/, "")] || key;
    return bot ? `${base} (vs bot)` : base;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("statsjeux")
        .setDescription("Statistiques des mini-jeux")
        .addUserOption((o) => o.setName("joueur").setDescription("Voir les stats d'un autre joueur"))
        .addStringOption((o) =>
            o
                .setName("classement")
                .setDescription("Afficher le classement d'un jeu (en duel)")
                .addChoices(...Object.entries(GAMES).map(([value, name]) => ({ name, value })))
        ),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const game = interaction.options.getString("classement");

        if (game) {
            const rows = economy.topGamePlayers(game, 10);
            const text = rows.length
                ? rows
                      .map((r, i) => `**${i + 1}.** <@${r.userId}> — ${r.wins} V / ${r.losses} D / ${r.draws} N`)
                      .join("\n")
                : "Aucune victoire enregistrée pour l'instant.";
            return interaction.reply({
                embeds: [
                    new EmbedBuilder().setTitle(`🏆 Classement ${GAMES[game]}`).setColor("Gold").setDescription(text)
                ],
                allowedMentions: { parse: [] }
            });
        }

        const user = interaction.options.getUser("joueur") || interaction.user;
        const stats = economy.getGameStats(user.id);
        if (stats.length === 0) {
            return interaction.reply({ content: `🎮 ${user.username} n'a encore joué à aucun mini-jeu.` });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎮 Mini-jeux de ${user.username}`)
            .setColor("Blue")
            .setThumbnail(user.displayAvatarURL())
            .addFields(
                stats.map((s) => {
                    const total = s.wins + s.losses + s.draws;
                    const rate = total ? Math.round((s.wins / total) * 100) : 0;
                    return {
                        name: label(s.game),
                        value: `✅ ${s.wins} · ❌ ${s.losses} · 🤝 ${s.draws}\n📈 ${rate} % de victoires`,
                        inline: true
                    };
                })
            );
        return interaction.reply({ embeds: [embed] });
    }
};
