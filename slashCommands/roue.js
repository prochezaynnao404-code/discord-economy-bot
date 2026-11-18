const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { money } = require("../utils/helpers");
const c = require("../utils/casino");
const render = require("../utils/casinoRender");

const format = (m) => `x${String(m).replace(".", ",")}`;
const COUNTS = c.WHEEL_SEGMENTS.reduce((acc, m) => acc.set(m, (acc.get(m) || 0) + 1), new Map());
const LEGEND = [...COUNTS.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([m, n]) => `${format(m)} (${n} case${n > 1 ? "s" : ""})`)
    .join(" · ");

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
        await interaction.deferReply();

        const final = c.spinWheel();
        const multiplier = c.WHEEL_SEGMENTS[final];
        const payout = Math.floor(bet * multiplier);
        c.settle(economy, userId, payout);
        const profit = payout - bet;

        const result =
            multiplier === 0
                ? `❌ **x0** : perdu −${money(bet)}`
                : `${profit > 0 ? "✅" : profit === 0 ? "🤝" : "🟠"} **${format(multiplier)}** → ${money(payout)} ` +
                  `(${profit >= 0 ? "+" : "−"}${money(Math.abs(profit))})`;
        const color = profit > 0 ? "Green" : profit === 0 ? "Grey" : "Red";
        const info = `💰 Mise : **${money(bet)}**`;

        await c.animate((p) => interaction.editReply(p), {
            embed: new EmbedBuilder()
                .setTitle("🎡 Roue de la fortune")
                .setColor("Blurple")
                .setDescription(`${info}\n\n🌀 La roue tourne…`),
            gif: render.wheelAnimation(c.WHEEL_SEGMENTS, final),
            finalEmbed: new EmbedBuilder()
                .setTitle("🎡 Roue de la fortune")
                .setColor(color)
                .setDescription(`${info}\n\n${result}`)
                .setFooter({ text: LEGEND }),
            final: render.wheelResult(c.WHEEL_SEGMENTS, final)
        });
    }
};
