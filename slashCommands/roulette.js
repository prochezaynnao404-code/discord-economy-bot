const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { money, randInt } = require("../utils/helpers");
const c = require("../utils/casino");
const render = require("../utils/casinoRender");

// Roulette européenne : 0 = vert, numéros rouges officiels
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const PAYOUT = { rouge: 2, noir: 2, vert: 36 }; // montant rendu (mise comprise)
const EMOJI = { rouge: "🔴", noir: "⚫", vert: "🟢" };

function colorOf(number) {
    if (number === 0) return "vert";
    return RED_NUMBERS.has(number) ? "rouge" : "noir";
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("roulette")
        .setDescription("Jouer à la roulette")
        .addStringOption((option) =>
            option
                .setName("couleur")
                .setDescription("Rouge / noir (x2) ou vert (x36)")
                .setRequired(true)
                .addChoices(
                    { name: "Rouge (x2)", value: "rouge" },
                    { name: "Noir (x2)", value: "noir" },
                    { name: "Vert (x36)", value: "vert" }
                )
        )
        .addIntegerOption((option) =>
            option
                .setName("mise")
                .setDescription("Montant de la mise")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(ECONOMY.MAX_BET)
        ),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const userId = interaction.user.id;
        const color = interaction.options.getString("couleur");
        const bet = interaction.options.getInteger("mise");
        if (!(await c.placeBet(interaction, bet))) return;
        await interaction.deferReply();

        const number = randInt(0, 36);
        const result = colorOf(number);
        const won = result === color;
        const payout = won ? bet * PAYOUT[color] : 0;
        c.settle(economy, userId, payout);

        const info = `🎯 Ton pari : ${EMOJI[color]} **${color}** · 💰 Mise : **${money(bet)}**`;
        await c.animate((p) => interaction.editReply(p), {
            embed: new EmbedBuilder()
                .setTitle("🎡 Roulette")
                .setColor("DarkGreen")
                .setDescription(`${info}\n\n🌀 Rien ne va plus…`),
            gif: render.rouletteAnimation(number),
            finalEmbed: new EmbedBuilder()
                .setTitle("🎡 Roulette")
                .setColor(won ? "Green" : "Red")
                .setDescription(
                    `${info}\n\nRésultat : ${EMOJI[result]} **${number}** (${result})\n\n` +
                        (won ? `✅ Tu as gagné **${money(payout - bet)}**` : `❌ Tu as perdu **${money(bet)}**`)
                ),
            final: render.rouletteResult(number)
        });
    }
};
