const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { setupMatch, runTurnGame, commonButtons, recordResult, resultText } = require("../utils/games/session");
const c4 = require("../utils/games/connect4");

const DEPTH = { facile: 1, normal: 4, difficile: 7 };
const TOKENS = ["⚫", "🔴", "🟡"];
const NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("puissance4")
        .setDescription("Jouer au Puissance 4")
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
        const match = await setupMatch(interaction, { game: "Puissance 4" });
        if (!match) return;
        const { players, vsBot } = match;
        const level = interaction.options.getString("difficulte") || "normal";

        // Contre le bot, qui commence est tiré au sort
        const state = {
            board: c4.emptyBoard(),
            turn: vsBot ? Math.floor(Math.random() * 2) : 0,
            result: null,
            win: null
        };

        const checkEnd = (s) => {
            const win = c4.winningLine(s.board);
            if (win) {
                s.win = win;
                s.result = { winner: win.player - 1, reason: "4 jetons alignés" };
            } else if (c4.isFull(s.board)) {
                s.result = { winner: null, reason: "grille pleine" };
            } else {
                s.turn = 1 - s.turn;
            }
        };

        const render = (s) => {
            const winning = new Set((s.win?.cells || []).map(([r, c]) => `${r},${c}`));
            const grid = s.board
                .map((row, r) => row.map((v, c) => (winning.has(`${r},${c}`) ? "🟢" : TOKENS[v])).join(""))
                .join("\n");

            let description = `${TOKENS[1]} **${players[0].name}** vs ${TOKENS[2]} **${players[1].name}**`;
            if (vsBot) description += ` (bot ${level})`;
            description += `\n\n${NUMBERS.join("")}\n${grid}\n\n`;
            description += s.result
                ? resultText(s, players)
                : `👉 Au tour de ${players[s.turn].mention} ${TOKENS[s.turn + 1]}`;

            const columnButton = (c) =>
                new ButtonBuilder()
                    .setCustomId(`t_${c}`)
                    .setLabel(String(c + 1))
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!c4.canPlay(s.board, c));

            const components = s.result
                ? []
                : [
                      new ActionRowBuilder().addComponents([0, 1, 2, 3].map(columnButton)),
                      new ActionRowBuilder().addComponents([4, 5, 6].map(columnButton)),
                      new ActionRowBuilder().addComponents(...commonButtons(s, { vsBot, allowDraw: false }))
                  ];

            return {
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🔴 Puissance 4 🟡")
                        .setColor(s.result ? "Gold" : "Blue")
                        .setDescription(description)
                ],
                components
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
                const col = Number(click.customId.slice(2));
                if (c4.drop(state.board, col, state.turn + 1) === -1) return { error: "Colonne pleine.", ack: click };
                checkEnd(state);
                return { played: true, ack: click };
            },
            async botPlay(s) {
                c4.drop(s.board, c4.bestColumn(s.board, s.turn + 1, DEPTH[level]), s.turn + 1);
                checkEnd(s);
            },
            onEnd: (s) => recordResult(interaction.client.economy, "puissance4", { players, vsBot, state: s })
        });
    }
};
