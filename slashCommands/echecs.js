const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");
const { Chess } = require("chess.js");

const { setupMatch, askText, runTurnGame, commonButtons, recordResult, resultText } = require("../utils/games/session");
const { renderChess } = require("../utils/games/render");
const { bestMove } = require("../utils/games/chessAi");

const DEPTH = { facile: 1, normal: 2, difficile: 3 };
const FRENCH = { C: "N", F: "B", T: "R", D: "Q" }; // cavalier, fou, tour, dame

// Essaie plusieurs façons d'écrire un coup : e2e4, e7e8q, Nf3, Cf3 (français), O-O, 0-0
function tryMove(chess, input) {
    const text = input.trim().replace(/\s+/g, "").replace(/0/g, "O");
    const coord = text.toLowerCase().match(/^([a-h][1-8])-?([a-h][1-8])=?([qrbn])?$/);
    const attempts = [];
    if (coord) attempts.push({ from: coord[1], to: coord[2], promotion: coord[3] || "q" });
    attempts.push(text);
    if (FRENCH[text[0]]) attempts.push(FRENCH[text[0]] + text.slice(1));
    if (text[0] === "R") attempts.push("K" + text.slice(1)); // R = roi en français

    for (const attempt of attempts) {
        try {
            return chess.move(attempt);
        } catch {
            // essai suivant
        }
    }
    return null;
}

function checkEnd(state) {
    const { chess } = state;
    const moverIndex = chess.turn() === "w" ? 1 - state.whiteIndex : state.whiteIndex;
    if (chess.isCheckmate()) state.result = { winner: moverIndex, reason: "échec et mat" };
    else if (chess.isStalemate()) state.result = { winner: null, reason: "pat" };
    else if (chess.isThreefoldRepetition()) state.result = { winner: null, reason: "répétition" };
    else if (chess.isInsufficientMaterial()) state.result = { winner: null, reason: "matériel insuffisant" };
    else if (chess.isDraw()) state.result = { winner: null, reason: "règle des 50 coups" };
    state.turn = chess.turn() === "w" ? state.whiteIndex : 1 - state.whiteIndex;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("echecs")
        .setDescription("Jouer aux échecs contre un joueur ou contre le bot")
        .addUserOption((o) => o.setName("adversaire").setDescription("Joueur à défier (vide = contre le bot)"))
        .addStringOption((o) =>
            o
                .setName("difficulte")
                .setDescription("Niveau du bot")
                .addChoices(
                    { name: "Facile", value: "facile" },
                    { name: "Normal", value: "normal" },
                    { name: "Difficile", value: "difficile" }
                )
        )
        .addStringOption((o) =>
            o
                .setName("couleur")
                .setDescription("Ta couleur contre le bot")
                .addChoices(
                    { name: "Blancs", value: "blancs" },
                    { name: "Noirs", value: "noirs" },
                    { name: "Aléatoire", value: "aleatoire" }
                )
        ),

    async execute(interaction) {
        const match = await setupMatch(interaction, { game: "Échecs" });
        if (!match) return;
        const { players, vsBot } = match;

        const level = interaction.options.getString("difficulte") || "normal";
        let whiteIndex = 0;
        if (vsBot) {
            const color = interaction.options.getString("couleur") || "blancs";
            const humanWhite = color === "blancs" || (color === "aleatoire" && Math.random() < 0.5);
            whiteIndex = humanWhite ? 0 : 1;
        }

        const state = { chess: new Chess(), whiteIndex, turn: whiteIndex, lastMove: null, result: null, notice: null };
        // Vue de l'échiquier : celle du joueur humain contre le bot, sinon celle des blancs
        const flip = vsBot && whiteIndex === 1;

        const render = (s) => {
            const white = players[s.whiteIndex];
            const black = players[1 - s.whiteIndex];
            const history = s.chess.history();
            const lastMoves = history
                .slice(-6)
                .map((m, i, arr) => {
                    const n = history.length - arr.length + i;
                    return n % 2 === 0 ? `${n / 2 + 1}. ${m}` : m;
                })
                .join(" ");

            let description = `⬜ **${white.name}** vs ⬛ **${black.name}**`;
            if (vsBot) description += ` (bot ${level})`;
            if (lastMoves) description += `\n\n📜 ${lastMoves}`;
            if (s.result) {
                description += `\n\n${resultText(s, players)}`;
            } else {
                description += `\n\n👉 Au tour de ${players[s.turn].mention} (${s.chess.turn() === "w" ? "blancs" : "noirs"})`;
                if (s.chess.inCheck()) description += " — **échec !**";
                if (s.notice) description += `\n${s.notice}`;
                description += "\n\n_Écris ton coup en `e2e4` ou en notation algébrique (`Nf3`, `Cf3`, `O-O`)._";
            }

            const components = s.result
                ? []
                : [
                      new ActionRowBuilder().addComponents(
                          new ButtonBuilder()
                              .setCustomId("t_move")
                              .setLabel("Jouer un coup")
                              .setStyle(ButtonStyle.Primary),
                          ...commonButtons(s, { vsBot, allowDraw: true })
                      )
                  ];

            return {
                embeds: [
                    new EmbedBuilder()
                        .setTitle("♟️ Échecs")
                        .setColor(s.result ? "Gold" : "Blue")
                        .setDescription(description)
                        .setImage("attachment://echiquier.png")
                ],
                files: [renderChess(s.chess, { flip, lastMove: s.lastMove })],
                components
            };
        };

        const message = await match.respond(render(state));

        await runTurnGame({
            message,
            players,
            vsBot,
            state,
            idle: 10 * 60 * 1000,
            render,
            async handle(click) {
                if (click.customId !== "t_move") return { handled: true };
                const answer = await askText(click, {
                    title: "Ton coup",
                    label: "Coup (ex : e2e4, Nf3, O-O)",
                    placeholder: "e2e4"
                });
                if (!answer) return { handled: true };
                if (state.result || state.turn !== players.findIndex((p) => p.id === click.user.id)) {
                    return { error: "Ce n'est plus ton tour.", ack: answer.submit };
                }
                const move = tryMove(state.chess, answer.value);
                if (!move) return { error: `Coup illégal ou mal écrit : \`${answer.value}\``, ack: answer.submit };
                state.lastMove = move;
                state.notice = null;
                checkEnd(state);
                return { played: true, ack: answer.submit };
            },
            async botPlay(s) {
                const move = bestMove(s.chess, DEPTH[level]);
                s.chess.move(move);
                s.lastMove = move;
                checkEnd(s);
            },
            onEnd: (s) => recordResult(interaction.client.economy, "echecs", { players, vsBot, state: s })
        });
    }
};
