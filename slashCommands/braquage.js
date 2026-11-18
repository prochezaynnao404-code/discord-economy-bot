const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { EPHEMERAL, money, duration } = require("../utils/helpers");
const { HEIST, ROLES, TARGETS, makeMission, missionSuccess, resolveHeist, roundCount } = require("../utils/heist");
const { syncTitles, newTitlesText } = require("../utils/titles");

const NO_PINGS = { parse: [] };
const MEDALS = ["🥇", "🥈", "🥉"];
const ts = (ms, style = "R") => `<t:${Math.floor(ms / 1000)}:${style}>`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stars = (d) => "★".repeat(d) + "☆".repeat(4 - d);
const pct = (v) => `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

// Joueurs déjà dans une équipe (salle d'attente ou braquage en cours)
const active = new Set();

function blockerText(blocker, target) {
    if (blocker.reason === "jail") return `🚔 en prison encore **${duration(blocker.remaining)}**`;
    if (blocker.reason === "cooldown") return `⏳ prochain braquage dans **${duration(blocker.remaining)}**`;
    return `💸 il faut **${money(target.fee)}** en poche pour le matériel`;
}

function chunk(list, size) {
    const rows = [];
    for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
    return rows;
}

// ---------- Salle d'attente ----------

function holderOf(state, role) {
    for (const [userId, r] of state.members) if (r === role) return userId;
    return null;
}

function isReady(state) {
    return state.members.size >= state.target.minPlayers && [...state.members.values()].every(Boolean);
}

function lobbyEmbed(state) {
    const t = state.target;
    const waiting = [...state.members].filter(([, r]) => !r).map(([id]) => `<@${id}>`);
    const embed = new EmbedBuilder()
        .setTitle(`${t.emoji} Braquage : ${t.name}`)
        .setColor("Orange")
        .setDescription(
            `**Chef :** <@${state.leader}>\n` +
                `**Difficulté :** ${stars(t.difficulty)} · ${roundCount(t.difficulty)} manches par mission\n` +
                `**Équipe :** ${state.members.size}/5 (minimum ${t.minPlayers})\n` +
                `**Matériel :** ${money(t.fee)} par personne\n` +
                `**Butin :** ${money(t.loot[0])} – ${money(t.loot[1])} à partager\n` +
                `**Si arrêté :** ${duration(t.jail)} de prison (caution ${money(t.bail)})\n\n` +
                `Choisis un rôle pour rejoindre l'équipe : chacun aura **sa propre mission**.\n` +
                `⌛ Salle fermée ${ts(state.expiresAt)}`
        )
        .addFields({
            name: "🎭 Rôles",
            value: Object.entries(ROLES)
                .map(([key, r]) => {
                    const holder = holderOf(state, key);
                    return (
                        `${r.emoji} **${r.name}** — ${r.job}\n` +
                        `└ ${holder ? `<@${holder}>` : `_libre (sans joueur : ${pct(HEIST.UNASSIGNED_CHANCE)} de réussite)_`}`
                    );
                })
                .join("\n")
        });
    if (waiting.length) embed.addFields({ name: "⏳ Sans rôle", value: waiting.join(", ") });
    return embed.setFooter({ text: "❓ Rôles : le détail de chaque mission" });
}

function lobbyRows(state) {
    const roles = new ActionRowBuilder().addComponents(
        Object.entries(ROLES).map(([key, r]) => {
            const taken = !!holderOf(state, key);
            return new ButtonBuilder()
                .setCustomId(`heist:role:${key}`)
                .setLabel(r.name)
                .setEmoji(r.emoji)
                .setStyle(taken ? ButtonStyle.Secondary : ButtonStyle.Success)
                .setDisabled(taken);
        })
    );
    const actions = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("heist:launch")
            .setLabel("Lancer le braquage")
            .setEmoji("🚀")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!isReady(state)),
        new ButtonBuilder().setCustomId("heist:help").setLabel("Rôles").setEmoji("❓").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("heist:leave")
            .setLabel("Quitter")
            .setEmoji("🚪")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("heist:cancel").setLabel("Annuler").setEmoji("✖️").setStyle(ButtonStyle.Danger)
    );
    return [roles, actions];
}

