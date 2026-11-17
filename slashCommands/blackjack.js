const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ComponentType
} = require("discord.js");

const { ECONOMY } = require("../config");
const { EPHEMERAL, money } = require("../utils/helpers");
const { createDeck, handValue, isBlackjack, formatHand } = require("../utils/cards");

const IDLE_TIMEOUT = 2 * 60 * 1000;

function buildEmbed(game, { reveal = false, result = null, color = "Blue" } = {}) {
    const dealerShown = reveal ? game.dealer : [game.dealer[0]];
    const dealerValue = reveal ? handValue(game.dealer) : "?";

    let description =
        `👤 **Toi** (${handValue(game.player)})\n${formatHand(game.player)}\n\n` +
        `🤖 **Croupier** (${dealerValue})\n${formatHand(dealerShown)}${reveal ? "" : " `??`"}\n\n` +
        `💰 Mise : **${money(game.bet)}**`;
    if (result) description += `\n\n${result}`;

    return new EmbedBuilder().setTitle("🃏 BLACKJACK").setColor(color).setDescription(description);
}

function buildButtons(game, canDouble) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bj_hit").setLabel("Tirer").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("bj_stand").setLabel("Rester").setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("bj_double")
            .setLabel("Doubler")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!canDouble || game.player.length !== 2)
    );
}

// Termine la partie, paie le joueur et renvoie l'embed final
function settle(economy, userId, game) {
    while (handValue(game.dealer) < 17) game.dealer.push(game.deck.pop());

    const player = handValue(game.player);
    const dealer = handValue(game.dealer);

    let payout = 0;
    let result;
    let color;

    if (player > 21) {
        result = `❌ **Tu as sauté !** −${money(game.bet)}`;
        color = "Red";
    } else if (dealer > 21 || player > dealer) {
        payout = game.bet * 2;
        result = `✅ **Victoire !** +${money(game.bet)}`;
        color = "Green";
    } else if (player === dealer) {
        payout = game.bet;
        result = "🤝 **Égalité**, mise rendue.";
        color = "Grey";
    } else {
        result = `❌ **Défaite** −${money(game.bet)}`;
        color = "Red";
    }

    if (payout > 0) economy.addMoney(userId, payout);
    economy.progressQuest(userId, "casino");
    return buildEmbed(game, { reveal: true, result, color });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("blackjack")
        .setDescription("Jouer au blackjack")
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
        const bet = interaction.options.getInteger("mise");

        if (!economy.takeMoney(userId, bet)) {
            return interaction.reply({ content: "❌ Pas assez d'argent.", flags: EPHEMERAL });
        }

        const deck = createDeck();
        const game = { deck, bet, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()] };

        // Blackjack naturel : paye 3:2
        if (isBlackjack(game.player)) {
            const dealerBj = isBlackjack(game.dealer);
            const payout = dealerBj ? bet : Math.floor(bet * 2.5);
            economy.addMoney(userId, payout);
            economy.progressQuest(userId, "casino");
            const result = dealerBj
                ? "🤝 Blackjack des deux côtés, mise rendue."
                : `🎉 **BLACKJACK !** +${money(payout - bet)}`;
            return interaction.reply({ embeds: [buildEmbed(game, { reveal: true, result, color: "Gold" })] });
        }

        const canDouble = () => economy.getUser(userId).money >= game.bet;

        const response = await interaction.reply({
            embeds: [buildEmbed(game)],
            components: [buildButtons(game, canDouble())],
            withResponse: true
        });
        const message = response.resource.message;

        let finished = false;
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            idle: IDLE_TIMEOUT
        });

        collector.on("collect", async (button) => {
            try {
                if (button.user.id !== userId) {
                    return button.reply({ content: "❌ Ce n'est pas ta partie.", flags: EPHEMERAL });
                }
                if (finished) return button.deferUpdate();

                if (button.customId === "bj_double") {
                    if (game.player.length !== 2 || !economy.takeMoney(userId, game.bet)) {
                        return button.reply({ content: "❌ Pas assez d'argent pour doubler.", flags: EPHEMERAL });
                    }
                    game.bet *= 2;
                    game.player.push(game.deck.pop());
                    finished = true;
                } else if (button.customId === "bj_hit") {
                    game.player.push(game.deck.pop());
                    if (handValue(game.player) >= 21) finished = true;
                } else {
                    finished = true;
                }

                if (finished) {
                    collector.stop("done");
                    return button.update({ embeds: [settle(economy, userId, game)], components: [] });
                }
                return button.update({ embeds: [buildEmbed(game)], components: [buildButtons(game, canDouble())] });
            } catch (err) {
                console.error("❌ Erreur blackjack :", err);
            }
        });

        // Sans action pendant 2 minutes : le joueur reste automatiquement
        collector.on("end", (_, reason) => {
            if (reason === "done" || finished) return;
            finished = true;
            const embed = settle(economy, userId, game);
            interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
        });
    }
};
