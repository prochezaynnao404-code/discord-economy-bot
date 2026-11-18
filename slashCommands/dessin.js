const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    ComponentType
} = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { EPHEMERAL, money, duration, pick, lockUser, unlockUser } = require("../utils/helpers");
const {
    PALETTE,
    DRAWING,
    DUEL,
    WORD_LIST,
    createCanvasState,
    serialize,
    isBlank,
    applyAction,
    checkGuess,
    wordHint,
    letterIndexes,
    roundPoints
} = require("../utils/drawing");
const { renderEditor, renderArtwork } = require("../utils/drawingRender");
const { syncTitles, newTitlesText } = require("../utils/titles");

const NO_PINGS = { parse: [] };
const MEDALS = ["🥇", "🥈", "🥉"];
const ts = (ms, style = "R") => `<t:${Math.floor(ms / 1000)}:${style}>`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/*
==================================================
ÉDITEUR (commun à l'atelier et au jeu)
==================================================
*/

function editorStatus(state) {
    const c = PALETTE[state.color];
    return (
        `📍 Case **${state.cursor.x + 1}, ${state.cursor.y + 1}** · ${c.emoji} **${c.name}**${state.color === 0 ? " (gomme)" : ""}\n` +
        (state.penDown
            ? "✏️ **Crayon baissé** : tu peins en te déplaçant"
            : "✏️ Crayon levé : 🖌️ pour peindre une case") +
        ` · Pas ×${state.step} · Taille ${state.brush}`
    );
}

function editorRows(state, prefix, extra = []) {
    const btn = (action, emoji, label, style = ButtonStyle.Secondary) => {
        const b = new ButtonBuilder().setCustomId(`${prefix}:${action}`).setEmoji(emoji).setStyle(style);
        if (label) b.setLabel(label);
        return b;
    };
    return [
        new ActionRowBuilder().addComponents(
            btn("left", "⬅️", null, ButtonStyle.Primary),
            btn("up", "⬆️", null, ButtonStyle.Primary),
            btn("down", "⬇️", null, ButtonStyle.Primary),
            btn("right", "➡️", null, ButtonStyle.Primary),
            btn("paint", "🖌️", "Peindre", ButtonStyle.Success)
        ),
        new ActionRowBuilder().addComponents(
            btn(
                "pen",
                "✏️",
                state.penDown ? "Lever" : "Baisser",
                state.penDown ? ButtonStyle.Danger : ButtonStyle.Secondary
            ),
            btn("fill", "🪣", "Remplir"),
            btn("step", "⏩", `Pas ×${state.step}`),
            btn("brush", "🔘", `Taille ${state.brush}`),
            btn("undo", "↩️", "Annuler")
        ),
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`${prefix}:color`)
                .setPlaceholder("🎨 Couleur…")
                .addOptions(
                    PALETTE.map((c, i) => ({
                        label: c.name,
                        value: String(i),
                        emoji: c.emoji,
                        default: i === state.color
                    }))
                )
        ),
        new ActionRowBuilder().addComponents(btn("eraser", "🧽", "Gomme"), btn("clear", "🗑️", "Tout effacer"), ...extra)
    ];
}

function editorPayload(state, { prefix, title, text = "", color = "Blurple", extra = [] }) {
    return {
        embeds: [
            new EmbedBuilder()
                .setTitle(title)
                .setColor(color)
                .setDescription(`${text ? `${text}\n\n` : ""}${editorStatus(state)}`)
                .setImage("attachment://dessin.png")
        ],
        files: [new AttachmentBuilder(renderEditor(state), { name: "dessin.png" })],
        attachments: [],
        components: editorRows(state, prefix, extra)
    };
}

// Renvoie true si le clic était une action de dessin (et l'applique)
function handleEditorClick(state, click, prefix) {
    if (!click.customId.startsWith(`${prefix}:`)) return null;
    const action = click.customId.slice(prefix.length + 1);
    const value = click.values?.[0];
    if (
        ![
            "left",
            "right",
            "up",
            "down",
            "paint",
            "pen",
            "fill",
            "step",
            "brush",
            "eraser",
            "color",
            "undo",
            "clear"
        ].includes(action)
    ) {
        return null;
    }
    applyAction(state, action, value);
    return action;
}

/*
==================================================
ATELIER
==================================================
*/