function lobbyView(state) {
    return { embeds: [lobbyEmbed(state)], components: lobbyRows(state), allowedMentions: NO_PINGS };
}

function helpEmbed(target) {
    return new EmbedBuilder()
        .setTitle("❓ Les rôles du braquage")
        .setColor("Blurple")
        .setDescription(
            Object.values(ROLES)
                .map((r) => `${r.emoji} **${r.name}** — ${r.job}\n└ 🎮 ${r.task}\n└ ❌ Si raté : ${r.fail}`)
                .join("\n\n") +
                `\n\n**Règles :** ${roundCount(target.difficulty)} manches par mission, ` +
                `${HEIST.MISTAKES_ALLOWED} erreur tolérée. Chaque alerte augmente le risque d'arrestation ` +
                `de ${pct(HEIST.ARREST_PER_ALERT)} ; un bon chauffeur le divise par 2. ` +
                "Avec 3 alertes, la police arrive avant l'ouverture du coffre. Un joueur arrêté perd sa part."
        );
}

function closedView(state, text) {
    return {
        embeds: [
            new EmbedBuilder()
                .setTitle(`${state.target.emoji} Braquage : ${state.target.name}`)
                .setColor("Grey")
                .setDescription(text)
        ],
        components: [],
        allowedMentions: NO_PINGS
    };
}

// ---------- Missions ----------

const STATUS = { wait: "⏳ n'a pas commencé", play: "🎮 en mission…", ok: "✅ réussie", fail: "❌ ratée" };

function missionView(state, status, endsAt, done = false) {
    const t = state.target;
    const lines = Object.entries(ROLES).map(([key, r]) => {
        const holder = holderOf(state, key);
        if (!holder) return `${r.emoji} **${r.name}** — 🎲 personne (${pct(HEIST.UNASSIGNED_CHANCE)} au hasard)`;
        return `${r.emoji} **${r.name}** <@${holder}> — ${STATUS[status.get(holder)]}`;
    });
    return {
        embeds: [
            new EmbedBuilder()
                .setTitle(`${t.emoji} Braquage en cours : ${t.name}`)
                .setColor("Red")
                .setDescription(
                    done
                        ? "🚨 Fin des missions, l'équipe se retrouve…"
                        : "Chaque membre clique sur **🎯 Ma mission** pour recevoir sa mission (visible par lui seul).\n" +
                              `⌛ Dernier délai pour commencer ${ts(endsAt)}`
                )
                .addFields({ name: "👥 Équipe", value: lines.join("\n") })
        ],
        components: done
            ? []
            : [
                  new ActionRowBuilder().addComponents(
                      new ButtonBuilder()
                          .setCustomId("heist:mission")
                          .setLabel("Ma mission")
                          .setEmoji("🎯")
                          .setStyle(ButtonStyle.Danger)
                  )
              ],
        allowedMentions: NO_PINGS
    };
}

function roundRows(round, n) {
    const buttons = round.buttons.map((b) => {
        const button = new ButtonBuilder()
            .setCustomId(`heistm:${n}:${b.id}`)
            .setStyle(ButtonStyle[b.style] ?? ButtonStyle.Secondary);
        if (b.emoji) button.setEmoji(b.emoji);
        if (b.label) button.setLabel(b.label);
        return button;
    });
    return chunk(buttons, round.perRow || 5).map((row) => new ActionRowBuilder().addComponents(row));
}

