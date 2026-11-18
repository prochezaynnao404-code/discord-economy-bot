const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { EPHEMERAL, money } = require("../utils/helpers");
const {
    RARITIES,
    CATEGORIES,
    TITLES,
    TITLE_BY_ID,
    titleContext,
    progressOf,
    syncTitles,
    equippedTitle,
    titleLabel,
    newTitlesText
} = require("../utils/titles");

const NO_PINGS = { parse: [] };

// 6 200 000 -> "6,2 M"
function compact(n) {
    if (n >= 1e9) return `${(n / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Md`;
    if (n >= 1e6) return `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
    if (n >= 1e4) return `${(n / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
    return n.toLocaleString("fr-FR");
}

function miniBar(ratio, size = 8) {
    const filled = Math.round(ratio * size);
    return "▰".repeat(filled) + "▱".repeat(size - filled);
}

function progressText(title, ctx) {
    const p = progressOf(title, ctx);
    if (!p) return "";
    const fmt = (v) => (title.unit === "h" ? `${Math.floor(v / 3600)} h` : compact(v));
    return `${miniBar(p.ratio)} ${fmt(Math.min(p.current, p.goal))} / ${fmt(p.goal)}`;
}

function collectionEmbed(target, user, unlocked, ctx, ownView) {
    const owned = new Set(unlocked.map((u) => u.titleId));
    const equipped = equippedTitle(user);
    const total = TITLES.length;

    const embed = new EmbedBuilder()
        .setTitle(`🎖️ Titres de ${target.username}`)
        .setColor(equipped ? RARITIES[equipped.rarity].color : "Blurple")
        .setDescription(
            `**Titre porté :** ${equipped ? titleLabel(equipped) : "_aucun_"}\n` +
                `**Collection :** ${owned.size} / ${total} ${miniBar(owned.size / total, 12)}\n` +
                Object.values(RARITIES)
                    .map((r) => {
                        const all = TITLES.filter((t) => RARITIES[t.rarity] === r);
                        return `${r.emoji} ${all.filter((t) => owned.has(t.id)).length}/${all.length}`;
                    })
                    .join("  ")
        );

    for (const [key, label] of Object.entries(CATEGORIES)) {
        const lines = TITLES.filter((t) => t.category === key)
            .sort((a, b) => RARITIES[a.rarity].order - RARITIES[b.rarity].order)
            .map((t) => {
                if (owned.has(t.id)) {
                    return `✅ ${titleLabel(t)}${equipped?.id === t.id ? " · _porté_" : ""}`;
                }
                if (t.price) return `🔒 ${RARITIES[t.rarity].emoji} ${t.name} — ${money(t.price)}`;
                return `🔒 ${RARITIES[t.rarity].emoji} ${t.name} — ${t.hint}${ownView ? `\n└ ${progressText(t, ctx)}` : ""}`;
            });
        embed.addFields({ name: label, value: lines.join("\n"), inline: false });
    }
    if (ownView) embed.setFooter({ text: "Les titres débloqués sont gardés pour toujours" });
    return embed;
}

function collectionComponents(user, unlocked) {
    const options = unlocked
        .map((u) => TITLE_BY_ID[u.titleId])
        .filter(Boolean)
        .sort((a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order)
        .slice(0, 24)
        .map((t) => ({
            label: t.name,
            description: RARITIES[t.rarity].label,
            value: t.id,
            emoji: RARITIES[t.rarity].emoji,
            default: user.title === t.id
        }));

    const rows = [];
    if (options.length) {
        rows.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("titres:equip")
                    .setPlaceholder("🎖️ Choisir le titre à porter…")
                    .addOptions([...options, { label: "Ne porter aucun titre", value: "none", emoji: "🚫" }])
            )
        );
    }
    rows.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("titres:shop")
                .setLabel("Boutique de titres")
                .setEmoji("🛒")
                .setStyle(ButtonStyle.Primary)
        )
    );
    return rows;
}

