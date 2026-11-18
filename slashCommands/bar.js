const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

const { EPHEMERAL, money } = require("../utils/helpers");
const { DRINKS, EFFECT_LABELS, IVRESSE, ivresseState, soberAt, percent } = require("../utils/bar");

const ts = (ms, style = "R") => `<t:${Math.floor(ms / 1000)}:${style}>`;
const NO_PINGS = { parse: [] };
const MEDALS = ["🥇", "🥈", "🥉"];

function hours(ms) {
    const min = Math.round(ms / 60000);
    return min >= 60 ? `${min / 60} h` : `${min} min`;
}

function effectText(drink) {
    const parts = Object.entries(drink.effects).map(([e, v]) => `${EFFECT_LABELS[e]} ${percent(v)}`);
    return `${parts.join(" · ")} pendant ${hours(drink.duration)}`;
}

function ivresseText(drink) {
    if (drink.ivresse < 0) return `🧠 dessoûle de ${-drink.ivresse}`;
    if (drink.ivresse === 0) return "sans alcool";
    return `🍻 ivresse +${drink.ivresse}`;
}

function menuEmbed(economy, userId) {
    const level = economy.getIvresse(userId);
    const state = ivresseState(level);
    const wallet = economy.getUser(userId).money;
    return new EmbedBuilder()
        .setTitle("🍻 Le Comptoir")
        .setColor("DarkGold")
        .setDescription(
            "Commande une boisson pour un bonus temporaire. Attention à l'alcool : " +
                "un employé ivre rate plus souvent son `/work`.\n\n" +
                Object.values(DRINKS)
                    .map(
                        (d) =>
                            `${d.emoji} **${d.name}** — ${money(d.price)}\n` +
                            `└ ${effectText(d)} · ${ivresseText(d)}\n└ _${d.line}_`
                    )
                    .join("\n")
        )
        .addFields(
            { name: "👛 Portefeuille", value: money(wallet), inline: true },
            { name: `${state.emoji} État`, value: `${state.label} (${level}/${IVRESSE.MAX})`, inline: true }
        )
        .setFooter({ text: "Un effet plus fort remplace le plus faible · l'ivresse baisse de 1 toutes les 30 min" });
}

function menuRow() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("bar:order")
            .setPlaceholder("🍹 Commander une boisson…")
            .addOptions(
                Object.entries(DRINKS).map(([key, d]) => ({
                    label: `${d.name} — ${money(d.price)}`,
                    description: effectText(d).slice(0, 100),
                    value: key,
                    emoji: d.emoji
                }))
            )
    );
}

