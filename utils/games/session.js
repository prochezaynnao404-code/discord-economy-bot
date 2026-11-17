const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const { EPHEMERAL } = require("../helpers");

/*
==================================================
VERROU : un joueur ne peut être que dans une partie à la fois
==================================================
*/

const activePlayers = new Map(); // userId -> nom du jeu

function busyWith(userId) {
    return activePlayers.get(userId) || null;
}

function lockPlayers(ids, game) {
    for (const id of ids) activePlayers.set(id, game);
}

function unlockPlayers(ids) {
    for (const id of ids) activePlayers.delete(id);
}

/*
==================================================
PRÉPARATION : contre le bot ou invitation d'un joueur
Renvoie null si la partie n'a pas lieu, sinon :
{ vsBot, players: [{ id, name, isBot }, ...], respond(payload) -> Message }
==================================================
*/

async function setupMatch(interaction, { game, allowBot = true, allowPvp = true }) {
    const me = interaction.user;
    const opponent = interaction.options.getUser("adversaire");
    const botUser = interaction.client.user;
    const fail = (content) => interaction.reply({ content, flags: EPHEMERAL }).then(() => null);

    if (busyWith(me.id)) return fail(`❌ Tu as déjà une partie de **${busyWith(me.id)}** en cours.`);

    const human = { id: me.id, name: me.displayName ?? me.username, mention: `${me}`, isBot: false };

    // ----- Contre le bot -----
    if (!opponent || opponent.id === botUser.id) {
        if (!allowBot) return fail("❌ Ce jeu se joue contre un autre joueur : choisis un `adversaire`.");
        lockPlayers([me.id], game);
        return {
            vsBot: true,
            players: [human, { id: botUser.id, name: botUser.username, mention: `${botUser}`, isBot: true }],
            respond: async (payload) => (await interaction.reply({ ...payload, withResponse: true })).resource.message
        };
    }

    // ----- Contre un joueur -----
    if (!allowPvp) return fail("❌ Ce jeu se joue seul contre le bot.");
    if (opponent.bot) return fail("❌ Tu ne peux pas défier un bot. Laisse `adversaire` vide pour jouer contre moi.");
    if (opponent.id === me.id) return fail("❌ Tu ne peux pas jouer contre toi-même.");
    if (busyWith(opponent.id)) return fail(`❌ ${opponent.username} est déjà en pleine partie.`);

    lockPlayers([me.id, opponent.id], game);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("invite_yes").setLabel("Accepter").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("invite_no").setLabel("Refuser").setStyle(ButtonStyle.Danger)
    );

    const response = await interaction.reply({
        content: `🎮 ${opponent}, ${me} te défie à **${game}** ! Tu acceptes ? (60 s)`,
        components: [row],
        allowedMentions: { users: [opponent.id] },
        withResponse: true
    });

    const click = await response.resource.message
        .awaitMessageComponent({
            componentType: ComponentType.Button,
            time: 60000,
            filter: (b) => {
                // L'invité accepte/refuse, celui qui défie peut annuler
                if (b.user.id === opponent.id || (b.user.id === me.id && b.customId === "invite_no")) return true;
                b.reply({ content: "❌ Cette invitation ne t'est pas destinée.", flags: EPHEMERAL }).catch(() => {});
                return false;
            }
        })
        .catch(() => null);

    if (!click || click.customId === "invite_no") {
        unlockPlayers([me.id, opponent.id]);
        const text = !click
            ? `⌛ ${opponent.username} n'a pas répondu à temps.`
            : click.user.id === me.id
              ? "🚫 Défi annulé."
              : `❌ ${opponent.username} a refusé le défi.`;
        if (click) await click.update({ content: text, components: [] }).catch(() => {});
        else await interaction.editReply({ content: text, components: [] }).catch(() => {});
        return null;
    }

    const challenged = {
        id: opponent.id,
        name: opponent.displayName ?? opponent.username,
        mention: `${opponent}`,
        isBot: false
    };

    // Ordre de jeu tiré au sort
    const players = Math.random() < 0.5 ? [human, challenged] : [challenged, human];

    return {
        vsBot: false,
        players,
        respond: async (payload) => {
            await click.update({ content: "", ...payload });
            return click.message;
        }
    };
}

/*
==================================================
FENÊTRE DE SAISIE (modal)
==================================================
*/

let modalCounter = 0;

async function askText(component, { title, label, placeholder, maxLength = 20 }) {
    const id = `game_modal_${Date.now()}_${modalCounter++}`;
    const modal = new ModalBuilder()
        .setCustomId(id)
        .setTitle(title)
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("value")
                    .setLabel(label)
                    .setPlaceholder(placeholder)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(maxLength)
            )
        );

    await component.showModal(modal);
    const submit = await component
        .awaitModalSubmit({ time: 3 * 60 * 1000, filter: (m) => m.customId === id && m.user.id === component.user.id })
        .catch(() => null);
    if (!submit) return null;
    return { value: submit.fields.getTextInputValue("value"), submit };
}