let modalCounter = 0;

async function askName(click, current) {
    const id = `dessin_nom_${Date.now()}_${modalCounter++}`;
    await click.showModal(
        new ModalBuilder()
            .setCustomId(id)
            .setTitle("💾 Enregistrer l'œuvre")
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("name")
                        .setLabel("Nom de l'œuvre")
                        .setPlaceholder("La Joconde 2.0")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(DRAWING.NAME_MAX)
                        .setValue(current || "")
                )
            )
    );
    const submit = await click
        .awaitModalSubmit({ time: 3 * 60 * 1000, filter: (m) => m.customId === id && m.user.id === click.user.id })
        .catch(() => null);
    if (!submit) return null;
    const name = submit.fields.getTextInputValue("name").replace(/\s+/g, " ").trim().slice(0, DRAWING.NAME_MAX);
    return { name, submit };
}

// open(payload) envoie le message de l'atelier (éphémère) et renvoie le message
async function runAtelier(open, economy, userId, drawing = null) {
    const state = createCanvasState(drawing?.pixels);
    const art = { id: drawing?.id ?? null, name: drawing?.name ?? null, dirty: false, confirmClose: false };

    const extra = () => [
        new ButtonBuilder()
            .setCustomId("atelier:save")
            .setEmoji("💾")
            .setLabel("Enregistrer")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("atelier:close")
            .setEmoji("✖️")
            .setLabel(art.confirmClose ? "Sûr ? Non enregistré" : "Fermer")
            .setStyle(ButtonStyle.Danger)
    ];
    const view = (text = "") =>
        editorPayload(state, {
            prefix: "atelier",
            title: `🎨 Atelier — ${art.name || "Sans titre"}${art.dirty ? " •" : ""}`,
            text,
            color: "Blurple",
            extra: extra()
        });

    const message = await open({
        ...view(
            drawing
                ? "Tu modifies ton œuvre. Pense à 💾 enregistrer."
                : "Déplace le curseur avec les flèches et peins ! **✏️ Baisser** le crayon pour tracer des traits."
        ),
        flags: EPHEMERAL,
        withResponse: true
    });

    const collector = message.createMessageComponentCollector({ idle: 10 * 60 * 1000 });
    collector.on("collect", async (click) => {
        if (click.user.id !== userId) return;
        if (handleEditorClick(state, click, "atelier")) {
            if (
                !["left", "right", "up", "down", "step", "brush", "color", "eraser"].includes(
                    click.customId.split(":")[1]
                )
            ) {
                art.dirty = true;
            }
            art.confirmClose = false;
            return click.update(view()).catch(() => {});
        }

        if (click.customId === "atelier:save") {
            if (isBlank(state)) return click.update(view("❌ Ta toile est vide.")).catch(() => {});
            const asked = await askName(click, art.name);
            if (!asked) return;
            if (!asked.name) return asked.submit.update(view("❌ Nom invalide.")).catch(() => {});
            const res = economy.saveDrawing(userId, asked.name, serialize(state), art.id);
            if (res.status === "full") {
                return asked.submit
                    .update(
                        view(
                            `❌ Tu as déjà **${DRAWING.MAX_PER_USER} œuvres**. Supprimes-en une dans \`/dessin galerie\`.`
                        )
                    )
                    .catch(() => {});
            }
            if (res.status === "notfound") art.id = null;
            else art.id = res.id;
            art.name = asked.name;
            art.dirty = false;
            art.confirmClose = false;
            const titles = newTitlesText(syncTitles(economy, userId));
            return asked.submit
                .update(
                    view(
                        `💾 **${art.name}** est enregistrée dans ta galerie (\`/dessin galerie\`).` +
                            (titles ? `\n${titles}` : "")
                    )
                )
                .catch(() => {});
        }

        if (click.customId === "atelier:close") {
            if (art.dirty && !art.confirmClose) {
                art.confirmClose = true;
                return click
                    .update(view("⚠️ Des changements ne sont pas enregistrés. Clique encore pour fermer quand même."))
                    .catch(() => {});
            }
            collector.stop("closed");
            return click
                .update({
                    content: "🎨 Atelier fermé.",
                    embeds: [],
                    files: [],
                    attachments: [],
                    components: []
                })
                .catch(() => {});
        }
    });
}

