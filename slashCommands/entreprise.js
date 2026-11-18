const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder
} = require("discord.js");

const { EPHEMERAL, money } = require("../utils/helpers");
const {
    BUSINESS,
    UPGRADES,
    BOTS,
    HOUR,
    upgradeCost,
    monthKey,
    monthLabel,
    nextMonthStart,
    employeeOfMonthPrize
} = require("../utils/business");

const ts = (ms, style = "R") => `<t:${Math.floor(ms / 1000)}:${style}>`;
const NO_PINGS = { parse: [] };
const IDLE = 10 * 60 * 1000;
const MEDALS = ["🥇", "🥈", "🥉"];

function bar(ratio, size = 12) {
    const filled = Math.round(Math.max(0, Math.min(1, ratio)) * size);
    return "▰".repeat(filled) + "▱".repeat(size - filled);
}

function btn(id, label, style = ButtonStyle.Secondary, { emoji, disabled = false } = {}) {
    const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
    if (emoji) b.setEmoji(emoji);
    return b;
}

function navRow(page) {
    const pages = [
        ["home", "Accueil", "🏢"],
        ["upgrades", "Améliorations", "⬆️"],
        ["bots", "Robots", "🤖"],
        ["staff", "Employés", "👥"],
        ["eotm", "Employé du mois", "🏆"]
    ];
    return new ActionRowBuilder().addComponents(
        pages.map(([id, label, emoji]) =>
            btn(`biz:nav:${id}`, label, id === page ? ButtonStyle.Primary : ButtonStyle.Secondary, { emoji })
        )
    );
}

async function userLabel(client, id) {
    const user = await client.users.fetch(id).catch(() => null);
    return user ? user.username : `Utilisateur ${id}`;
}

/*
==================================================
PAGES DU TABLEAU DE BORD (patron)
==================================================
*/

function homePage(view, wallet) {
    const { biz, stats, passive, collectable, employees } = view;
    const fullIn = stats.hourly > 0 ? ((stats.storageMax - passive) / stats.hourly) * HOUR : 0;
    const leader = view.monthTop;

    const embed = new EmbedBuilder()
        .setTitle(`🏢 ${biz.name}`)
        .setColor(collectable > 0 ? "Gold" : "Blurple")
        .setDescription(
            `**💰 À encaisser : ${money(collectable)}**\n` +
                `${bar(stats.storageMax ? passive / stats.storageMax : 0)} ` +
                `${Math.floor((passive / (stats.storageMax || 1)) * 100)} %\n` +
                `Revenu passif ${money(passive)} / ${money(stats.storageMax)}` +
                (passive >= stats.storageMax
                    ? " — ⚠️ **coffre plein**, encaisse pour ne rien perdre !"
                    : ` — plein ${ts(Date.now() + fullIn)}`) +
                `\nParts des employés : ${money(biz.vault)}`
        )
        .addFields(
            {
                name: "📈 Revenu passif",
                value: `**${money(stats.hourly)} / h**\n×${stats.multiplier.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} (marketing + équipe)`,
                inline: true
            },
            {
                name: "🤖 Robots",
                value: `${stats.botCount} / ${stats.maxBots}\n+${money(stats.botIncome)} / h`,
                inline: true
            },
            {
                name: "👥 Employés",
                value: `${employees.length} / ${stats.maxEmployees}\n+${Math.round(BUSINESS.EMPLOYEE_BONUS * 100)} % chacun`,
                inline: true
            },
            {
                name: `🏆 Employé du mois (${monthLabel(monthKey())})`,
                value: leader
                    ? `En tête : <@${leader.userId}> — ${money(leader.contributed)}`
                    : "Personne pour l'instant",
                inline: true
            },
            { name: "📊 Total encaissé", value: money(biz.totalEarned), inline: true },
            { name: "👛 Ton portefeuille", value: money(wallet), inline: true }
        )
        .setFooter({ text: `Créée le ${new Date(biz.createdAt).toLocaleDateString("fr-FR")}` });

    const actions = new ActionRowBuilder().addComponents(
        btn("biz:collect", `Encaisser ${money(collectable)}`, ButtonStyle.Success, {
            emoji: "💰",
            disabled: collectable <= 0
        }),
        btn("biz:refresh", "Actualiser", ButtonStyle.Secondary, { emoji: "🔄" })
    );
    return { embeds: [embed], components: [navRow("home"), actions] };
}

