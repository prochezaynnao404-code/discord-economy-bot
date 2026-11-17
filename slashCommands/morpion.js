const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const { setupMatch, runTurnGame, commonButtons, recordResult, resultText } = require("../utils/games/session");
const ttt = require("../utils/games/tictactoe");

const SKILL = { facile: 0.2, normal: 0.7, difficile: 1 };
const SYMBOLS = ["", "❌", "⭕"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("morpion")
        .setDescription("Jouer au morpion")
        .addUserOption((o) => o.setName("adversaire").setDescription("Joueur à défier (vide = contre le bot)"))
        .addStringOption((o) =>
            o
                .setName("difficulte")
                .setDescription("Niveau du bot")
                .addChoices(
                    { name: "Facile", value: "facile" },
                    { name: "Normal", value: "normal" },
                    { name: "Difficile (imbattable)", value: "difficile" }
                )
        ),

    async execute(interaction) {
        const match = await setupMatch(interaction, { game: "Morpion" });
        if (!match) return;
        const { players, vsBot } = match;
        const level = interaction.options.getString("difficulte") || "normal";

        const state = {
            board: new Array(9).fill(0),
            turn: vsBot ? Math.floor(Math.random() * 2) : 0,
            result: null,
            line: null
        };

        const checkEnd = (s) => {
            const win = ttt.winner(s.board);
            if (win) {
                s.line = win.line;
                s.result = { winner: win.player - 1, reason: "3 alignés" };
            } else if (ttt.isFull(s.board)) {
                s.result = { winner: null, reason: "grille pleine" };
            } else {
                s.turn = 1 - s.turn;
            }
        };

        const render = (s) => {
            const rows = [0, 1, 2].map((r) =>
                new ActionRowBuilder().addComponents(
                    [0, 1, 2].map((c) => {
                        const i = r * 3 + c;
                        const button = new ButtonBuilder()
                            .setCustomId(`t_${i}`)
                            .setStyle(
                                s.line?.includes(i)
                                    ? ButtonStyle.Success
                                    : s.board[i] === 1
                                      ? ButtonStyle.Danger
                                      : s.board[i] === 2
                                        ? ButtonStyle.Primary
                                        : ButtonStyle.Secondary
                            )
                            .setDisabled(Boolean(s.result) || s.board[i] !== 0);
                        return s.board[i] ? button.setEmoji(SYMBOLS[s.board[i]]) : button.setLabel("​");
                    })
                )
            );
            if (!s.result)
                rows.push(new ActionRowBuilder().addComponents(...commonButtons(s, { vsBot, allowDraw: false })));

            let description = `${SYMBOLS[1]} **${players[0].name}** vs ${SYMBOLS[2]} **${players[1].name}**`;
            if (vsBot) description += ` (bot ${level})`;
            description += "\n\n";
            description += s.result
                ? resultText(s, players)
                : `👉 Au tour de ${players[s.turn].mention} ${SYMBOLS[s.turn + 1]}`;

            return {
                embeds: [
                    new EmbedBuilder()
                        .setTitle("❌ Morpion ⭕")
                        .setColor(s.result ? "Gold" : "Blue")
                        .setDescription(description)
                ],
                components: rows
            };
        };

        const message = await match.respond(render(state));

        await runTurnGame({
            message,
            players,
            vsBot,
            state,
            render,
            async handle(click) {
                const i = Number(click.customId.slice(2));
                if (state.board[i] !== 0) return { error: "Case déjà prise.", ack: click };
                state.board[i] = state.turn + 1;
                checkEnd(state);
                return { played: true, ack: click };
            },
            async botPlay(s) {
                s.board[ttt.botMove(s.board, s.turn + 1, SKILL[level])] = s.turn + 1;
                checkEnd(s);
            },
            onEnd: (s) => recordResult(interaction.client.economy, "morpion", { players, vsBot, state: s })
        });
    }
};