/*
==================================================
GALERIE
==================================================
*/

const artCache = new Map();
function artworkPng(d, authorName) {
    const key = `${d.id}:${d.updatedAt}:${authorName}`;
    if (!artCache.has(key)) {
        if (artCache.size > 100) artCache.clear();
        artCache.set(key, renderArtwork(d.pixels, { title: d.name, author: `par ${authorName}` }));
    }
    return artCache.get(key);
}

async function gallery(interaction, economy) {
    const target = interaction.options.getUser("joueur") || interaction.user;
    const viewer = interaction.user.id;
    if (target.bot) return interaction.reply({ content: "❌ Les bots ne dessinent pas.", flags: EPHEMERAL });

    let list = economy.getDrawings(target.id);
    if (!list.length) {
        return interaction.reply({
            content:
                target.id === viewer
                    ? "🖼️ Ta galerie est vide. Crée ta première œuvre avec `/dessin atelier` !"
                    : `🖼️ ${target.username} n'a encore rien exposé.`,
            flags: EPHEMERAL
        });
    }

    const own = target.id === viewer;
    let index = 0;
    let confirmDelete = false;
    const authorName = target.globalName || target.username;

    const view = (notice = "") => {
        const d = list[index];
        const rows = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("gal:prev")
                    .setEmoji("◀️")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(list.length < 2),
                new ButtonBuilder()
                    .setCustomId("gal:next")
                    .setEmoji("▶️")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(list.length < 2),
                new ButtonBuilder()
                    .setCustomId("gal:like")
                    .setEmoji("❤️")
                    .setLabel(String(d.likes))
                    .setStyle(ButtonStyle.Danger)
            )
        ];
        if (own) {
            rows[0].addComponents(
                new ButtonBuilder()
                    .setCustomId("gal:edit")
                    .setEmoji("✏️")
                    .setLabel("Modifier")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("gal:delete")
                    .setEmoji("🗑️")
                    .setLabel(confirmDelete ? "Confirmer" : "Supprimer")
                    .setStyle(confirmDelete ? ButtonStyle.Danger : ButtonStyle.Secondary)
            );
        }
        return {
            content: notice || null,
            embeds: [
                new EmbedBuilder()
                    .setTitle(`🖼️ ${d.name}`)
                    .setColor("DarkGold")
                    .setDescription(
                        `par <@${d.userId}> · ❤️ **${d.likes}** · ${d.updatedAt > d.createdAt ? "retouchée" : "créée"} ${ts(d.updatedAt, "D")}`
                    )
                    .setImage("attachment://oeuvre.png")
                    .setFooter({ text: `Œuvre ${index + 1}/${list.length} · galerie de ${authorName}` })
            ],
            files: [new AttachmentBuilder(artworkPng(d, authorName), { name: "oeuvre.png" })],
            attachments: [],
            components: rows,
            allowedMentions: NO_PINGS
        };
    };

    const res = await interaction.reply({ ...view(), withResponse: true });
    const collector = res.resource.message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        idle: 5 * 60 * 1000
    });

    collector.on("collect", async (b) => {
        const action = b.customId.split(":")[1];
        const d = list[index];

        if (action === "like") {
            const r = economy.toggleLike(d.id, b.user.id);
            if (!r)
                return b
                    .reply({ content: "❌ Tu ne peux pas aimer ta propre œuvre.", flags: EPHEMERAL })
                    .catch(() => {});
            d.likes = r.likes;
            await b.update(view()).catch(() => {});
            return b
                .followUp({ content: r.liked ? `❤️ Tu aimes **${d.name}**.` : "💔 J'aime retiré.", flags: EPHEMERAL })
                .catch(() => {});
        }

        if (b.user.id !== viewer) {
            return b
                .reply({ content: "❌ Ouvre ta propre `/dessin galerie` pour naviguer.", flags: EPHEMERAL })
                .catch(() => {});
        }

        if (action === "prev" || action === "next") {
            index = (index + (action === "next" ? 1 : -1) + list.length) % list.length;
            confirmDelete = false;
            return b.update(view()).catch(() => {});
        }
        if (!own) return;

        if (action === "edit") {
            confirmDelete = false;
            return runAtelier(
                async (payload) => (await b.reply(payload)).resource.message,
                economy,
                viewer,
                economy.getDrawing(d.id)
            ).catch(() => {});
        }
        if (action === "delete") {
            if (!confirmDelete) {
                confirmDelete = true;
                return b.update(view()).catch(() => {});
            }
            confirmDelete = false;
            economy.deleteDrawing(viewer, d.id);
            list = economy.getDrawings(viewer);
            if (!list.length) {
                collector.stop("empty");
                return b
                    .update({
                        content: "🗑️ Œuvre supprimée. Ta galerie est vide.",
                        embeds: [],
                        files: [],
                        attachments: [],
                        components: []
                    })
                    .catch(() => {});
            }
            index = Math.min(index, list.length - 1);
            return b.update(view(`🗑️ **${d.name}** a été supprimée.`)).catch(() => {});
        }
    });
    collector.on("end", (_, reason) => {
        if (reason !== "empty") interaction.editReply({ components: [] }).catch(() => {});
    });
}

