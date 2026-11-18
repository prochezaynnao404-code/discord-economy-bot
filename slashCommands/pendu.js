const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { askText, busyWith, lockPlayers, unlockPlayers } = require("../utils/games/session");
const { HangmanGame, MAX_ERRORS } = require("../utils/games/hangman");
const { EPHEMERAL } = require("../utils/helpers");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pendu")
        .setDescription("Jouer au pendu")
        .addBooleanOption((o) =>
            o.setName("multijoueur").setDescription("Tout le monde dans le salon peut proposer des lettres")
        ),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const owner = interaction.user;
        const open = interaction.options.getBoolean("multijoueur") ?? false;

        if (busyWith(owner.id)) {
            return interaction.reply({
                content: `❌ Tu as déjà une partie de **${busyWith(owner.id)}** en cours.`,
                flags: EPHEMERAL
            });
        }
        lockPlayers([owner.id], "Pendu");

        const game = new HangmanGame();
        let status = null; // "won" | "lost" | "abandon" | "timeout"
        let lastAction = null;
        const finders = new Set();

        const render = () => {
            let description = `\`\`\`\n${game.drawing()}\n\`\`\`\n🔤 **\`${game.masked}\`**\n\n`;
            description += `❤️ Vies : ${MAX_ERRORS - game.errors}/${MAX_ERRORS}`;
            if (game.wrongLetters.length) description += `\n❌ Lettres ratées : ${game.wrongLetters.join(" ")}`;
            if (lastAction) description += `\n\n${lastAction}`;

            if (status === "won") description += `\n\n🎉 **Gagné !** Le mot était **${game.word}**.`;
            else if (status) description += `\n\n💀 **Perdu…** Le mot était **${game.word}**.`;
            else description += open ? "\n\n👥 Tout le salon peut jouer !" : `\n\n👤 Partie de ${owner}`;

            const components = [];
            if (!status) {
                const remaining = ALPHABET.filter((l) => !game.guessed.has(l));
                for (const [id, letters] of [
                    ["letters_1", remaining.filter((l) => l <= "M")],
                    ["letters_2", remaining.filter((l) => l > "M")]
                ]) {
                    if (letters.length === 0) continue;
                    components.push(
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(id)
                                .setPlaceholder(`Choisir une lettre (${letters[0]} - ${letters.at(-1)})`)
                                .addOptions(letters.map((l) => ({ label: l, value: l })))
                        )
                    );
                }
                components.push(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("word")
                            .setLabel("Proposer le mot")
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId("stop").setLabel("Abandonner").setStyle(ButtonStyle.Danger)
                    )
                );
            }

            return {
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🪢 Pendu")
                        .setColor(status === "won" ? "Green" : status ? "Red" : "Blue")
                        .setDescription(description)
                ],
                components
            };
        };

        const message = (await interaction.reply({ ...render(), withResponse: true })).resource.message;
        const collector = message.createMessageComponentCollector({ idle: 3 * 60 * 1000 });

        const checkEnd = () => {
            if (game.won) status = "won";
            else if (game.lost) status = "lost";
            if (status) collector.stop("finished");
        };

        collector.on("collect", async (i) => {
            try {
                if (status) return i.deferUpdate();
                if (!open && i.user.id !== owner.id) {
                    return i.reply({
                        content: "❌ Ce n'est pas ta partie (lance `/pendu multijoueur:True` pour jouer à plusieurs).",
                        flags: EPHEMERAL
                    });
                }

                if (i.customId === "stop") {
                    if (i.user.id !== owner.id)
                        return i.reply({ content: "❌ Seul le créateur peut abandonner.", flags: EPHEMERAL });
                    status = "abandon";
                    collector.stop("finished");
                    return i.update(render());
                }

                if (i.customId === "word") {
                    const answer = await askText(i, {
                        title: "Proposer le mot",
                        label: "Ta réponse",
                        placeholder: "mot",
                        maxLength: 30
                    });
                    if (!answer || status) return answer?.submit.deferUpdate();
                    const ok = game.guessWord(answer.value);
                    lastAction = ok
                        ? `✅ ${i.user} a trouvé le mot !`
                        : `❌ ${i.user} propose **${answer.value.toUpperCase()}** : raté (−1 vie)`;
                    if (ok) finders.add(i.user.id);
                    checkEnd();
                    return answer.submit.update(render());
                }

                // Sélection d'une lettre
                const letter = i.values[0];
                const result = game.guessLetter(letter);
                if (result === "already")
                    return i.reply({ content: "Cette lettre a déjà été proposée.", flags: EPHEMERAL });
                lastAction =
                    result === "good"
                        ? `✅ ${i.user} : **${letter}** est dans le mot`
                        : `❌ ${i.user} : pas de **${letter}**`;
                if (game.won) finders.add(i.user.id);
                checkEnd();
                return i.update(render());
            } catch (err) {
                console.error("❌ Erreur pendu :", err);
            }
        });

        collector.on("end", async (_, reason) => {
            unlockPlayers([owner.id]);
            if (reason !== "finished") {
                status = "timeout";
                lastAction = "⌛ Temps écoulé.";
            }
            await message.edit(render()).catch(() => {});

            // Statistiques : en solo pour le joueur, en multi pour celui qui trouve
            if (!open) economy.recordGame(owner.id, "pendu", status === "won" ? "win" : "loss");
            else for (const id of finders) economy.recordGame(id, "pendu_multi", "win");
        });
    }
};
