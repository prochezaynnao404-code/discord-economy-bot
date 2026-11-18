const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { money } = require("../utils/helpers");
const c = require("../utils/casino");
const render = require("../utils/casinoRender");

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
        const pickIndex = c.HORSES.findIndex((h) => h.name === interaction.options.getString("cheval"));
        const pick = c.HORSES[pickIndex];
        if (!(await c.placeBet(interaction, bet))) return;
        await interaction.deferReply();

        const { winner, frames } = c.planRace();
        const winnerIndex = c.HORSES.indexOf(winner);
        const won = winner === pick;
        const payout = won ? Math.floor(bet * pick.odds) : 0;
        c.settle(economy, userId, payout);

        const info = `🎟️ Ton pari : **${pick.name}** à **x${pick.odds}** — mise ${money(bet)}`;
        const result = won
            ? `🏆 **${winner.name} gagne !** Tu remportes **${money(payout)}** (+${money(payout - bet)})`
            : `🏆 **${winner.name} gagne.** Ton cheval a perdu : −${money(bet)}`;

        await c.animate((p) => interaction.editReply(p), {
            embed: new EmbedBuilder()
                .setTitle("🏇 Course de chevaux")
                .setColor("Blue")
                .setDescription(`${info}\n\n🏁 Les chevaux sont partis !`),
            gif: render.raceAnimation(c.HORSES, frames, c.RACE_LENGTH, pickIndex),
            finalEmbed: new EmbedBuilder()
                .setTitle("🏇 Course de chevaux")
                .setColor(won ? "Green" : "Red")
                .setDescription(`${info}\n\n${result}`),
            final: render.raceResult(c.HORSES, frames.at(-1), c.RACE_LENGTH, pickIndex, winnerIndex)
        });
    }
};