/*
==================================================
DESSINE ET DEVINE (à deux)
==================================================
*/

function publicDrawing(state) {
    return new AttachmentBuilder(renderEditor(state, { showCursor: false }), { name: "dessin.png" });
}

async function invite(interaction, opponent) {
    const res = await interaction.reply({
        content: `${opponent}, ${interaction.user} te propose une partie de **🎨 Dessine et devine** !`,
        embeds: [
            new EmbedBuilder()
                .setTitle("🎨 Dessine et devine")
                .setColor("Blurple")
                .setDescription(
                    `**${DUEL.ROUNDS} manches**, chacun dessine à son tour un mot secret que l'autre doit deviner ` +
                        `en l'écrivant dans le salon.\n\n` +
                        `⏳ ${DUEL.ROUND_TIME / 1000} s par manche · une lettre dévoilée à mi-temps\n` +
                        `🏅 ${DUEL.BASE_POINTS} points + 1 par seconde restante\n` +
                        `💰 ${DUEL.MONEY_PER_POINT} $ par point pour chacun (1 fois par heure)\n\n` +
                        `_Vous jouez **ensemble** : faites le meilleur score possible !_`
                )
        ],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("duel:accept")
                    .setLabel("Jouer")
                    .setEmoji("✅")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("duel:decline")
                    .setLabel("Refuser")
                    .setEmoji("✖️")
                    .setStyle(ButtonStyle.Danger)
            )
        ],
        allowedMentions: { users: [opponent.id] },
        withResponse: true
    });
    const message = res.resource.message;
    const click = await message
        .awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (b) => {
                if (b.user.id === opponent.id) return true;
                if (b.user.id === interaction.user.id && b.customId === "duel:decline") return true;
                b.reply({ content: "❌ Cette invitation ne t'est pas destinée.", flags: EPHEMERAL }).catch(() => {});
                return false;
            },
            time: DUEL.INVITE_TIME
        })
        .catch(() => null);
    return { message, click };
}

