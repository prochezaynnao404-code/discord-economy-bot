const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { money } = require("../utils/helpers");
const c = require("../utils/casino");

const N = c.WHEEL_SEGMENTS.length;
const VISIBLE = 3; // cases visibles de chaque côté du pointeur

function strip(center) {
    const cells = [];
    for (let k = -VISIBLE; k <= VISIBLE; k++) {
        cells.push(c.WHEEL_STYLE[c.WHEEL_SEGMENTS[(((center + k) % N) + N) % N]]);
    }
    const pointer = "▫️".repeat(VISIBLE) + "🔻" + "▫️".repeat(VISIBLE);
    return `${pointer}\n${cells.join("")}`;
}

const LEGEND = Object.entries(c.WHEEL_STYLE)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([m, e]) => `${e} x${m.replace(".", ",")}`)
    .join("  ");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("roue")
        .setDescription("Roue de la fortune : de x0 à x8")
        .addIntegerOption((o) =>
            o
                .setName("mise")
                .setDescription("Montant de la mise")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(ECONOMY.MAX_BET)
        ),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const userId = interaction.user.id;
        const bet = interaction.options.getInteger("mise");
        if (!(await c.placeBet(interaction, bet))) return;

        const final = c.spinWheel();
        const embed = (center, footer, color = "Blue") =>
            new EmbedBuilder()
                .setTitle("🎡 Roue de la fortune")
                .setColor(color)
                .setDescription(`💰 Mise : **${money(bet)}**\n\n${strip(center)}\n\n${footer}\n\n${LEGEND}`);

        // La roue ralentit : grands sauts puis petits
        const offsets = [30, 20, 12, 6, 3, 1];
        await interaction.reply({ embeds: [embed(final - 40, "🌀 La roue tourne…")] });
        for (const off of offsets) {
            await c.sleep(650);
            await interaction.editReply({ embeds: [embed(final - off, "🌀 La roue tourne…")] });
        }
        await c.sleep(800);

        const multiplier = c.WHEEL_SEGMENTS[final];
        const payout = Math.floor(bet * multiplier);
        c.settle(economy, userId, payout);
        const profit = payout - bet;

        const result =
            multiplier === 0
                ? `❌ **x0** : perdu −${money(bet)}`
                : `${profit > 0 ? "✅" : profit === 0 ? "🤝" : "🟠"} **x${String(multiplier).replace(".", ",")}** → ${money(payout)} ` +
                  `(${profit >= 0 ? "+" : "−"}${money(Math.abs(profit))})`;
        const color = profit > 0 ? "Green" : profit === 0 ? "Grey" : "Red";
        return interaction.editReply({ embeds: [embed(final, result, color)] });
    }
};
