const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { setupMatch, askText, runTurnGame, commonButtons, recordResult, resultText } = require("../utils/games/session");
const { EPHEMERAL } = require("../utils/helpers");
const bs = require("../utils/games/battleship");

const LEVEL = { facile: 0, normal: 1, difficile: 2 };
const RESULT_TEXT = { miss: "💦 À l'eau", hit: "💥 Touché", sunk: "🔥 Coulé" };

// Grille en texte monospace. showShips = afficher ses propres bateaux
function grid(fleet, showShips) {
    const lines = ["   " + bs.LETTERS.split("").join(" ")];
    for (let r = 0; r < bs.SIZE; r++) {
        const cells = [];
        for (let c = 0; c < bs.SIZE; c++) {
            const shot = fleet.shots[r][c];
            if (shot === "miss") cells.push("o");
            else if (shot === "hit") cells.push("X");
            else if (shot === "sunk") cells.push("#");
            else if (showShips && fleet.grid[r][c] !== -1) cells.push("■");
            else cells.push("·");
        }
        lines.push(String(r + 1).padStart(2) + " " + cells.join(" "));
    }
    return "```\n" + lines.join("\n") + "\n```";
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("bataillenavale")
        .setDescription("Jouer à la bataille navale")
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
        const match = await setupMatch(interaction, { game: "Bataille navale" });
        if (!match) return;
        const { players, vsBot } = match;
        const level = interaction.options.getString("difficulte") || "normal";

        // fleets[i] = flotte du joueur i (sur laquelle tire l'adversaire)
        const state = { fleets: [bs.randomFleet(), bs.randomFleet()], turn: 0, result: null, log: [] };

        const shoot = (s, r, c) => {
            const target = s.fleets[1 - s.turn];
            const { result, ship } = bs.fire(target, r, c);
            let line = `${players[s.turn].name} tire en **${bs.coordName(r, c)}** : ${RESULT_TEXT[result]}`;
            if (result === "sunk") line += ` (${ship.name})`;
            s.log = [...s.log, line].slice(-4);
            if (bs.allSunk(target)) {
                s.result = { winner: s.turn, reason: "toute la flotte adverse est coulée" };
            } else {
                s.turn = 1 - s.turn;
            }
        };

        const render = (s) => {
            const embed = new EmbedBuilder()
                .setTitle("🚢 Bataille navale")
                .setColor(s.result ? "Gold" : "Navy")
                .addFields(
                    {
                        name: `🎯 Tirs de ${players[0].name} (${bs.shipsLeft(s.fleets[1])} bateaux adverses restants)`,
                        value: grid(s.fleets[1], Boolean(s.result))
                    },
                    {
                        name: `🎯 Tirs de ${players[1].name} (${bs.shipsLeft(s.fleets[0])} bateaux adverses restants)`,
                        value: grid(s.fleets[0], Boolean(s.result))
                    }
                );

            let description = `**${players[0].name}** vs **${players[1].name}**`;
            if (vsBot) description += ` (bot ${level})`;
            description += "\n`·` inconnu  `o` à l'eau  `X` touché  `#` coulé  `■` bateau";
            if (s.log.length) description += `\n\n${s.log.join("\n")}`;
            description += s.result ? `\n\n${resultText(s, players)}` : `\n\n👉 Au tour de ${players[s.turn].mention}`;
            embed.setDescription(description);

            const components = s.result
                ? []
                : [
                      new ActionRowBuilder().addComponents(
                          new ButtonBuilder()
                              .setCustomId("t_fire")
                              .setLabel("Tirer")
                              .setEmoji("🎯")
                              .setStyle(ButtonStyle.Primary),
                          new ButtonBuilder()
                              .setCustomId("fleet")
                              .setLabel("Ma flotte")
                              .setEmoji("🚢")
                              .setStyle(ButtonStyle.Secondary),
                          ...commonButtons(s, { vsBot, allowDraw: false })
                      )
                  ];

            return { embeds: [embed], components };
        };

        const message = await match.respond(render(state));

        await runTurnGame({
            message,
            players,
            vsBot,
            state,
            render,
            async handle(click, index) {
                if (click.customId === "fleet") {
                    await click.reply({
                        content: `🚢 **Ta flotte** (tirs reçus de ${players[1 - index].name})\n${grid(state.fleets[index], true)}`,
                        flags: EPHEMERAL
                    });
                    return { handled: true };
                }

                const answer = await askText(click, {
                    title: "Tirer",
                    label: "Case visée (ex : B7)",
                    placeholder: "B7",
                    maxLength: 3
                });
                if (!answer) return { handled: true };
                if (state.result || state.turn !== index)
                    return { error: "Ce n'est plus ton tour.", ack: answer.submit };

                const coord = bs.parseCoord(answer.value);
                if (!coord)
                    return {
                        error: "Case invalide : une lettre de A à J et un nombre de 1 à 10 (ex : B7).",
                        ack: answer.submit
                    };
                if (state.fleets[1 - index].shots[coord[0]][coord[1]]) {
                    return { error: `Tu as déjà tiré en ${bs.coordName(...coord)}.`, ack: answer.submit };
                }
                shoot(state, ...coord);
                return { played: true, ack: answer.submit };
            },
            async botPlay(s) {
                const [r, c] = bs.botShot(s.fleets[1 - s.turn], LEVEL[level]);
                shoot(s, r, c);
            },
            onEnd: (s) => recordResult(interaction.client.economy, "bataillenavale", { players, vsBot, state: s })
        });
    }
};