async function playRound(ctx, r) {
    const { interaction, players, used } = ctx;
    const drawer = players[r % 2];
    const guesser = players[(r + 1) % 2];
    const entry = pick(WORD_LIST.filter((w) => !used.has(w.word)));
    used.add(entry.word);

    const state = createCanvasState();
    const letters = letterIndexes(entry.word);
    const revealed = new Set();
    const startedAt = Date.now();
    const endsAt = startedAt + DUEL.ROUND_TIME;
    let finished = false;
    let editorOpener = null;

    const header = `🎨 Dessine et devine — Manche ${r + 1}/${DUEL.ROUNDS}`;
    const publicView = () => ({
        content: null,
        embeds: [
            new EmbedBuilder()
                .setTitle(header)
                .setColor("Blurple")
                .setDescription(
                    `✏️ **Dessine :** ${drawer}\n🔎 **Devine :** ${guesser} — écris tes propositions dans le salon\n\n` +
                        `**Mot :** \`${wordHint(entry.word, revealed)}\` · ${entry.category}\n` +
                        `⏳ Fin ${ts(endsAt)} · 🏅 Score de l'équipe : **${ctx.score}**`
                )
                .setImage("attachment://dessin.png")
        ],
        files: [publicDrawing(state)],
        attachments: [],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("duel:open")
                    .setLabel("Ouvrir mon pinceau")
                    .setEmoji("🎨")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("duel:skip")
                    .setLabel("Passer le mot")
                    .setEmoji("⏭️")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId("duel:stop")
                    .setLabel("Arrêter")
                    .setEmoji("🛑")
                    .setStyle(ButtonStyle.Danger)
            )
        ],
        allowedMentions: NO_PINGS
    });

    // Mise à jour de l'image publique, au plus toutes les 1,5 s
    let lastRefresh = 0;
    let refreshTimer = null;
    const refresh = () => {
        if (finished || refreshTimer) return;
        refreshTimer = setTimeout(
            () => {
                refreshTimer = null;
                if (finished) return;
                lastRefresh = Date.now();
                interaction.editReply(publicView()).catch(() => {});
            },
            Math.max(0, 1500 - (Date.now() - lastRefresh))
        );
    };

    await interaction.editReply(publicView()).catch(() => {});
    lastRefresh = Date.now();

    const outcome = await new Promise((resolve) => {
        const end = (result) => {
            if (finished) return;
            finished = true;
            clearTimeout(refreshTimer);
            clearTimeout(hintTimer);
            clearTimeout(timer);
            buttons.stop();
            guesses.stop();
            for (const c of editors) c.stop();
            resolve(result);
        };
        const editors = [];

        const timer = setTimeout(() => end({ type: "time" }), DUEL.ROUND_TIME);
        const hintTimer = setTimeout(() => {
            const hidden = letters.filter((i) => !revealed.has(i));
            if (hidden.length > 1) revealed.add(pick(hidden));
            refresh();
        }, DUEL.ROUND_TIME * DUEL.HINT_AT);

        const buttons = ctx.message.createMessageComponentCollector({ componentType: ComponentType.Button });
        buttons.on("collect", async (b) => {
            const isPlayer = players.some((p) => p.id === b.user.id);
            if (!isPlayer)
                return b
                    .reply({ content: "❌ Tu ne participes pas à cette partie.", flags: EPHEMERAL })
                    .catch(() => {});

            if (b.customId === "duel:stop") {
                await b.deferUpdate().catch(() => {});
                return end({ type: "stop", by: b.user });
            }
            if (b.user.id !== drawer.id) {
                return b
                    .reply({ content: "❌ C'est à ton partenaire de dessiner, toi tu devines !", flags: EPHEMERAL })
                    .catch(() => {});
            }
            if (b.customId === "duel:skip") {
                await b.deferUpdate().catch(() => {});
                return end({ type: "skip" });
            }
            if (b.customId !== "duel:open") return;

            // Pinceau privé : le mot n'est visible que par le dessinateur
            const view = () =>
                editorPayload(state, {
                    prefix: "pinceau",
                    title: `🤫 Ton mot : ${entry.word.toUpperCase()}`,
                    text: `${entry.category} · fais-le deviner à ${guesser.username} ! (pas de lettres ni de chiffres 😉)`,
                    color: "Green"
                });
            const res = await b.reply({ ...view(), flags: EPHEMERAL, withResponse: true }).catch(() => null);
            if (!res) return;
            editorOpener = b;
            const editor = res.resource.message.createMessageComponentCollector({
                time: Math.max(1000, endsAt - Date.now())
            });
            editors.push(editor);
            if (finished) editor.stop();
            editor.on("collect", (click) => {
                if (finished || !handleEditorClick(state, click, "pinceau")) return click.deferUpdate().catch(() => {});
                click.update(view()).catch(() => {});
                refresh();
            });
        });

        const guesses = interaction.channel.createMessageCollector({
            filter: (m) => m.author.id === guesser.id || m.author.id === drawer.id,
            time: DUEL.ROUND_TIME
        });
        guesses.on("collect", (m) => {
            if (finished) return;
            const verdict = checkGuess(m.content, entry.word);
            if (m.author.id === drawer.id) {
                // Le dessinateur ne doit pas écrire le mot
                if (verdict !== "wrong") end({ type: "cheat" });
                return;
            }
            if (verdict === "exact") return end({ type: "found", at: Date.now(), message: m });
            m.react(verdict === "close" ? "🔥" : "❌").catch(() => {});
        });
    });

    if (editorOpener) {
        editorOpener
            .editReply({ content: "⏹️ Manche terminée.", embeds: [], files: [], attachments: [], components: [] })
            .catch(() => {});
    }
    if (outcome.message) outcome.message.react("✅").catch(() => {});

    const seconds = outcome.type === "found" ? Math.round((outcome.at - startedAt) / 1000) : null;
    const points = outcome.type === "found" ? roundPoints(endsAt - outcome.at) : 0;
    ctx.score += points;
    if (outcome.type === "found") ctx.guesses.set(guesser.id, (ctx.guesses.get(guesser.id) || 0) + 1);

    const word = `**${entry.word}**`;
    const text = {
        found: `✅ ${guesser} a trouvé ${word} en **${seconds} s** ! **+${points} points**`,
        time: `⌛ Temps écoulé ! C'était ${word}.`,
        skip: `⏭️ ${drawer} a passé le mot ${word}.`,
        cheat: `🚫 ${drawer} a écrit le mot dans le salon : manche annulée (c'était ${word}).`,
        stop: `🛑 Partie arrêtée par ${outcome.by}. C'était ${word}.`
    }[outcome.type];

    ctx.history.push({
        drawer,
        guesser,
        word: entry.word,
        found: outcome.type === "found",
        seconds,
        points,
        pixels: serialize(state)
    });

    if (outcome.type !== "stop") {
        await interaction
            .editReply({
                content: null,
                embeds: [
                    new EmbedBuilder()
                        .setTitle(header)
                        .setColor(outcome.type === "found" ? "Green" : "Orange")
                        .setDescription(`${text}\n\n🏅 Score de l'équipe : **${ctx.score}**`)
                        .setImage("attachment://dessin.png")
                ],
                files: [
                    new AttachmentBuilder(
                        renderArtwork(serialize(state), { title: entry.word, author: `par ${drawer.username}` }),
                        { name: "dessin.png" }
                    )
                ],
                attachments: [],
                components: [],
                allowedMentions: NO_PINGS
            })
            .catch(() => {});
        if (r < DUEL.ROUNDS - 1) await sleep(5000);
    }
    return outcome.type !== "stop";
}

