const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { ECONOMY } = require("../config");
const { EPHEMERAL, money, duration, randInt, pick, shuffle, lockUser, unlockUser } = require("../utils/helpers");
const { jailNotice } = require("../utils/heist");

const WORDS = ["piratage", "banque", "discret", "infiltration", "alarme", "caméra", "coffre", "cagoule"];

// Indices de la phase 3 : il faut deviner la couleur du câble à partir de l'emoji
const WIRES = {
    rouge: { emoji: "🟥", style: ButtonStyle.Danger, clues: ["🍓", "🌹", "🚒", "🍒"] },
    bleu: { emoji: "🟦", style: ButtonStyle.Primary, clues: ["🌊", "🐳", "🫐", "💧"] },
    vert: { emoji: "🟩", style: ButtonStyle.Success, clues: ["🍀", "🥝", "🐸", "🥦"] },
    jaune: { emoji: "🟨", style: ButtonStyle.Secondary, clues: ["🍋", "🌻", "🐤", "🍌"] }
};

async function askText(interaction, userId, time) {
    const collected = await interaction.channel
        .awaitMessages({ filter: (m) => m.author.id === userId, max: 1, time, errors: ["time"] })
        .catch(() => null);
    return collected ? collected.first().content.trim() : null;
}

module.exports = {
    data: new SlashCommandBuilder().setName("rob").setDescription("Braque une banque (1 tentative par jour)"),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const userId = interaction.user.id;

        if (!interaction.channel) {
            return interaction.reply({ content: "❌ Commande indisponible ici.", flags: EPHEMERAL });
        }
        if (!lockUser(userId)) {
            return interaction.reply({ content: "❌ Tu es déjà dans un mini-jeu.", flags: EPHEMERAL });
        }

        try {
            const jail = economy.getJail(userId);
            if (jail) return interaction.reply({ content: jailNotice(jail), flags: EPHEMERAL });

            // Le cooldown démarre dès la tentative : un échec compte aussi
            const remaining = economy.tryCooldown(userId, "lastRob", ECONOMY.ROB_COOLDOWN);
            if (remaining > 0) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("🚨 BRAQUAGE")
                            .setDescription(`⏳ Prochaine tentative dans **${duration(remaining)}**`)
                    ],
                    flags: EPHEMERAL
                });
            }

            const fail = (text) => {
                const fine = economy.takeUpTo(
                    userId,
                    Math.min(ECONOMY.ROB_FINE_MAX, Math.floor(economy.getUser(userId).money * ECONOMY.ROB_FINE_PERCENT))
                );
                return interaction.followUp({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("DarkRed")
                            .setTitle("🚓 BRAQUAGE RATÉ")
                            .setDescription(`${text}\n\n👮 Amende : **−${money(fine)}**`)
                    ]
                });
            };

            // ===== PHASE 1 : retaper un mot =====
            const word = pick(WORDS);
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Orange")
                        .setTitle("🏦 PHASE 1")
                        .setDescription(`Retape ce mot :\n\`${word}\`\n\n⏳ 10 secondes`)
                ]
            });
            const answer1 = await askText(interaction, userId, 10000);
            if (answer1 === null) return fail("🚨 Temps écoulé.");
            if (answer1.toLowerCase() !== word) return fail("🚨 Mauvais mot.");

            // ===== PHASE 2 : retaper un code =====
            const code = String(randInt(1000, 9999));
            await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Red")
                        .setTitle("🔓 PHASE 2")
                        .setDescription(`Retape ce code :\n\`${code}\`\n\n⏳ 8 secondes`)
                ]
            });
            const answer2 = await askText(interaction, userId, 8000);
            if (answer2 === null) return fail("🚨 Trop lent.");
            if (answer2 !== code) return fail("🚨 Mauvais code.");

            // ===== PHASE 3 : couper le bon câble (boutons) =====
            const correct = pick(Object.keys(WIRES));
            const clue = pick(WIRES[correct].clues);
            const row = new ActionRowBuilder().addComponents(
                shuffle(Object.keys(WIRES)).map((color) =>
                    new ButtonBuilder()
                        .setCustomId(`rob_${color}`)
                        .setLabel(color)
                        .setEmoji(WIRES[color].emoji)
                        .setStyle(WIRES[color].style)
                )
            );
            const phase3 = await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setColor("DarkRed")
                        .setTitle("💣 PHASE 3")
                        .setDescription(`Coupe le câble de la couleur de : ${clue}\n\n⏳ 6 secondes`)
                ],
                components: [row]
            });

            const click = await phase3
                .awaitMessageComponent({
                    componentType: ComponentType.Button,
                    filter: (b) => {
                        if (b.user.id === userId) return true;
                        b.reply({ content: "❌ Ce n'est pas ton braquage.", flags: EPHEMERAL }).catch(() => {});
                        return false;
                    },
                    time: 6000
                })
                .catch(() => null);

            if (!click) {
                await phase3.edit({ components: [] }).catch(() => {});
                return fail("💥 Bombe explosée.");
            }
            await click.update({ components: [] });
            if (click.customId !== `rob_${correct}`) return fail(`💥 Mauvais câble, c'était le ${correct}.`);

            // ===== SUCCÈS =====
            const reward = randInt(...ECONOMY.ROB_GAIN);
            economy.addMoney(userId, reward);
            return interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Green")
                        .setTitle("🏆 BRAQUAGE RÉUSSI")
                        .setDescription(`💰 Gain : **${money(reward)}**`)
                ]
            });
        } finally {
            unlockUser(userId);
        }
    }
};