function upgradesPage(view, wallet) {
    const { biz } = view;
    const lines = Object.entries(UPGRADES).map(([key, u]) => {
        const lvl = biz[key];
        const cost = upgradeCost(key, lvl);
        const head = `${u.emoji} **${u.name}** — niv. ${lvl}/${u.max}`;
        if (cost === null) return `${head} ✅ MAX\n└ ${u.effect(lvl)}`;
        return `${head}\n└ ${u.effect(lvl)} → **${u.effect(lvl + 1)}** · ${money(cost)}`;
    });

    const embed = new EmbedBuilder()
        .setTitle(`⬆️ Améliorations — ${biz.name}`)
        .setColor("Blue")
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: `Portefeuille : ${money(wallet)} · le revenu déjà accumulé est conservé` });

    const row = new ActionRowBuilder().addComponents(
        Object.entries(UPGRADES).map(([key, u]) => {
            const cost = upgradeCost(key, biz[key]);
            return btn(`biz:up:${key}`, cost === null ? `${u.name} MAX` : money(cost), ButtonStyle.Primary, {
                emoji: u.emoji,
                disabled: cost === null || cost > wallet
            });
        })
    );
    return { embeds: [embed], components: [navRow("upgrades"), row] };
}

function botsPage(view, wallet, confirm) {
    const { biz, bots, stats } = view;
    const full = stats.botCount >= stats.maxBots;
    const lines = Object.entries(BOTS).map(
        ([type, b]) =>
            `${b.emoji} **${b.name}** × ${bots[type] || 0}\n` +
            `└ +${money(b.income)} / h · ${money(b.cost)} (rentabilisé en ~${Math.ceil(b.cost / b.income)} h)`
    );

    const embed = new EmbedBuilder()
        .setTitle(`🤖 Robots — ${biz.name}`)
        .setColor("DarkAqua")
        .setDescription(
            "Les robots travaillent **24 h/24** et ne prennent jamais de pause. Leur revenu est boosté par le marketing et l'équipe.\n\n" +
                lines.join("\n\n")
        )
        .addFields({
            name: "Emplacements",
            value: `${stats.botCount} / ${stats.maxBots}${full ? " — améliore l'**Automatisation** pour en ajouter" : ""}`
        })
        .setFooter({ text: `Portefeuille : ${money(wallet)} · revente à 50 % du prix` });

    const buy = new ActionRowBuilder().addComponents(
        Object.entries(BOTS).map(([type, b]) =>
            btn(`biz:bot:buy:${type}`, `${b.name} · ${money(b.cost)}`, ButtonStyle.Success, {
                emoji: b.emoji,
                disabled: full || b.cost > wallet
            })
        )
    );
    const sell = new ActionRowBuilder().addComponents(
        Object.entries(BOTS).map(([type, b]) => {
            const confirming = confirm?.action === "sell" && confirm.arg === type;
            return btn(
                `biz:bot:sell:${type}`,
                confirming ? `Confirmer (+${money(Math.floor(b.cost / 2))})` : `Revendre ${b.name}`,
                confirming ? ButtonStyle.Danger : ButtonStyle.Secondary,
                { disabled: !bots[type] }
            );
        })
    );
    return { embeds: [embed], components: [navRow("bots"), buy, sell] };
}

