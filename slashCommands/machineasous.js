const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { money } = require("../utils/helpers");
const c = require("../utils/casino");
const render = require("../utils/casinoRender");

const JACKPOT_KEY = "casino.jackpot";
const SYMBOLS = c.SLOT_SYMBOLS.map((s) => s.emoji);

function getJackpot(economy) {
    return Number(economy.getSetting(JACKPOT_KEY) ?? c.SLOT_JACKPOT_SEED);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("machineasous")
        .setDescription("Machine à sous : 3 rouleaux, 💎💎💎 = jackpot")
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

        // Une partie de chaque mise alimente le jackpot
        let jackpot = getJackpot(economy) + Math.floor(bet * c.SLOT_JACKPOT_SHARE);
        economy.setSetting(JACKPOT_KEY, String(jackpot));

        // Le résultat est tiré et payé tout de suite, l'animation ne fait que le montrer
        const reels = [c.spinReel(), c.spinReel(), c.spinReel()];
        const outcome = c.slotPayout(reels);
        let payout = Math.floor(bet * outcome.multiplier);
        if (outcome.jackpot) {
            payout = jackpot;
            jackpot = c.SLOT_JACKPOT_SEED;
            economy.setSetting(JACKPOT_KEY, String(jackpot));
        }
        c.settle(economy, userId, payout);

        const profit = payout - bet;
        const info = `💰 Mise : **${money(bet)}** · 💎 Jackpot : **${money(jackpot)}**`;
        const text = outcome.jackpot
            ? `🎉🎉 **JACKPOT !** Tu remportes **${money(payout)}** !`
            : payout > 0
              ? `✅ **${outcome.label}** (x${String(outcome.multiplier).replace(".", ",")}) → ${money(payout)} ` +
                `(${profit >= 0 ? "+" : "−"}${money(Math.abs(profit))})`
              : `❌ ${outcome.label} : −${money(bet)}`;
        const banner = outcome.jackpot
            ? { text: `JACKPOT ${money(payout)}`, color: "#f9a825", win: true }
            : profit > 0
              ? { text: `GAGNÉ +${money(profit)}`, color: "#2e7d32", win: true }
              : payout > 0
                ? { text: `REMBOURSÉ ${money(payout)}`, color: "#546e7a", win: false }
                : { text: "PERDU", color: "#c62828", win: false };
        const color = outcome.jackpot ? "Gold" : profit > 0 ? "Green" : profit === 0 ? "Grey" : "Red";

        await c.animate((p) => interaction.editReply(p), {
            embed: new EmbedBuilder()
                .setTitle("🎰 Machine à sous")
                .setColor("Purple")
                .setDescription(`${info}\n\n🎲 Les rouleaux tournent…`),
            gif: render.slotAnimation(reels, SYMBOLS),
            finalEmbed: new EmbedBuilder()
                .setTitle("🎰 Machine à sous")
                .setColor(color)
                .setDescription(`${info}\n\n${text}`),
            final: render.slotResult(reels, banner)
        });
    }
};