/*
==================================================
MOTEUR DE PARTIE AU TOUR PAR TOUR
Options :
- message, players, vsBot, game (nom), idle (ms)
- state : objet libre avec state.turn (0|1) et state.result
         ({ winner: index|null, reason } quand la partie est finie)
- render(state) -> payload du message
- handle(click, playerIndex, state) -> { error, ack } | { played: true, ack } | { handled: true }
  (les customId qui commencent par "t_" exigent que ce soit le tour du joueur)
- botPlay(state) : fait jouer le bot (si vsBot)
- allowDraw : bouton "Proposer nulle" en duel
- onEnd(state) : appelé une fois la partie terminée
==================================================
*/

function commonButtons(state, { vsBot, allowDraw }) {
    const buttons = [new ButtonBuilder().setCustomId("g_resign").setLabel("Abandonner").setStyle(ButtonStyle.Danger)];
    if (allowDraw && !vsBot) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId("g_draw")
                .setLabel(
                    state.drawOffer !== undefined && state.drawOffer !== null ? "Accepter la nulle" : "Proposer nulle"
                )
                .setStyle(ButtonStyle.Secondary)
        );
    }
    return buttons;
}

async function runTurnGame(options) {
    const { message, players, vsBot, idle = 5 * 60 * 1000, state, render, handle, botPlay, onEnd } = options;
    const finished = () => Boolean(state.result);
    const editPayload = (payload) => (payload.files ? { attachments: [], ...payload } : payload);

    const finish = async () => {
        collector.stop("finished");
        await message.edit(editPayload(render(state))).catch(() => {});
        await onEnd?.(state);
    };

    const collector = message.createMessageComponentCollector({ idle });

    collector.on("collect", async (click) => {
        try {
            const index = players.findIndex((p) => p.id === click.user.id && !p.isBot);
            if (index === -1) {
                return click.reply({ content: "❌ Tu ne participes pas à cette partie.", flags: EPHEMERAL });
            }
            if (finished()) return click.deferUpdate();

            // ----- Boutons communs -----
            if (click.customId === "g_resign") {
                state.result = { winner: 1 - index, reason: `${players[index].name} a abandonné` };
                await click.deferUpdate();
                return finish();
            }
            if (click.customId === "g_draw") {
                if (state.drawOffer === 1 - index) {
                    state.result = { winner: null, reason: "nulle acceptée" };
                    await click.deferUpdate();
                    return finish();
                }
                state.drawOffer = index;
                state.notice = `🤝 ${players[index].name} propose la nulle.`;
                return click.update(editPayload(render(state)));
            }

            if (click.customId.startsWith("t_") && state.turn !== index) {
                return click.reply({ content: "⏳ Ce n'est pas ton tour.", flags: EPHEMERAL });
            }

            const outcome = await handle(click, index, state);
            if (!outcome || outcome.handled) return;
            if (outcome.error) {
                return outcome.ack.reply({ content: `❌ ${outcome.error}`, flags: EPHEMERAL }).catch(() => {});
            }

            // Coup joué : on accuse réception tout de suite, le bot peut réfléchir ensuite
            if (!outcome.ack.deferred && !outcome.ack.replied) await outcome.ack.deferUpdate();
            state.drawOffer = null;
            if (!finished() && vsBot && players[state.turn].isBot) {
                await botPlay(state);
            }
            if (finished()) return finish();
            await message.edit(editPayload(render(state)));
        } catch (err) {
            console.error("❌ Erreur mini-jeu :", err);
        }
    });

    collector.on("end", async (_, reason) => {
        if (reason === "finished") return;
        if (!finished()) {
            // Inactivité : le joueur qui devait jouer perd
            const loser = players[state.turn]?.isBot ? 0 : state.turn;
            state.result = { winner: vsBot ? (loser === 0 ? 1 : 0) : 1 - loser, reason: "temps écoulé" };
            state.result.timeout = true;
        }
        await message.edit(editPayload(render(state))).catch(() => {});
        await onEnd?.(state);
    });

    // Le bot commence
    if (vsBot && players[state.turn].isBot && !finished()) {
        await botPlay(state);
        await message.edit(editPayload(render(state))).catch(() => {});
    }
}

/*
==================================================
FIN DE PARTIE : statistiques + déverrouillage
==================================================
*/

function recordResult(economy, gameKey, { players, vsBot, state }) {
    unlockPlayers(players.map((p) => p.id));
    if (!state.result || state.result.abandoned) return;
    const key = vsBot ? `${gameKey}_bot` : gameKey;
    players.forEach((p, i) => {
        if (p.isBot) return;
        const outcome = state.result.winner === null ? "draw" : state.result.winner === i ? "win" : "loss";
        economy.recordGame(p.id, key, outcome);
    });
}

function resultText(state, players) {
    if (!state.result) return "";
    if (state.result.winner === null) return `🤝 **Match nul** (${state.result.reason})`;
    return `🏆 **${players[state.result.winner].name} gagne !** (${state.result.reason})`;
}

module.exports = {
    setupMatch,
    askText,
    runTurnGame,
    commonButtons,
    recordResult,
    resultText,
    busyWith,
    lockPlayers,
    unlockPlayers
};