async function staffPage(view, client, confirm) {
    const { biz, employees, stats } = view;
    const lines = employees.map(
        (e, i) =>
            `${MEDALS[i] || "▫️"} <@${e.userId}> — ${money(e.contributed)} rapportés · ${e.works} service(s) · depuis ${ts(e.hiredAt)}`
    );

    const embed = new EmbedBuilder()
        .setTitle(`👥 Employés — ${biz.name} (${employees.length}/${stats.maxEmployees})`)
        .setColor("Green")
        .setDescription(
            (lines.length ? lines.join("\n") : "_Aucun employé humain pour l'instant._") +
                "\n\n**Pourquoi recruter ?**\n" +
                `• Chaque employé ajoute **+${Math.round(BUSINESS.EMPLOYEE_BONUS * 100)} %** au revenu passif\n` +
                `• À chaque \`/work\`, **${Math.round(BUSINESS.WORK_SHARE * 100)} %** de son salaire est versé en plus dans ton coffre\n` +
                `• L'employé touche **+${Math.round(BUSINESS.WORK_BONUS * 100)} %** de salaire et peut devenir employé du mois`
        );

    const rows = [navRow("staff")];
    if (employees.length < stats.maxEmployees) {
        rows.push(
            new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder().setCustomId("biz:hire").setPlaceholder("➕ Recruter un joueur…")
            )
        );
    }
    if (employees.length) {
        const options = await Promise.all(
            employees.slice(0, 25).map(async (e) => ({
                label: await userLabel(client, e.userId),
                description: `${money(e.contributed)} rapportés`,
                value: e.userId
            }))
        );
        rows.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("biz:fire")
                    .setPlaceholder("🚪 Licencier un employé…")
                    .addOptions(options)
            )
        );
    }
    if (confirm?.action === "fire") {
        rows.push(
            new ActionRowBuilder().addComponents(
                btn(`biz:fireok:${confirm.arg}`, `Confirmer le licenciement de ${confirm.label}`, ButtonStyle.Danger),
                btn("biz:nav:staff", "Annuler")
            )
        );
    }
    return { embeds: [embed], components: rows };
}

function eotmPage(economy, view) {
    const { biz } = view;
    const month = monthKey();
    const ranking = economy.monthRanking(biz.id, month).slice(0, 10);
    const awards = economy.recentAwards(biz.id, 6);

    const embed = new EmbedBuilder()
        .setTitle(`🏆 Employé du mois — ${biz.name}`)
        .setColor("Gold")
        .setDescription(
            `L'employé qui rapporte le plus à l'entreprise avec \`/work\` en **${monthLabel(month)}** reçoit une prime ` +
                `de **${money(BUSINESS.EMPLOYEE_OF_MONTH.BASE)} + ${Math.round(BUSINESS.EMPLOYEE_OF_MONTH.SHARE * 100)} %** de ce qu'il a rapporté.\n` +
                `Résultats ${ts(nextMonthStart())}.`
        )
        .addFields(
            {
                name: `📅 Classement de ${monthLabel(month)}`,
                value: ranking.length
                    ? ranking
                          .map(
                              (r, i) =>
                                  `${MEDALS[i] || `**${i + 1}.**`} <@${r.userId}> — ${money(r.contributed)} · ${r.works} service(s)` +
                                  (i === 0
                                      ? `\n└ Prime actuelle : **${money(employeeOfMonthPrize(r.contributed))}**`
                                      : "")
                          )
                          .join("\n")
                    : "_Personne n'a encore travaillé ce mois-ci._"
            },
            {
                name: "🎖️ Palmarès",
                value: awards.length
                    ? awards
                          .map(
                              (a) =>
                                  `**${monthLabel(a.month)}** : <@${a.userId}> — ${money(a.contributed)} (prime ${money(a.prize)})`
                          )
                          .join("\n")
                    : "_Aucun employé du mois pour l'instant._"
            }
        );
    return { embeds: [embed], components: [navRow("eotm")] };
}