function shopPage(economy, userId, confirm) {
    const wallet = economy.getUser(userId).money;
    const items = TITLES.filter((t) => t.price);
    const embed = new EmbedBuilder()
        .setTitle("🛒 Boutique de titres")
        .setColor("Gold")
        .setDescription(
            "Des titres de noblesse pour afficher ta réussite. L'argent dépensé est **détruit**.\n\n" +
                items
                    .map((t) => {
                        const owned = economy.hasTitle(userId, t.id);
                        return `${titleLabel(t)} — ${owned ? "✅ possédé" : money(t.price)}\n└ ${RARITIES[t.rarity].label}`;
                    })
                    .join("\n")
        )
        .setFooter({ text: `Portefeuille : ${money(wallet)}` });

    const buttons = items.map((t) => {
        const owned = economy.hasTitle(userId, t.id);
        const confirming = confirm === t.id;
        return new ButtonBuilder()
            .setCustomId(`titres:buy:${t.id}`)
            .setLabel(owned ? `${t.name} ✓` : confirming ? `Confirmer ${money(t.price)}` : t.name)
            .setEmoji(RARITIES[t.rarity].emoji)
            .setStyle(confirming ? ButtonStyle.Danger : ButtonStyle.Success)
            .setDisabled(owned || t.price > wallet);
    });
    const back = new ButtonBuilder()
        .setCustomId("titres:back")
        .setLabel("Retour à la collection")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary);
    return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(buttons), new ActionRowBuilder().addComponents(back)]
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("titres")
        .setDescription("Ta collection de titres : débloque, achète et équipe")
        .addUserOption((o) => o.setName("joueur").setDescription("Voir les titres d'un autre joueur")),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const target = interaction.options.getUser("joueur") || interaction.user;
        if (target.bot) return interaction.reply({ content: "❌ Les bots n'ont pas de titres.", flags: EPHEMERAL });
        const ownView = target.id === interaction.user.id;

        const fresh = syncTitles(economy, target.id);
        const render = () => {
            const user = economy.getUser(target.id);
            const unlocked = economy.getUnlockedTitles(target.id);
            return {
                embeds: [collectionEmbed(target, user, unlocked, titleContext(economy, target.id), ownView)],
                components: ownView ? collectionComponents(user, unlocked) : []
            };
        };

        if (!ownView) return interaction.reply({ ...render(), allowedMentions: NO_PINGS });

        const response = await interaction.reply({
            ...render(),
            content: newTitlesText(fresh),
            flags: EPHEMERAL,
            withResponse: true
        });

        let confirm = null;
        const collector = response.resource.message.createMessageComponentCollector({ idle: 5 * 60 * 1000 });
        collector.on("collect", async (i) => {
            try {
                const [, action, arg] = i.customId.split(":");
                const userId = interaction.user.id;

                if (action === "equip") {
                    const id = i.values[0] === "none" ? null : i.values[0];
                    const ok = economy.equipTitle(userId, id);
                    const content = !ok
                        ? "❌ Tu n'as pas ce titre."
                        : id
                          ? `🎖️ Tu portes maintenant le titre ${titleLabel(TITLE_BY_ID[id])}.`
                          : "Tu ne portes plus de titre.";
                    return i.update({ ...render(), content });
                }
                if (action === "shop") {
                    confirm = null;
                    return i.update({ ...shopPage(economy, userId, confirm), content: "" });
                }
                if (action === "back") {
                    confirm = null;
                    return i.update({ ...render(), content: "" });
                }
                if (action === "buy") {
                    const title = TITLE_BY_ID[arg];
                    if (!title?.price) return;
                    if (confirm !== arg) {
                        confirm = arg;
                        return i.update(shopPage(economy, userId, confirm));
                    }
                    confirm = null;
                    const status = economy.buyTitle(userId, arg, title.price);
                    if (status === "ok") economy.equipTitle(userId, arg);
                    const content = {
                        ok: `👑 Titre ${titleLabel(title)} acheté et équipé !`,
                        owned: "Tu possèdes déjà ce titre.",
                        money: `❌ Il te faut ${money(title.price)} en poche.`
                    }[status];
                    return i.update({ ...shopPage(economy, userId, confirm), content });
                }
            } catch (err) {
                console.error("❌ Erreur titres :", err);
                i.reply({ content: "❌ Une erreur est survenue.", flags: EPHEMERAL }).catch(() => {});
            }
        });
        collector.on("end", () => interaction.editReply({ components: [] }).catch(() => {}));
    }
};