// Mission privée d'un membre : renvoie true si réussie
async function playMission(i, member, target) {
    const role = ROLES[member.role];
    const rounds = makeMission(member.role, target.difficulty);
    const embed = (text, color = "Orange") =>
        new EmbedBuilder().setTitle(`${role.emoji} ${role.name} — ${role.job}`).setColor(color).setDescription(text);

    const res = await i.reply({
        embeds: [
            embed(
                `🎮 **${role.task}.**\n${rounds.length} manches · ${HEIST.MISTAKES_ALLOWED} erreur tolérée\n\n` +
                    "Prépare-toi, ça commence…"
            )
        ],
        flags: EPHEMERAL,
        withResponse: true
    });
    const msg = res.resource.message;
    await sleep(2500);

    let correct = 0;
    let mistakes = 0;
    let feedback = "";
    for (let n = 0; n < rounds.length; n++) {
        const round = rounds[n];
        const head = `${feedback ? `${feedback}\n\n` : ""}**Manche ${n + 1}/${rounds.length}**\n`;
        if (round.preview) {
            await i.editReply({ embeds: [embed(head + round.preview)], components: [] });
            await sleep(round.previewMs);
        }
        await i.editReply({
            embeds: [embed(`${head}${round.text}\n\n⏳ ${round.time / 1000} secondes`)],
            components: roundRows(round, n)
        });
        const click = await msg
            .awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: (b) => b.user.id === member.userId && b.customId.startsWith(`heistm:${n}:`),
                time: round.time
            })
            .catch(() => null);
        if (click) await click.deferUpdate().catch(() => {});

        if (click?.customId === `heistm:${n}:${round.answer}`) {
            correct++;
            feedback = "✅ Bien joué !";
        } else {
            mistakes++;
            feedback = click ? "❌ Raté !" : "⏰ Trop lent !";
            if (mistakes > HEIST.MISTAKES_ALLOWED) break;
        }
    }

    const success = missionSuccess(correct, rounds.length);
    await i
        .editReply({
            embeds: [
                embed(
                    `${feedback}\n\n${success ? "✅ **Mission réussie !**" : "❌ **Mission ratée…**"} ` +
                        `(${correct}/${rounds.length})\nRegarde le salon pour le résultat du braquage.`,
                    success ? "Green" : "Red"
                )
            ],
            components: []
        })
        .catch(() => {});
    return success;
}

// ---------- Résultat ----------

function resultView(state, result, now) {
    const t = state.target;
    const free = result.outcomes.filter((o) => !o.caught);
    const caught = result.outcomes.length - free.length;

    let title;
    let color;
    if (result.loot === 0 || free.length === 0) {
        title = result.loot === 0 ? "🚔 Fiasco total" : "🚔 Toute l'équipe est arrêtée";
        color = "DarkRed";
    } else if (caught) {
        title = "💰 Braquage réussi… avec des pertes";
        color = "Orange";
    } else {
        title = result.alerts === 0 && result.lootMult === 1 ? "💰 Braquage parfait !" : "💰 Braquage réussi";
        color = "Green";
    }

    const steps = Object.entries(ROLES).map(([key, r]) => {
        const res = result.roles[key];
        const who = res.auto ? "🎲 personne" : `<@${holderOf(state, key)}>`;
        return `${r.emoji} **${r.name}** (${who}) — ${res.ok ? "✅ réussi" : `❌ ${r.fail}`}`;
    });

    let lootText = money(result.loot);
    if (result.lootMult === 0) lootText += " (la police est arrivée avant l'ouverture du coffre)";
    else if (result.lootMult < 1) lootText += " (coffre mal ouvert)";

    const team = result.outcomes.map((o) =>
        o.caught
            ? `🚔 <@${o.userId}> arrêté — libre ${ts(now + t.jail)} ou caution de ${money(t.bail)}`
            : `${o.gain > 0 ? "💰" : "🏃"} <@${o.userId}> ${o.gain > 0 ? `+${money(o.gain)}` : "s'enfuit les mains vides"}`
    );

    return new EmbedBuilder()
        .setTitle(`${title} — ${t.emoji} ${t.name}`)
        .setColor(color)
        .addFields(
            { name: "📋 Déroulé", value: steps.join("\n") },
            {
                name: "📊 Bilan",
                value:
                    `🚨 Alertes : **${result.alerts}/3**\n💰 Butin : **${lootText}**\n` +
                    `🚔 Risque d'arrestation : **${pct(result.arrestChance)}**`
            },
            { name: "👥 Équipe", value: team.join("\n") }
        )
        .setFooter({
            text: caught
                ? "Les prisonniers : /braquage prison pour payer la caution"
                : `Prochain braquage dans ${duration(HEIST.COOLDOWN)}`
        });
}

