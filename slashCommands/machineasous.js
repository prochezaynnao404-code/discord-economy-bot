const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { money } = require("../utils/helpers");
const c = require("../utils/casino");

const JACKPOT_KEY = "casino.jackpot";

function getJackpot(economy) {
    return Number(economy.getSetting(JACKPOT_KEY) ?? c.SLOT_JACKPOT_SEED);
}

function embed({ reels, bet, jackpot, result = null, color = "Purple" }) {
    let description = `${reels.join(" ┃ ")}\n\n💰 Mise : **${money(bet)}**\n💎 Jackpot : **${money(jackpot)}**`;
    if (result) description += `\n\n${result}`;
    return new EmbedBuilder().setTitle("🎰 Machine à sous").setColor(color).setDescription(description);
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

        // Une partie de chaque mise alimente le jackpot
        let jackpot = getJackpot(economy) + Math.floor(bet * c.SLOT_JACKPOT_SHARE);
        economy.setSetting(JACKPOT_KEY, String(jackpot));

        const final = [c.spinReel(), c.spinReel(), c.spinReel()];
        const spinning = "🔄";

        await interaction.reply({ embeds: [embed({ reels: [spinning, spinning, spinning], bet, jackpot })] });
        for (let i = 1; i <= 3; i++) {
            await c.sleep(700);
            const reels = final.map((r, j) => (j < i ? r : spinning));
            if (i < 3) await interaction.editReply({ embeds: [embed({ reels, bet, jackpot })] });
        }

        const outcome = c.slotPayout(final);
        let payout = Math.floor(bet * outcome.multiplier);
        if (outcome.jackpot) {
            payout = jackpot;
            jackpot = c.SLOT_JACKPOT_SEED;
            economy.setSetting(JACKPOT_KEY, String(jackpot));
        }
        c.settle(economy, userId, payout);

        const profit = payout - bet;
        const text = outcome.jackpot
            ? `🎉🎉 **${outcome.label}** 🎉🎉\nTu remportes **${money(payout)}** !`
            : payout > 0
              ? `✅ **${outcome.label}** (x${outcome.multiplier}) → ${money(payout)} (${profit >= 0 ? "+" : ""}${money(profit)})`
              : `❌ ${outcome.label} : −${money(bet)}`;
        const color = outcome.jackpot ? "Gold" : profit > 0 ? "Green" : profit === 0 ? "Grey" : "Red";

        return interaction.editReply({ embeds: [embed({ reels: final, bet, jackpot, result: text, color })] });
    }
};