async function duel(interaction, economy) {
    const me = interaction.user;
    const opponent = interaction.options.getUser("partenaire");

    if (!interaction.channel) return interaction.reply({ content: "❌ Commande indisponible ici.", flags: EPHEMERAL });
    if (opponent.bot || opponent.id === me.id) {
        return interaction.reply({ content: "❌ Choisis un autre joueur (pas un bot, pas toi).", flags: EPHEMERAL });
    }
    if (!lockUser(me.id)) return interaction.reply({ content: "❌ Tu es déjà dans un mini-jeu.", flags: EPHEMERAL });

    let opponentLocked = false;
    try {
        const { message, click } = await invite(interaction, opponent);
        const closed = (text) =>
            interaction
                .editReply({ content: text, embeds: [], components: [], allowedMentions: NO_PINGS })
                .catch(() => {});
        if (!click) return closed(`⌛ ${opponent} n'a pas répondu à temps.`);
        if (click.customId === "duel:decline") {
            await click.deferUpdate().catch(() => {});
            return closed(click.user.id === me.id ? "✖️ Invitation annulée." : `✖️ ${opponent} a refusé la partie.`);
        }
        if (!lockUser(opponent.id)) {
            return click.reply({ content: "❌ Tu es déjà dans un mini-jeu.", flags: EPHEMERAL }).catch(() => {});
        }
        opponentLocked = true;
        await click.deferUpdate().catch(() => {});

        const ctx = {
            interaction,
            message,
            players: [me, opponent],
            used: new Set(),
            score: 0,
            history: [],
            guesses: new Map()
        };
        for (let r = 0; r < DUEL.ROUNDS; r++) {
            if (!(await playRound(ctx, r))) break;
        }
        await finishDuel(interaction, economy, ctx);
    } finally {
        unlockUser(me.id);
        if (opponentLocked) unlockUser(opponent.id);
    }
}