async function runHeist(interaction, message, state, economy) {
    const members = [...state.members].map(([userId, role]) => ({ userId, role }));
    const status = new Map(members.map((m) => [m.userId, "wait"]));
    const results = {};
    const running = [];
    const endsAt = Date.now() + HEIST.MISSION_TIME;
    const refresh = () => interaction.editReply(missionView(state, status, endsAt)).catch(() => {});

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: HEIST.MISSION_TIME
    });

    collector.on("collect", async (b) => {
        const member = members.find((m) => m.userId === b.user.id);
        if (!member) {
            return b.reply({ content: "❌ Tu ne fais pas partie de cette équipe.", flags: EPHEMERAL }).catch(() => {});
        }
        if (status.get(member.userId) !== "wait") {
            return b.reply({ content: "❌ Tu as déjà reçu ta mission.", flags: EPHEMERAL }).catch(() => {});
        }
        status.set(member.userId, "play");
        refresh();
        const run = playMission(b, member, state.target)
            .catch(() => false)
            .then((ok) => {
                results[member.role] = ok;
                status.set(member.userId, ok ? "ok" : "fail");
                if ([...status.values()].every((s) => s === "ok" || s === "fail")) collector.stop("done");
                else refresh();
            });
        running.push(run);
    });

    await new Promise((resolve) => collector.once("end", resolve));
    await Promise.all(running); // on attend les missions encore en cours
    for (const m of members) if (status.get(m.userId) === "wait") status.set(m.userId, "fail");
    await interaction.editReply(missionView(state, status, endsAt, true)).catch(() => {});
    await sleep(2000);

    const now = Date.now();
    const result = resolveHeist(state.target, members, results);
    economy.finishHeist(result.outcomes, state.target, now);
    for (const m of members) active.delete(m.userId);

    const notices = members
        .map((m) => {
            const text = newTitlesText(syncTitles(economy, m.userId, now));
            return text && `<@${m.userId}> ${text}`;
        })
        .filter(Boolean);

    await interaction
        .editReply({
            content: notices.join("\n") || null,
            embeds: [resultView(state, result, now)],
            components: [],
            allowedMentions: NO_PINGS
        })
        .catch(() => {});
}

// ---------- Sous-commandes ----------