// Texte du résultat d'une commande (pour soi ou offerte)
function orderResult(result, drink, buyer, target) {
    const self = buyer.id === target.id;
    if (result.status === "money") return { ok: false, text: `❌ Il te faut ${money(drink.price)} en poche.` };
    if (result.status === "drunk") {
        return {
            ok: false,
            text: self
                ? "🙅 Le barman refuse de te servir : tu as assez bu. Prends un ☕ café ou reviens plus tard."
                : `🙅 Le barman refuse de servir ${target} : il a assez bu.`
        };
    }

    const lines = [
        self
            ? `${drink.emoji} ${buyer} commande un(e) **${drink.name}**. _${drink.line}_`
            : `${drink.emoji} ${buyer} offre un(e) **${drink.name}** à ${target} ! Santé 🥂`
    ];
    for (const e of result.effects) {
        lines.push(
            e.kept
                ? `${EFFECT_LABELS[e.effect]} : effet plus fort déjà actif (${DRINKS[e.kept].name} ${percent(e.value)}), conservé`
                : `${EFFECT_LABELS[e.effect]} **${percent(e.value)}** jusqu'à ${ts(e.expiresAt, "t")}`
        );
    }
    const before = ivresseState(result.before);
    const after = ivresseState(result.ivresse);
    if (after !== before) {
        lines.push(
            result.ivresse > result.before
                ? `${after.emoji} ${self ? "Tu es" : `${target} est`} maintenant **${after.label.toLowerCase()}**` +
                      (after.workFail ? ` (${Math.round(after.workFail * 100)} % de rater \`/work\`)` : "")
                : `${after.emoji} ${self ? "Tu reprends" : `${target} reprend`} ses esprits : **${after.label.toLowerCase()}**`
        );
    }
    return { ok: true, text: lines.join("\n") };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("bar")
        .setDescription("Le bar : boissons à bonus, tournées et ivresse")
        .addSubcommand((s) => s.setName("menu").setDescription("Voir la carte et commander"))
        .addSubcommand((s) =>
            s
                .setName("offrir")
                .setDescription("Offrir un verre à un joueur")
                .addUserOption((o) => o.setName("joueur").setDescription("À qui offrir").setRequired(true))
                .addStringOption((o) =>
                    o
                        .setName("boisson")
                        .setDescription("La boisson")
                        .setRequired(true)
                        .addChoices(
                            Object.entries(DRINKS).map(([key, d]) => ({
                                name: `${d.emoji} ${d.name} (${d.price.toLocaleString("fr-FR")} $)`,
                                value: key
                            }))
                        )
                )
        )
        .addSubcommand((s) =>
            s
                .setName("effets")
                .setDescription("Voir tes effets actifs et ton ivresse")
                .addUserOption((o) => o.setName("joueur").setDescription("Joueur à consulter"))
        )
        .addSubcommand((s) => s.setName("classement").setDescription("Les meilleurs clients du bar")),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const sub = interaction.options.getSubcommand();
        const buyer = interaction.user;

        if (sub === "offrir") {
            const target = interaction.options.getUser("joueur");
            const key = interaction.options.getString("boisson");
            if (target.bot) return interaction.reply({ content: "❌ Les bots ne boivent pas.", flags: EPHEMERAL });
            const result = economy.buyDrink(buyer.id, target.id, key);
            const { ok, text } = orderResult(result, DRINKS[key], buyer, target);
            return interaction.reply({
                content: text,
                flags: ok ? undefined : EPHEMERAL,
                allowedMentions: ok && target.id !== buyer.id ? { users: [target.id] } : NO_PINGS
            });
        }

        if (sub === "effets") {
            const target = interaction.options.getUser("joueur") || buyer;
            const user = economy.getUser(target.id);
            const level = economy.getIvresse(target.id);
            const state = ivresseState(level);
            const effects = economy.getDrinkEffects(target.id);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`🍻 ${target.username} au bar`)
                        .setColor(level >= IVRESSE.MAX ? "Red" : "DarkGold")
                        .addFields(
                            {
                                name: "Effets actifs",
                                value: effects.length
                                    ? effects
                                          .map(
                                              (e) =>
                                                  `${EFFECT_LABELS[e.effect]} **${percent(e.value)}** ` +
                                                  `(${DRINKS[e.drink]?.name ?? e.drink}) — fin ${ts(e.expiresAt)}`
                                          )
                                          .join("\n")
                                    : "_Aucun. Passe commander avec `/bar menu` !_"
                            },
                            {
                                name: `${state.emoji} Ivresse : ${state.label} (${level}/${IVRESSE.MAX})`,
                                value:
                                    level > 0
                                        ? `Sobre ${ts(soberAt(level, Date.now()))}` +
                                          (state.workFail
                                              ? ` · ${Math.round(state.workFail * 100)} % de rater \`/work\``
                                              : "")
                                        : "Parfaitement sobre."
                            },
                            {
                                name: "📊 Statistiques",
                                value: `${user.drinks} verre(s) bu(s) · ${user.drinksOffered} offert(s)`
                            }
                        )
                ],
                flags: target.id === buyer.id ? EPHEMERAL : undefined
            });
        }

        if (sub === "classement") {
            const top = economy.topDrinkers(10);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🏆 Meilleurs clients du bar")
                        .setColor("DarkGold")
                        .setDescription(
                            top
                                .map(
                                    (u, i) =>
                                        `${MEDALS[i] || `**${i + 1}.**`} <@${u.userId}> — ${u.drinks} verre(s) · ${u.drinksOffered} offert(s)`
                                )
                                .join("\n") || "_Le bar est encore vide._"
                        )
                ],
                allowedMentions: NO_PINGS
            });
        }

        // ---------- menu ----------
        const response = await interaction.reply({
            embeds: [menuEmbed(economy, buyer.id)],
            components: [menuRow()],
            withResponse: true
        });

        const collector = response.resource.message.createMessageComponentCollector({ idle: 3 * 60 * 1000 });
        collector.on("collect", async (i) => {
            try {
                if (i.user.id !== buyer.id) {
                    return i.reply({ content: "❌ Ouvre ta propre carte avec `/bar menu`.", flags: EPHEMERAL });
                }
                const key = i.values[0];
                const result = economy.buyDrink(buyer.id, buyer.id, key);
                const { ok, text } = orderResult(result, DRINKS[key], buyer, buyer);
                if (!ok) return i.reply({ content: text, flags: EPHEMERAL });
                await i.update({ embeds: [menuEmbed(economy, buyer.id)], components: [menuRow()] });
                await i.followUp({ content: text, allowedMentions: NO_PINGS });
            } catch (err) {
                console.error("❌ Erreur bar :", err);
                i.reply({ content: "❌ Une erreur est survenue.", flags: EPHEMERAL }).catch(() => {});
            }
        });
        collector.on("end", () => interaction.editReply({ components: [] }).catch(() => {}));
    }
};
