const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { OWNER_ID } = require("../config");
const { EPHEMERAL, money } = require("../utils/helpers");
const { BRACKETS, computeWealthTax, exemptionThreshold, nextDueTime, runWealthTax } = require("../utils/tax");

const percent = (rate) => `${(rate * 100).toLocaleString("fr-FR")} %`;
const ts = (ms, style = "f") => `<t:${Math.floor(ms / 1000)}:${style}>`;

function bracketLabel({ from, to }) {
    return to === Infinity ? `Plus de ${money(from)}` : `De ${money(from)} à ${money(to)}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("impots")
        .setDescription("Impôt sur la fortune (prélevé chaque dimanche à 21 h)")
        .addSubcommand((s) =>
            s
                .setName("voir")
                .setDescription("Voir ton estimation d'impôt (ou celle d'un joueur)")
                .addUserOption((o) => o.setName("joueur").setDescription("Joueur à consulter"))
        )
        .addSubcommand((s) => s.setName("bareme").setDescription("Voir le barème de l'impôt sur la fortune"))
        .addSubcommand((s) => s.setName("historique").setDescription("Voir les derniers prélèvements"))
        .addSubcommand((s) => s.setName("prelever").setDescription("[Propriétaire] Prélever l'impôt maintenant")),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const sub = interaction.options.getSubcommand();

        if (sub === "voir") {
            const target = interaction.options.getUser("joueur") || interaction.user;
            const user = economy.getUser(target.id);
            const wealth = user.money + user.bank;
            const { total, details } = computeWealthTax(wealth);
            const summary = economy.getTaxSummary(target.id);

            const lines = details
                .filter((d) => d.rate > 0)
                .map((d) => `${bracketLabel(d)} à ${percent(d.rate)} → **${money(d.amount)}**`);

            const embed = new EmbedBuilder()
                .setTitle(`🧾 Impôt sur la fortune — ${target.username}`)
                .setColor(total > 0 ? "Orange" : "Green")
                .addFields(
                    {
                        name: "💰 Patrimoine",
                        value: `${money(wealth)}\n(poche ${money(user.money)} + banque ${money(user.bank)})`,
                        inline: true
                    },
                    {
                        name: "📅 Prochain prélèvement",
                        value: `${ts(nextDueTime())}\n${ts(nextDueTime(), "R")}`,
                        inline: true
                    },
                    {
                        name: `💸 Impôt estimé : ${money(total)}`,
                        value:
                            total > 0
                                ? lines.join("\n")
                                : `Exonéré : patrimoine inférieur à ${money(exemptionThreshold())}.`
                    },
                    {
                        name: "📜 Déjà payé",
                        value: summary.last
                            ? `Dernier : **${money(summary.last.amount)}** ${ts(summary.last.at, "R")}\n` +
                              `Total : **${money(summary.total)}** en ${summary.count} prélèvement(s)`
                            : "Jamais imposé."
                    }
                )
                .setFooter({ text: "L'impôt est pris dans la poche d'abord, puis à la banque. L'argent est détruit." });

            return interaction.reply({
                embeds: [embed],
                flags: target.id === interaction.user.id ? EPHEMERAL : undefined
            });
        }

        if (sub === "bareme") {
            const rows = BRACKETS.map((b, i) => ({ ...b, to: BRACKETS[i + 1]?.from ?? Infinity }))
                .map((b) => `${bracketLabel(b)} : **${percent(b.rate)}**`)
                .join("\n");

            const examples = [2_000_000, 10_000_000, 50_000_000, 200_000_000]
                .map((w) => `${money(w)} → ${money(computeWealthTax(w).total)} / semaine`)
                .join("\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("📊 Barème de l'impôt sur la fortune")
                        .setColor("Blue")
                        .setDescription(
                            "Calcul **par tranches** : chaque taux ne s'applique qu'à la partie du patrimoine " +
                                "(poche + banque) comprise dans sa tranche.\n\n" +
                                rows
                        )
                        .addFields(
                            { name: "🧮 Exemples", value: examples },
                            {
                                name: "📅 Prélèvement",
                                value: `Chaque dimanche à 21 h (heure de Paris)\nProchain : ${ts(nextDueTime(), "R")}`
                            }
                        )
                        .setFooter({ text: "L'argent prélevé est détruit pour limiter l'inflation." })
                ]
            });
        }

        if (sub === "historique") {
            const runs = economy.recentTaxRuns(8);
            const text = runs.length
                ? runs
                      .map((r) => `${ts(r.at, "D")} — **${money(r.total)}** détruits, ${r.payers} contribuable(s)`)
                      .join("\n")
                : "Aucun prélèvement pour l'instant.";
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🏛️ Historique des prélèvements")
                        .setColor("Grey")
                        .setDescription(text)
                        .setFooter({ text: `Total détruit depuis le début : ${money(economy.totalTaxDestroyed())}` })
                ]
            });
        }

        if (sub === "prelever") {
            if (interaction.user.id !== OWNER_ID) {
                return interaction.reply({ content: "❌ Réservé au propriétaire du bot.", flags: EPHEMERAL });
            }
            await interaction.deferReply({ flags: EPHEMERAL });
            const result = await runWealthTax(interaction.client, economy);
            return interaction.editReply(
                `✅ Impôt prélevé : **${money(result.total)}** détruits sur ${result.payers.length} contribuable(s).\n` +
                    "_Le prochain prélèvement automatique reste dimanche à 21 h._"
            );
        }
    }
};
