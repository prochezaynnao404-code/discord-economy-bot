const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const { setupMatch, recordResult, resultText } = require("../utils/games/session");
const { EPHEMERAL, pick } = require("../utils/helpers");

const CHOICES = {
    pierre: { emoji: "🪨", beats: "ciseaux" },
    feuille: { emoji: "📄", beats: "pierre" },
    ciseaux: { emoji: "✂️", beats: "feuille" }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pfc")
        .setDescription("Pierre, feuille, ciseaux")
        .addUserOption((o) => o.setName("adversaire").setDescription("Joueur à défier (vide = contre le bot)"))
        .addIntegerOption((o) =>
            o
                .setName("manches")
                .setDescription("Nombre de manches gagnantes pour remporter la partie")
                .addChoices(
                    { name: "1 manche", value: 1 },
                    { name: "2 manches (BO3)", value: 2 },
                    { name: "3 manches (BO5)", value: 3 }
                )
        ),

    async execute(interaction) {
        const match = await setupMatch(interaction, { game: "Pierre-feuille-ciseaux" });
        if (!match) return;
        const { players, vsBot } = match;
        const target = interaction.options.getInteger("manches") || 1;

        const state = { scores: [0, 0], picks: [null, null], round: 1, history: [], result: null };

        const render = (s) => {
            let description = `**${players[0].name}** ${s.scores[0]} — ${s.scores[1]} **${players[1].name}**`;
            description += `\n🏁 Premier à ${target} manche${target > 1 ? "s" : ""}`;
            if (s.history.length) description += `\n\n${s.history.slice(-5).join("\n")}`;
            if (s.result) {
                description += `\n\n${resultText(s, players)}`;
            } else {
                const waiting = players.filter((p, i) => !p.isBot && !s.picks[i]).map((p) => p.mention);
                description += `\n\n🎲 Manche ${s.round} — en attente de : ${waiting.join(", ")}`;
            }

            const components = s.result
                ? []
                : [
                      new ActionRowBuilder().addComponents(
                          ...Object.entries(CHOICES).map(([name, c]) =>
                              new ButtonBuilder()
                                  .setCustomId(`pfc_${name}`)
                                  .setLabel(name[0].toUpperCase() + name.slice(1))
                                  .setEmoji(c.emoji)
                                  .setStyle(ButtonStyle.Primary)
                          )
                      )
                  ];

            return {
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🪨 📄 ✂️ Pierre, feuille, ciseaux")
                        .setColor(s.result ? "Gold" : "Blue")
                        .setDescription(description)
                ],
                components
            };
        };

        const message = await match.respond(render(state));
        const collector = message.createMessageComponentCollector({ idle: 2 * 60 * 1000 });

        const end = (reason) => {
            collector.stop(reason);
            recordResult(interaction.client.economy, "pfc", { players, vsBot, state });
        };

        collector.on("collect", async (click) => {
            try {
                const index = players.findIndex((p) => p.id === click.user.id && !p.isBot);
                if (index === -1)
                    return click.reply({ content: "❌ Tu ne participes pas à cette partie.", flags: EPHEMERAL });
                if (state.result) return click.deferUpdate();
                if (state.picks[index])
                    return click.reply({ content: "✅ Tu as déjà choisi pour cette manche.", flags: EPHEMERAL });

                state.picks[index] = click.customId.slice(4);
                if (vsBot) state.picks[1] = pick(Object.keys(CHOICES));

                // Manche pas terminée : on garde le choix secret
                if (!state.picks[0] || !state.picks[1]) {
                    await click.reply({
                        content: `🤫 Choix enregistré : ${CHOICES[state.picks[index]].emoji}`,
                        flags: EPHEMERAL
                    });
                    return message.edit(render(state));
                }

                const [a, b] = state.picks;
                let line = `Manche ${state.round} : ${CHOICES[a].emoji} vs ${CHOICES[b].emoji} → `;
                if (a === b) line += "égalité";
                else {
                    const winner = CHOICES[a].beats === b ? 0 : 1;
                    state.scores[winner]++;
                    line += `point pour **${players[winner].name}**`;
                }
                state.history.push(line);
                state.picks = [null, null];
                state.round++;

                const winner = state.scores.findIndex((score) => score >= target);
                if (winner !== -1) state.result = { winner, reason: `${state.scores[0]}-${state.scores[1]}` };

                await click.update(render(state));
                if (state.result) end("finished");
            } catch (err) {
                console.error("❌ Erreur PFC :", err);
            }
        });

        collector.on("end", async (_, reason) => {
            if (reason === "finished") return;
            // Inactivité : celui qui n'a pas joué perd (s'il est seul à ne pas avoir joué)
            const missing = players.map((p, i) => !p.isBot && !state.picks[i]);
            if (!vsBot && missing[0] !== missing[1]) {
                state.result = { winner: missing[0] ? 1 : 0, reason: "temps écoulé" };
            } else {
                state.result = { winner: null, reason: "partie abandonnée (temps écoulé)", abandoned: true };
            }
            await message.edit(render(state)).catch(() => {});
            recordResult(interaction.client.economy, "pfc", { players, vsBot, state });
        });
    }
};
