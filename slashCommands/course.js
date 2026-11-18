const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { money } = require("../utils/helpers");
const c = require("../utils/casino");

function track(positions, highlight) {
    const lines = c.HORSES.map((h, i) => {
        const pos = positions[i];
        const lane = ".".repeat(pos) + h.emoji + ".".repeat(c.RACE_LENGTH - pos);
        return `${lane}|${i === highlight ? " ⬅️" : ""} ${h.name}`;
    });
    return "```\n" + lines.join("\n") + "\n```";
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("course")
        .setDescription("Course de chevaux : parie sur le gagnant")
        .addIntegerOption((o) =>
            o
                .setName("mise")
                .setDescription("Montant de la mise")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(ECONOMY.MAX_BET)
        )
        .addStringOption((o) =>
            o
                .setName("cheval")
                .setDescription("Ton cheval (cote entre parenthèses)")
                .setRequired(true)
                .addChoices(...c.HORSES.map((h) => ({ name: `${h.name} (x${h.odds})`, value: h.name })))
        ),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const userId = interaction.user.id;
        const bet = interaction.options.getInteger("mise");
        const pickName = interaction.options.getString("cheval");
        const pickIndex = c.HORSES.findIndex((h) => h.name === pickName);
        const pick = c.HORSES[pickIndex];
        if (!(await c.placeBet(interaction, bet))) return;

        const { winner, frames } = c.planRace();
        const header = `🎟️ Ton pari : ${pick.emoji} **${pick.name}** à **x${pick.odds}** — mise ${money(bet)}`;
        const embed = (positions, footer, color = "Blue") =>
            new EmbedBuilder()
                .setTitle("🏇 Course de chevaux")
                .setColor(color)
                .setDescription(`${header}\n${track(positions, pickIndex)}\n${footer}`);

        await interaction.reply({
            embeds: [
                embed(
                    c.HORSES.map(() => 0),
                    "🔔 Les chevaux sont dans les stalles…"
                )
            ]
        });
        await c.sleep(1200);

        for (let t = 0; t < frames.length - 1; t++) {
            await interaction.editReply({ embeds: [embed(frames[t], "🏁 La course est lancée !")] });
            await c.sleep(1100);
        }

        const won = winner === pick;
        const payout = won ? Math.floor(bet * pick.odds) : 0;
        c.settle(economy, userId, payout);

        const result = won
            ? `🏆 **${winner.emoji} ${winner.name} gagne !** Tu remportes **${money(payout)}** (+${money(payout - bet)})`
            : `🏆 **${winner.emoji} ${winner.name} gagne.** Ton cheval a perdu : −${money(bet)}`;
        return interaction.editReply({ embeds: [embed(frames.at(-1), result, won ? "Green" : "Red")] });
    }
};
