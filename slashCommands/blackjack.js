const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { ECONOMY } = require("../config");
const { EPHEMERAL, money } = require("../utils/helpers");
const { createDeck, handValue, isBlackjack } = require("../utils/cards");
const c = require("../utils/casino");
const render = require("../utils/casinoRender");

const IDLE_TIMEOUT = 2 * 60 * 1000;
const SWAP_MARGIN = 900; // temps laissé au GIF pour se charger avant d'afficher l'image fixe

const labels = (game, reveal) => ({
    dealerLabel: `Croupier : ${reveal ? handValue(game.dealer) : "?"}`,
    playerLabel: `Toi : ${handValue(game.player)}`
});

function payload(game, { image, text = null, color = "Blue", components = [] }) {
    let description = `💰 Mise : **${money(game.bet)}**`;
    if (text) description += `\n\n${text}`;
    return {
        embeds: [
            new EmbedBuilder()
                .setTitle("🃏 Blackjack")
                .setColor(color)
                .setDescription(description)
                .setImage(`attachment://${image.name}`)
        ],
        files: [image.attachment],
        attachments: [],
        components
    };
}

function buttons(game, canDouble) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("bj_hit").setLabel("Tirer").setEmoji("🃏").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("bj_stand").setLabel("Rester").setEmoji("✋").setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("bj_double")
                .setLabel("Doubler")
                .setEmoji("💰")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!canDouble || game.player.length !== 2)
        )
    ];
}

