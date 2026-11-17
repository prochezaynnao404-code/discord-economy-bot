const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const { setupMatch, askText, runTurnGame, commonButtons, recordResult, resultText } = require("../utils/games/session");
const { renderCheckers } = require("../utils/games/render");
const { CheckersGame, parseMove, notation, bestMove } = require("../utils/games/checkers");

const DEPTH = { facile: 1, normal: 3, difficile: 5 };

module.exports = {
    data: new SlashCommandBuilder()
        .setName("dames")
        .setDescription("Jouer aux dames internationales (10x10)")
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
        ),

    async execute(interaction) {
        const match = await setupMatch(interaction, { game: "Dames" });
        if (!match) return;
        const { players, vsBot } = match;
        const level = interaction.options.getString("difficulte") || "normal";

        // players[0] = Blancs (commencent), players[1] = Noirs
        const game = new CheckersGame();
        const state = { game, turn: 0, result: null, notice: null };
        const sync = () => {
            state.turn = game.turn === "w" ? 0 : 1;
            if (game.result) {
                const winner = game.result.winner === null ? null : game.result.winner === "w" ? 0 : 1;
                state.result = { winner, reason: game.result.reason };
            }
        };

        const render = (s) => {
            const w = game.count("w");
            const b = game.count("b");
            let description =
                `⚪ **${players[0].name}** (${w.men} pions, ${w.kings} dames)\n` +
                `⚫ **${players[1].name}** (${b.men} pions, ${b.kings} dames)`;
            if (vsBot) description += `\n🤖 Bot ${level}`;
            if (game.lastMove) description += `\n\n📜 Dernier coup : **${notation(game.lastMove)}**`;

            if (s.result) {
                description += `\n\n${resultText(s, players)}`;
            } else {
                const moves = game.moves();
                const list = moves.map((m) => notation(m, moves));
                const shown = list.slice(0, 30).join(", ") + (list.length > 30 ? `… (+${list.length - 30})` : "");
                description += `\n\n👉 Au tour de ${players[s.turn].mention} (${s.turn === 0 ? "blancs" : "noirs"})`;
                if (moves[0]?.captured.length)
                    description += `\n⚠️ Prise obligatoire de **${moves[0].captured.length}** pièce(s) !`;
                if (s.notice) description += `\n${s.notice}`;
                description += `\n\n🎯 Coups possibles : ${shown}`;
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
                        .setTitle("⚪ Dames internationales ⚫")
                        .setColor(s.result ? "Gold" : "DarkOrange")
                        .setDescription(description)
                        .setImage("attachment://damier.png")
                ],
                files: [renderCheckers(game.board, { lastMove: game.lastMove })],
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
                    label: "Coup (ex : 32-28 ou 19x30)",
                    placeholder: "32-28",
                    maxLength: 40
                });
                if (!answer) return { handled: true };
                if (state.result || state.turn !== players.findIndex((p) => p.id === click.user.id)) {
                    return { error: "Ce n'est plus ton tour.", ack: answer.submit };
                }
                const parsed = parseMove(answer.value, game.moves());
                if (parsed.error) return { error: parsed.error, ack: answer.submit };
                game.play(parsed.move);
                state.notice = null;
                sync();
                return { played: true, ack: answer.submit };
            },
            async botPlay() {
                game.play(bestMove(game, DEPTH[level]));
                sync();
            },
            onEnd: (s) => recordResult(interaction.client.economy, "dames", { players, vsBot, state: s })
        });
    }
};