async function renderOwner(interaction, page, confirm) {
    const economy = interaction.client.economy;
    const biz = economy.getBusinessByOwner(interaction.user.id);
    if (!biz) return { content: "❌ Tu n'as plus d'entreprise.", embeds: [], components: [] };
    const view = economy.getBusinessView(biz.id);
    view.monthTop = economy.monthRanking(biz.id, monthKey())[0] || null;
    const wallet = economy.getUser(interaction.user.id).money;

    if (page === "upgrades") return upgradesPage(view, wallet);
    if (page === "bots") return botsPage(view, wallet, confirm);
    if (page === "staff") return staffPage(view, interaction.client, confirm);
    if (page === "eotm") return eotmPage(economy, view);
    return homePage(view, wallet);
}

/*
==================================================
OFFRE D'EMPLOI (commande ou menu)
==================================================
*/

async function sendJobOffer(source, ownerId, target, { followUp = false } = {}) {
    const economy = source.client.economy;
    const reply = (content) =>
        followUp
            ? source.followUp({ content, flags: EPHEMERAL, allowedMentions: NO_PINGS })
            : source.reply({ content, flags: EPHEMERAL, allowedMentions: NO_PINGS });

    const biz = economy.getBusinessByOwner(ownerId);
    if (!biz) return reply("❌ Tu n'as pas d'entreprise.");
    if (target.bot || target.id === ownerId) return reply("❌ Tu ne peux pas recruter ce joueur.");
    const current = economy.getEmployment(target.id);
    if (current) return reply(`❌ ${target.username} travaille déjà chez **${current.name}**.`);
    if (economy.getBusinessByOwner(target.id)) return reply(`❌ ${target.username} dirige déjà sa propre entreprise.`);
    const view = economy.getBusinessView(biz.id);
    if (view.employees.length >= view.stats.maxEmployees) {
        return reply("❌ Plus de place : améliore tes **Bureaux** pour recruter.");
    }

    const row = new ActionRowBuilder().addComponents(
        btn("hire_yes", "Accepter", ButtonStyle.Success, { emoji: "✅" }),
        btn("hire_no", "Refuser", ButtonStyle.Danger)
    );
    const offer = {
        embeds: [
            new EmbedBuilder()
                .setTitle("💼 Offre d'emploi")
                .setColor("Blurple")
                .setDescription(
                    `${target}, **${biz.name}** (patron : <@${ownerId}>) te propose un emploi !\n\n` +
                        `• **+${Math.round(BUSINESS.WORK_BONUS * 100)} %** de salaire sur \`/work\`\n` +
                        "• Une prime si tu deviens **employé du mois** 🏆\n" +
                        `• Revenu de l'entreprise : ${money(view.stats.hourly)} / h`
                )
                .setFooter({ text: "L'offre expire dans 60 secondes" })
        ],
        components: [row],
        allowedMentions: { users: [target.id] }
    };

    const message = followUp
        ? await source.followUp(offer)
        : (await source.reply({ ...offer, withResponse: true })).resource.message;

    const click = await message
        .awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (b) => {
                if (b.user.id === target.id) return true;
                b.reply({ content: "❌ Cette offre ne t'est pas destinée.", flags: EPHEMERAL }).catch(() => {});
                return false;
            },
            time: 60000
        })
        .catch(() => null);

    const done = (content) => ({ content, embeds: [], components: [], allowedMentions: NO_PINGS });
    const edit = (opts) => (followUp ? source.webhook.editMessage(message, opts) : source.editReply(opts));
    if (!click) return edit(done(`⌛ L'offre de **${biz.name}** à ${target} a expiré.`));
    if (click.customId === "hire_no") return click.update(done(`❌ ${target} a refusé l'offre de **${biz.name}**.`));

    const status = economy.hire(biz.id, target.id);
    if (status === "full") return click.update(done(`❌ **${biz.name}** n'a plus de place.`));
    if (status !== "ok") return click.update(done("❌ Tu as déjà un emploi (ou ta propre entreprise)."));
    return click.update(done(`✅ ${target} a rejoint **${biz.name}** ! 🎉`));
}

/*
==================================================
VUES SANS BOUTONS (employé, visiteur)
==================================================
*/