async function finishDuel(interaction, economy, ctx) {
    const { players, score, history } = ctx;
    const records = players.map((p) => economy.getUser(p.id).drawBest);
    economy.recordDrawGame(
        players.map((p) => ({ userId: p.id, guesses: ctx.guesses.get(p.id) || 0 })),
        score
    );

    const rewards = players.map((p) => {
        if (score <= 0) return `${p} : pas de points, pas de récompense`;
        const wait = economy.tryCooldown(p.id, "lastDrawReward", DUEL.REWARD_COOLDOWN);
        if (wait > 0) return `${p} : déjà récompensé, prochaine récompense dans ${duration(wait)}`;
        const gain = score * DUEL.MONEY_PER_POINT;
        economy.addMoney(p.id, gain);
        return `${p} : **+${money(gain)}**`;
    });

    const lines = history.map(
        (h, i) =>
            `**${i + 1}.** ✏️ ${h.drawer.username} → 🔎 ${h.guesser.username} : **${h.word}** ` +
            (h.found ? `✅ ${h.seconds} s (+${h.points})` : "❌")
    );
    const record = players.filter((p, i) => score > records[i]);
    const notices = players
        .map((p) => {
            const t = newTitlesText(syncTitles(economy, p.id));
            return t && `${p} ${t}`;
        })
        .filter(Boolean);

    const found = history.filter((h) => h.found).length;
    await interaction
        .editReply({
            content: notices.join("\n") || null,
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎨 Dessine et devine — Résultat")
                    .setColor(found === history.length && found > 0 ? "Gold" : found ? "Green" : "Red")
                    .setDescription(
                        `${players[0]} & ${players[1]}\n\n` +
                            `🏅 **Score de l'équipe : ${score}** · ${found}/${history.length} mots trouvés` +
                            (record.length && score > 0 ? `\n🏆 Nouveau record pour ${record.join(" et ")} !` : "")
                    )
                    .addFields(
                        { name: "📝 Manches", value: lines.join("\n") || "_Aucune manche jouée._" },
                        { name: "💰 Récompenses", value: rewards.join("\n") }
                    )
                    .setFooter({ text: "Rejouez avec /dessin duo · vos dessins ne sont pas enregistrés" })
            ],
            files: [],
            attachments: [],
            components: [],
            allowedMentions: NO_PINGS
        })
        .catch(() => {});
}

/*
==================================================
CLASSEMENT
==================================================
*/

async function ranking(interaction, economy) {
    const artists = economy.topArtists(10);
    const duos = economy.topDrawScores(10);
    const medal = (i) => MEDALS[i] || `**${i + 1}.**`;
    return interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("🎨 Classement du dessin")
                .setColor("DarkGold")
                .addFields(
                    {
                        name: "❤️ Artistes les plus aimés",
                        value: artists.length
                            ? artists
                                  .map((a, i) => `${medal(i)} <@${a.userId}> — **${a.likes}** ❤️ · ${a.works} œuvre(s)`)
                                  .join("\n")
                            : "_Personne n'a encore exposé._"
                    },
                    {
                        name: "🏅 Meilleurs scores à « Dessine et devine »",
                        value: duos.length
                            ? duos
                                  .map(
                                      (d, i) =>
                                          `${medal(i)} <@${d.userId}> — **${d.drawBest}** pts · ${d.drawGuesses} mots devinés`
                                  )
                                  .join("\n")
                            : "_Aucune partie jouée._"
                    }
                )
        ],
        allowedMentions: NO_PINGS
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("dessin")
        .setDescription("Dessine tes œuvres ou joue à « Dessine et devine »")
        .addSubcommand((s) => s.setName("atelier").setDescription("Dessine une nouvelle œuvre avec des boutons"))
        .addSubcommand((s) =>
            s
                .setName("galerie")
                .setDescription("Les œuvres d'un joueur (modifier, supprimer, aimer)")
                .addUserOption((o) => o.setName("joueur").setDescription("Le joueur (toi par défaut)"))
        )
        .addSubcommand((s) =>
            s
                .setName("duo")
                .setDescription("Dessine et devine à deux : l'un dessine un mot, l'autre devine")
                .addUserOption((o) => o.setName("partenaire").setDescription("Ton partenaire").setRequired(true))
        )
        .addSubcommand((s) =>
            s.setName("classement").setDescription("Les artistes les plus aimés et les meilleurs duos")
        ),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const sub = interaction.options.getSubcommand();
        if (sub === "galerie") return gallery(interaction, economy);
        if (sub === "duo") return duel(interaction, economy);
        if (sub === "classement") return ranking(interaction, economy);
        return runAtelier(
            async (payload) => (await interaction.reply(payload)).resource.message,
            economy,
            interaction.user.id
        );
    }
};
