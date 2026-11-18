const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { EPHEMERAL, money } = require("../utils/helpers");
const c = require("../utils/casino");
const { setupMatch, unlockPlayers } = require("../utils/games/session");

const FACES = { pile: "🪙 Pile", face: "👑 Face" };

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pileouface")
        .setDescription("Pile ou face contre le bot (x1,95) ou en duel contre un joueur")
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
                .setName("choix")
                .setDescription("Ton côté")
                .setRequired(true)
                .addChoices({ name: "Pile", value: "pile" }, { name: "Face", value: "face" })
        )
        .addUserOption((o) =>
            o.setName("adversaire").setDescription("Joueur à défier (même mise, le gagnant prend tout)")
        ),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const me = interaction.user;
        const bet = interaction.options.getInteger("mise");
        const choice = interaction.options.getString("choix");

        // Vérifie la mise avant d'envoyer une invitation
        if (economy.getUser(me.id).money < bet) {
            return interaction.reply({ content: "❌ Pas assez d'argent en poche.", flags: EPHEMERAL });
        }

        const match = await setupMatch(interaction, { game: `Pile ou face (${money(bet)})` });
        if (!match) return;
        const ids = match.players.filter((p) => !p.isBot).map((p) => p.id);

        try {
            // ----- Prise des mises -----
            if (!economy.takeMoney(me.id, bet)) {
                return match.respond({ content: "❌ Tu n'as plus assez d'argent.", components: [] });
            }
            const rival = match.players.find((p) => p.id !== me.id);
            if (!match.vsBot && !economy.takeMoney(rival.id, bet)) {
                economy.addMoney(me.id, bet);
                return match.respond({
                    content: `❌ ${rival.name} n'a pas assez d'argent pour suivre la mise.`,
                    components: []
                });
            }

            const sides = { [choice]: me, [choice === "pile" ? "face" : "pile"]: match.vsBot ? null : rival };
            const intro =
                `${me} : **${FACES[choice]}**` +
                (match.vsBot ? "" : ` · ${rival.mention} : **${FACES[choice === "pile" ? "face" : "pile"]}**`) +
                `\n💰 Mise : **${money(bet)}**${match.vsBot ? "" : ` chacun (pot ${money(bet * 2)})`}`;

            const message = await match.respond({
                content: "",
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🪙 Pile ou face")
                        .setColor("Blue")
                        .setDescription(`${intro}\n\n🌀 La pièce tourne…`)
                ],
                components: []
            });
            await c.sleep(1500);

            // ----- Résultat -----
            const result = c.flipCoin();
            const winner = sides[result];
            let outcome;
            if (match.vsBot) {
                const won = winner?.id === me.id;
                const payout = won ? Math.floor(bet * c.COIN_PAYOUT) : 0;
                c.settle(economy, me.id, payout);
                outcome = won ? `✅ Gagné ! +${money(payout - bet)}` : `❌ Perdu : −${money(bet)}`;
            } else {
                economy.addMoney(winner.id, bet * 2);
                outcome = `🏆 ${winner.mention ?? winner} remporte **${money(bet * 2)}** !`;
            }

            const won = match.vsBot ? winner?.id === me.id : true;
            await message.edit({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🪙 Pile ou face")
                        .setColor(won ? "Green" : "Red")
                        .setDescription(`${intro}\n\nRésultat : **${FACES[result]}**\n\n${outcome}`)
                ]
            });
        } finally {
            unlockPlayers(ids);
        }
    }
};