function publicEmbed(economy, biz, title) {
    const view = economy.getBusinessView(biz.id);
    const leader = economy.monthRanking(biz.id, monthKey())[0];
    const botsText =
        Object.entries(view.bots)
            .map(([type, n]) => `${BOTS[type].emoji} ${n}`)
            .join("  ") || "aucun";
    return new EmbedBuilder()
        .setTitle(title || `🏢 ${biz.name}`)
        .setColor("Blurple")
        .addFields(
            { name: "👔 Patron", value: `<@${biz.ownerId}>`, inline: true },
            { name: "📈 Revenu passif", value: `${money(view.stats.hourly)} / h`, inline: true },
            { name: "📊 Total encaissé", value: money(biz.totalEarned), inline: true },
            { name: "👥 Employés", value: `${view.employees.length} / ${view.stats.maxEmployees}`, inline: true },
            { name: "🤖 Robots", value: `${botsText} (${view.stats.botCount}/${view.stats.maxBots})`, inline: true },
            {
                name: "🏆 Employé du mois",
                value: leader ? `<@${leader.userId}> (en tête)` : "—",
                inline: true
            },
            {
                name: "⬆️ Améliorations",
                value: Object.entries(UPGRADES)
                    .map(([k, u]) => `${u.emoji} ${u.name} ${biz[k]}/${u.max}`)
                    .join(" · ")
            }
        );
}

async function employeeMenu(interaction, job) {
    const economy = interaction.client.economy;
    const biz = economy.getBusiness(job.businessId);
    const month = monthKey();
    const ranking = economy.monthRanking(biz.id, month);
    const rank = ranking.findIndex((r) => r.userId === interaction.user.id);
    const mine = ranking[rank];

    const embed = publicEmbed(economy, biz, `💼 Ton emploi chez ${biz.name}`).addFields({
        name: `🙋 Toi (${monthLabel(month)})`,
        value: mine
            ? `**${rank + 1}ᵉ** sur ${ranking.length} · ${money(mine.contributed)} rapportés · ${mine.works} service(s)` +
              (rank === 0
                  ? `\n🏆 Tu es en tête ! Prime actuelle : ${money(employeeOfMonthPrize(mine.contributed))}`
                  : "")
            : "Pas encore de `/work` ce mois-ci. Au boulot !"
    });
    embed.setFooter({
        text: `Depuis ton arrivée : ${money(job.contributed)} rapportés en ${job.works} service(s)`
    });

    const response = await interaction.reply({
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(btn("biz:quit", "Démissionner", ButtonStyle.Danger, { emoji: "🚪" }))
        ],
        flags: EPHEMERAL,
        withResponse: true
    });

    const message = response.resource.message;
    let click = await message.awaitMessageComponent({ time: IDLE }).catch(() => null);
    if (!click) return interaction.editReply({ components: [] }).catch(() => {});
    await click.update({
        components: [
            new ActionRowBuilder().addComponents(
                btn("biz:quitok", `Oui, quitter ${biz.name}`, ButtonStyle.Danger),
                btn("biz:quitno", "Annuler")
            )
        ]
    });
    click = await message.awaitMessageComponent({ time: 60000 }).catch(() => null);
    if (!click || click.customId !== "biz:quitok") {
        return (click ? click.update({ components: [] }) : interaction.editReply({ components: [] })).catch(() => {});
    }
    const ok = economy.removeEmployee(interaction.user.id);
    return click.update({
        content: ok ? `🚪 Tu as quitté **${biz.name}**.` : "❌ Tu n'as plus d'emploi.",
        embeds: [],
        components: [],
        allowedMentions: NO_PINGS
    });
}

function introEmbed() {
    return new EmbedBuilder()
        .setTitle("🏢 Créer ton entreprise")
        .setColor("Blurple")
        .setDescription(
            `Tu n'as pas encore d'entreprise. Fonde-la avec \`/entreprise creer\` pour **${money(BUSINESS.PRICE)}** :\n\n` +
                `💰 **Revenu passif** : ${money(BUSINESS.BASE_INCOME)} / h dès le départ, même hors ligne\n` +
                "⬆️ **Améliorations** : marketing, bureaux, coffre-fort, automatisation\n" +
                "🤖 **Robots** : des employés qui travaillent 24 h/24\n" +
                "👥 **Employés humains** : boostent le revenu et versent une part de leur `/work`\n" +
                "🏆 **Employé du mois** : une prime pour le meilleur employé chaque mois\n\n" +
                "_Tu peux aussi te faire embaucher par un autre joueur._"
        );
}