async function launch(interaction, economy) {
    const leader = interaction.user.id;
    const target = TARGETS[interaction.options.getString("cible")];

    if (active.has(leader)) {
        return interaction.reply({ content: "❌ Tu es déjà dans une équipe de braquage.", flags: EPHEMERAL });
    }
    const blocker = economy.heistBlocker(leader, { fee: target.fee, cooldown: HEIST.COOLDOWN });
    if (blocker) {
        return interaction.reply({ content: `❌ Impossible : ${blockerText(blocker, target)}.`, flags: EPHEMERAL });
    }

    const state = { leader, target, members: new Map([[leader, null]]), expiresAt: Date.now() + HEIST.LOBBY_TIME };
    active.add(leader);
    const release = () => {
        for (const id of state.members.keys()) active.delete(id);
    };

    let message;
    try {
        const res = await interaction.reply({ ...lobbyView(state), withResponse: true });
        message = res.resource.message;
    } catch (err) {
        release();
        throw err;
    }

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: HEIST.LOBBY_TIME
    });
    const deny = (b, content) => b.reply({ content, flags: EPHEMERAL }).catch(() => {});
    const limits = { fee: target.fee, cooldown: HEIST.COOLDOWN };

    collector.on("collect", async (b) => {
        const uid = b.user.id;
        const [, action, key] = b.customId.split(":");

        if (action === "help") return b.reply({ embeds: [helpEmbed(target)], flags: EPHEMERAL }).catch(() => {});

        if (action === "role") {
            const holder = holderOf(state, key);
            if (holder && holder !== uid) return deny(b, "❌ Ce rôle est déjà pris.");
            if (!state.members.has(uid)) {
                if (active.has(uid)) return deny(b, "❌ Tu es déjà dans une autre équipe de braquage.");
                const why = economy.heistBlocker(uid, limits);
                if (why) return deny(b, `❌ Tu ne peux pas rejoindre : ${blockerText(why, target)}.`);
                active.add(uid);
            }
            state.members.set(uid, key);
            return b.update(lobbyView(state)).catch(() => {});
        }

        if (action === "leave") {
            if (!state.members.has(uid)) return deny(b, "❌ Tu ne fais pas partie de l'équipe.");
            if (uid === state.leader) {
                collector.stop("cancel");
                return b.update(closedView(state, "✖️ Le chef a quitté : braquage annulé.")).catch(() => {});
            }
            state.members.delete(uid);
            active.delete(uid);
            return b.update(lobbyView(state)).catch(() => {});
        }

        if (uid !== state.leader) return deny(b, "❌ Seul le chef de l'équipe peut faire ça.");

        if (action === "cancel") {
            collector.stop("cancel");
            return b.update(closedView(state, "✖️ Braquage annulé par le chef.")).catch(() => {});
        }

        if (action === "launch") {
            if (!isReady(state)) {
                return deny(
                    b,
                    `❌ Il faut au moins **${target.minPlayers} joueurs** et que chacun ait choisi un rôle.`
                );
            }
            const start = economy.startHeist([...state.members.keys()], limits);
            if (!start.ok) {
                const lines = start.problems.map((p) => `<@${p.userId}> : ${blockerText(p, target)}`);
                if (start.problems.some((p) => p.userId === state.leader)) {
                    collector.stop("cancel");
                    return b.update(closedView(state, `✖️ Braquage annulé :\n${lines.join("\n")}`)).catch(() => {});
                }
                for (const p of start.problems) {
                    state.members.delete(p.userId);
                    active.delete(p.userId);
                }
                await b.update(lobbyView(state)).catch(() => {});
                return b
                    .followUp({
                        content: `⚠️ Retirés de l'équipe :\n${lines.join("\n")}`,
                        flags: EPHEMERAL,
                        allowedMentions: NO_PINGS
                    })
                    .catch(() => {});
            }
            collector.stop("launch");
            await b
                .update(
                    missionView(
                        state,
                        new Map([...state.members.keys()].map((id) => [id, "wait"])),
                        Date.now() + HEIST.MISSION_TIME
                    )
                )
                .catch(() => {});
            try {
                await runHeist(interaction, message, state, economy);
            } finally {
                release();
            }
        }
    });

    collector.on("end", (_, reason) => {
        if (reason === "launch") return;
        release();
        if (reason === "time") {
            interaction
                .editReply(closedView(state, "⌛ L'équipe n'était pas prête à temps : braquage annulé."))
                .catch(() => {});
        }
    });
}