// Le croupier joue, le joueur est payé. Renvoie le texte et la bannière du résultat.
function finishGame(economy, userId, game) {
    const player = handValue(game.player);
    if (player <= 21) {
        while (handValue(game.dealer) < 17) game.dealer.push(game.deck.pop());
    }
    const dealer = handValue(game.dealer);

    let payout = 0;
    let end;
    if (player > 21) {
        end = { text: `❌ **Tu as sauté !** −${money(game.bet)}`, color: "Red", banner: ["SAUTÉ !", "#c62828"] };
    } else if (dealer > 21 || player > dealer) {
        payout = game.bet * 2;
        const why = dealer > 21 ? "Le croupier saute !" : "Victoire !";
        end = {
            text: `✅ **${why}** +${money(game.bet)}`,
            color: "Green",
            banner: [`GAGNÉ +${money(game.bet)}`, "#2e7d32"]
        };
    } else if (player === dealer) {
        payout = game.bet;
        end = { text: "🤝 **Égalité**, mise rendue.", color: "Grey", banner: ["ÉGALITÉ", "#546e7a"] };
    } else {
        end = {
            text: `❌ **Défaite** −${money(game.bet)}`,
            color: "Red",
            banner: [`PERDU −${money(game.bet)}`, "#c62828"]
        };
    }

    c.settle(economy, userId, payout);
    return end;
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
        if (!(await c.placeBet(interaction, bet))) return;

        const deck = createDeck();
        const game = { deck, bet, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()] };
        const firstDeal = [
            { hand: "player", index: 0 },
            { hand: "dealer", index: 0 },
            { hand: "player", index: 1 },
            { hand: "dealer", index: 1 }
        ];

        // ----- Blackjack naturel : paie 3 contre 2 -----
        if (isBlackjack(game.player)) {
            const dealerBj = isBlackjack(game.dealer);
            const payout = dealerBj ? bet : Math.floor(bet * 2.5);
            c.settle(economy, userId, payout);
            const text = dealerBj
                ? "🤝 Blackjack des deux côtés, mise rendue."
                : `🎉 **BLACKJACK !** +${money(payout - bet)}`;
            const banner = dealerBj
                ? { text: "ÉGALITÉ", color: "#546e7a" }
                : { text: `BLACKJACK +${money(payout - bet)}`, color: "#f9a825" };

            await interaction.deferReply();
            await c.animate((p) => interaction.editReply(p), {
                embed: new EmbedBuilder()
                    .setTitle("🃏 Blackjack")
                    .setColor("Blue")
                    .setDescription(`💰 Mise : **${money(bet)}**`),
                gif: render.dealAnimation(game, firstDeal, labels(game, true), { hideHole: false }),
                finalEmbed: new EmbedBuilder()
                    .setTitle("🃏 Blackjack")
                    .setColor("Gold")
                    .setDescription(`💰 Mise : **${money(bet)}**\n\n${text}`),
                final: render.tableImage(game, labels(game, true), { hideHole: false, banner })
            });
            return;
        }

        const canDouble = () => economy.getUser(userId).money >= game.bet;
        let finished = false;
        let version = 0; // empêche de remplacer une image plus récente par une ancienne

        // Après l'animation d'une carte, on affiche l'image fixe de la table
        const swapToStill = (v) =>
            setTimeout(() => {
                if (v !== version || finished) return;
                interaction
                    .editReply(
                        payload(game, {
                            image: render.tableImage(game, labels(game, false), { hideHole: true }),
                            components: buttons(game, canDouble())
                        })
                    )
                    .catch(() => {});
            }, deal.duration + SWAP_MARGIN);

        // ----- Distribution animée -----
        let deal = render.dealAnimation(game, firstDeal, labels(game, false), { hideHole: true });
        const response = await interaction.reply({
            ...payload(game, { image: deal, components: buttons(game, canDouble()) }),
            withResponse: true
        });
        const message = response.resource.message;
        swapToStill(version);

        // Fin de partie : le croupier révèle sa carte et tire, avec animation
        const showEnd = async (edit, { playerDrew }) => {
            const end = finishGame(economy, userId, game);
            version++;
            const order = [
                ...(playerDrew ? [{ hand: "player", index: game.player.length - 1 }] : []),
                ...game.dealer.slice(2).map((_, k) => ({ hand: "dealer", index: k + 2 }))
            ];
            const final = render.tableImage(game, labels(game, true), {
                hideHole: false,
                banner: { text: end.banner[0], color: end.banner[1] }
            });
            if (order.length === 0) {
                return edit(payload(game, { image: final, text: end.text, color: end.color }));
            }
            const gif = render.dealAnimation(game, order, labels(game, true), { hideHole: false });
            await edit(payload(game, { image: gif, text: "🃏 Le croupier révèle sa carte…" }));
            await c.sleep(gif.duration + SWAP_MARGIN);
            await interaction.editReply(payload(game, { image: final, text: end.text, color: end.color }));
        };

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

                let playerDrew = false;
                if (button.customId === "bj_double") {
                    if (game.player.length !== 2 || !economy.takeMoney(userId, game.bet)) {
                        return button.reply({ content: "❌ Pas assez d'argent pour doubler.", flags: EPHEMERAL });
                    }
                    game.bet *= 2;
                    game.player.push(game.deck.pop());
                    playerDrew = true;
                    finished = true;
                } else if (button.customId === "bj_hit") {
                    game.player.push(game.deck.pop());
                    playerDrew = true;
                    if (handValue(game.player) >= 21) finished = true;
                } else {
                    finished = true;
                }

                if (finished) {
                    collector.stop("done");
                    return showEnd((p) => button.update(p), { playerDrew });
                }

                // Carte tirée : petite animation puis image fixe
                version++;
                deal = render.dealAnimation(
                    game,
                    [{ hand: "player", index: game.player.length - 1 }],
                    labels(game, false),
                    { hideHole: true }
                );
                await button.update(payload(game, { image: deal, components: buttons(game, canDouble()) }));
                swapToStill(version);
            } catch (err) {
                console.error("❌ Erreur blackjack :", err);
            }
        });

        // Sans action pendant 2 minutes : le joueur reste automatiquement
        collector.on("end", (_, reason) => {
            if (reason === "done" || finished) return;
            finished = true;
            showEnd((p) => interaction.editReply(p), { playerDrew: false }).catch(() => {});
        });
    }
};