/*
==================================================
COMMANDE
==================================================
*/

module.exports = {
    data: new SlashCommandBuilder()
        .setName("entreprise")
        .setDescription("Gérer ton entreprise : revenu passif, améliorations, employés")
        .addSubcommand((s) => s.setName("menu").setDescription("Ouvrir le tableau de bord de ton entreprise"))
        .addSubcommand((s) =>
            s
                .setName("creer")
                .setDescription(`Fonder une entreprise (${BUSINESS.PRICE.toLocaleString("fr-FR")} $)`)
                .addStringOption((o) =>
                    o
                        .setName("nom")
                        .setDescription("Nom de l'entreprise")
                        .setRequired(true)
                        .setMinLength(2)
                        .setMaxLength(40)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("recruter")
                .setDescription("Proposer un emploi à un joueur")
                .addUserOption((o) => o.setName("joueur").setDescription("Joueur à recruter").setRequired(true))
        )
        .addSubcommand((s) =>
            s
                .setName("voir")
                .setDescription("Voir l'entreprise d'un joueur")
                .addUserOption((o) => o.setName("joueur").setDescription("Patron ou employé").setRequired(true))
        )
        .addSubcommand((s) => s.setName("classement").setDescription("Les entreprises les plus rentables")),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (sub === "creer") {
            const name = interaction.options.getString("nom").trim();
            const status = economy.createBusiness(userId, name, BUSINESS.PRICE);
            const errors = {
                exists: "❌ Tu possèdes déjà une entreprise.",
                employed: "❌ Tu es employé ailleurs : démissionne d'abord (`/entreprise menu`).",
                money: `❌ Il te faut ${money(BUSINESS.PRICE)} en poche.`
            };
            if (errors[status]) return interaction.reply({ content: errors[status], flags: EPHEMERAL });
            return interaction.reply({
                content:
                    `🏢 Entreprise **${name}** fondée ! Elle rapporte déjà **${money(BUSINESS.BASE_INCOME)} / h**.\n` +
                    "Ouvre ton tableau de bord avec `/entreprise menu`.",
                allowedMentions: NO_PINGS
            });
        }

        if (sub === "recruter") {
            return sendJobOffer(interaction, userId, interaction.options.getUser("joueur"));
        }

        if (sub === "voir") {
            const target = interaction.options.getUser("joueur");
            const job = economy.getEmployment(target.id);
            const biz = economy.getBusinessByOwner(target.id) || (job && economy.getBusiness(job.businessId));
            if (!biz) {
                return interaction.reply({
                    content: `❌ ${target.username} n'a ni entreprise ni emploi.`,
                    flags: EPHEMERAL,
                    allowedMentions: NO_PINGS
                });
            }
            return interaction.reply({ embeds: [publicEmbed(economy, biz)], allowedMentions: NO_PINGS });
        }

        if (sub === "classement") {
            const top = economy.topBusinesses(10);
            const lines = top.map((b, i) => {
                const { stats } = economy.getBusinessView(b.id);
                return (
                    `${MEDALS[i] || `**${i + 1}.**`} **${b.name}** — <@${b.ownerId}>\n` +
                    `└ ${money(b.totalEarned)} encaissés · ${money(stats.hourly)} / h · 👥 ${b.employeeCount}`
                );
            });
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🏆 Classement des entreprises")
                        .setColor("Gold")
                        .setDescription(lines.join("\n") || "_Aucune entreprise pour l'instant._")
                ],
                allowedMentions: NO_PINGS
            });
        }

        // ---------- menu ----------
        if (!economy.getBusinessByOwner(userId)) {
            const job = economy.getEmployment(userId);
            if (job) return employeeMenu(interaction, job);
            return interaction.reply({ embeds: [introEmbed()], flags: EPHEMERAL });
        }

        let page = "home";
        let confirm = null;
        const response = await interaction.reply({
            ...(await renderOwner(interaction, page)),
            flags: EPHEMERAL,
            allowedMentions: NO_PINGS,
            withResponse: true
        });

        const collector = response.resource.message.createMessageComponentCollector({ idle: IDLE });

        collector.on("collect", async (i) => {
            try {
                const [, action, arg, extra] = i.customId.split(":");
                let notice = null;
                const previousConfirm = confirm;
                confirm = null;

                if (action === "nav") {
                    page = arg;
                } else if (action === "collect") {
                    const result = economy.collectBusiness(userId);
                    notice = result?.amount
                        ? `💰 Tu as encaissé **${money(result.amount)}** (passif ${money(result.passive)} + employés ${money(result.vault)}).`
                        : "Rien à encaisser pour l'instant.";
                } else if (action === "up") {
                    const biz = economy.getBusinessByOwner(userId);
                    const cost = biz && upgradeCost(arg, biz[arg]);
                    const status = cost === null ? "max" : economy.buyUpgrade(userId, arg, cost);
                    notice = {
                        ok: `✅ **${UPGRADES[arg].name}** amélioré au niveau ${biz[arg] + 1} pour ${money(cost)}.`,
                        max: "❌ Niveau maximum atteint.",
                        money: `❌ Il te faut ${money(cost)} en poche.`,
                        none: "❌ Tu n'as plus d'entreprise."
                    }[status];
                } else if (action === "bot" && arg === "buy") {
                    const status = economy.buyBot(userId, extra);
                    notice = {
                        ok: `✅ ${BOTS[extra].emoji} **${BOTS[extra].name}** installé !`,
                        full: "❌ Plus d'emplacement : améliore l'**Automatisation**.",
                        money: `❌ Il te faut ${money(BOTS[extra].cost)} en poche.`,
                        none: "❌ Tu n'as plus d'entreprise."
                    }[status];
                } else if (action === "bot" && arg === "sell") {
                    if (previousConfirm?.action === "sell" && previousConfirm.arg === extra) {
                        const refund = economy.sellBot(userId, extra);
                        notice = refund
                            ? `💸 ${BOTS[extra].name} revendu pour ${money(refund)}.`
                            : "❌ Aucun robot à revendre.";
                    } else {
                        confirm = { action: "sell", arg: extra };
                    }
                } else if (action === "hire") {
                    await i.update(await renderOwner(interaction, page, confirm));
                    const target = i.users.first();
                    return sendJobOffer(i, userId, target, { followUp: true }).catch((err) =>
                        console.error("❌ Offre d'emploi :", err)
                    );
                } else if (action === "fire") {
                    const targetId = i.values[0];
                    confirm = { action: "fire", arg: targetId, label: await userLabel(i.client, targetId) };
                } else if (action === "fireok") {
                    const biz = economy.getBusinessByOwner(userId);
                    const ok = biz && economy.removeEmployee(arg, biz.id);
                    notice = ok ? `🚪 <@${arg}> a été licencié.` : "❌ Cet employé ne travaille plus chez toi.";
                    if (ok) {
                        const fired = await i.client.users.fetch(arg).catch(() => null);
                        fired?.send(`🚪 Tu as été licencié de **${biz.name}**.`).catch(() => {});
                    }
                } else if (action !== "refresh") {
                    return;
                }

                const view = await renderOwner(interaction, page, confirm);
                await i.update({ ...view, content: notice || "", allowedMentions: NO_PINGS });
            } catch (err) {
                console.error("❌ Erreur tableau de bord entreprise :", err);
                i.reply({ content: "❌ Une erreur est survenue.", flags: EPHEMERAL }).catch(() => {});
            }
        });

        collector.on("end", () => {
            interaction.editReply({ components: [] }).catch(() => {});
        });
    }
};