async function prison(interaction, economy) {
    const userId = interaction.user.id;
    const jail = economy.getJail(userId);
    const user = economy.getUser(userId);

    if (!jail) {
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🕊️ Tu es libre")
                    .setColor("Green")
                    .setDescription(
                        `Braquages : **${user.heistsWon}** réussis sur **${user.heists}**\n` +
                            `Butin total : **${money(user.heistLoot)}**\nSéjours en prison : **${user.jailCount}**`
                    )
            ],
            flags: EPHEMERAL
        });
    }

    const view = (extra = "") => ({
        embeds: [
            new EmbedBuilder()
                .setTitle("🚔 Prison")
                .setColor("DarkRed")
                .setDescription(
                    `${interaction.user} est derrière les barreaux.\n\n` +
                        `🔓 Libération ${ts(jail.until)}\n💸 Caution : **${money(jail.bail)}**\n` +
                        `👛 En poche : **${money(economy.getUser(userId).money)}**\n\n` +
                        "_En prison : pas de `/work`, de `/rob` ni de `/braquage`._" +
                        (extra ? `\n\n${extra}` : "")
                )
        ],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("prison:bail")
                    .setLabel(`Payer la caution (${money(jail.bail)})`)
                    .setEmoji("💸")
                    .setStyle(ButtonStyle.Success)
            )
        ],
        allowedMentions: NO_PINGS
    });

    const res = await interaction.reply({ ...view(), withResponse: true });
    const collector = res.resource.message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000
    });
    collector.on("collect", async (b) => {
        if (b.user.id !== userId) {
            return b.reply({ content: "❌ Ce n'est pas ta cellule.", flags: EPHEMERAL }).catch(() => {});
        }
        const paid = economy.payBail(userId);
        if (paid.status === "money") {
            return b.update(view(`❌ Il te faut ${money(paid.bail)} en poche.`)).catch(() => {});
        }
        collector.stop("done");
        return b
            .update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🕊️ Libéré sous caution")
                        .setColor("Green")
                        .setDescription(
                            paid.status === "ok"
                                ? `${interaction.user} a payé **${money(paid.bail)}** et sort de prison.`
                                : `${interaction.user} est déjà libre.`
                        )
                ],
                components: [],
                allowedMentions: NO_PINGS
            })
            .catch(() => {});
    });
    collector.on("end", (_, reason) => {
        if (reason !== "done") interaction.editReply({ components: [] }).catch(() => {});
    });
}

async function ranking(interaction, economy) {
    const rows = economy.topHeisters(10);
    const text = rows.length
        ? rows
              .map(
                  (r, i) =>
                      `${MEDALS[i] || `**${i + 1}.**`} <@${r.userId}> — **${money(r.heistLoot)}** · ` +
                      `${r.heistsWon}/${r.heists} réussis · 🚔 ${r.jailCount}`
              )
              .join("\n")
        : "_Aucun braquage pour l'instant. Lance le premier avec `/braquage lancer` !_";
    return interaction.reply({
        embeds: [new EmbedBuilder().setTitle("🦹 Les plus grands braqueurs").setColor("DarkGold").setDescription(text)],
        allowedMentions: NO_PINGS
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("braquage")
        .setDescription("Braquage en équipe : chacun son rôle, chacun sa mission")
        .addSubcommand((s) =>
            s
                .setName("lancer")
                .setDescription("Monte une équipe et choisis la cible")
                .addStringOption((o) =>
                    o
                        .setName("cible")
                        .setDescription("La cible du braquage")
                        .setRequired(true)
                        .addChoices(
                            ...Object.entries(TARGETS).map(([value, t]) => ({
                                name: `${t.emoji} ${t.name} (${t.minPlayers}+ joueurs, butin ${money(t.loot[0])} – ${money(t.loot[1])})`,
                                value
                            }))
                        )
                )
        )
        .addSubcommand((s) => s.setName("prison").setDescription("Ta situation et la caution pour sortir de prison"))
        .addSubcommand((s) => s.setName("classement").setDescription("Les plus grands braqueurs")),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const sub = interaction.options.getSubcommand();
        if (sub === "prison") return prison(interaction, economy);
        if (sub === "classement") return ranking(interaction, economy);
        if (!interaction.channel) {
            return interaction.reply({ content: "❌ Commande indisponible ici.", flags: EPHEMERAL });
        }
        return launch(interaction, economy);
    }
};
