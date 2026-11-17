const { shuffle } = require("./helpers");

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) deck.push({ rank, suit });
    }
    return shuffle(deck);
}

// Valeur d'une main : l'As vaut 11, ou 1 si la main dépasse 21
function handValue(hand) {
    let total = 0;
    let aces = 0;
    for (const card of hand) {
        if (card.rank === "A") {
            aces++;
            total += 11;
        } else if (["J", "Q", "K"].includes(card.rank)) {
            total += 10;
        } else {
            total += Number(card.rank);
        }
    }
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}

function isBlackjack(hand) {
    return hand.length === 2 && handValue(hand) === 21;
}

function formatHand(hand) {
    return hand.map((c) => `\`${c.rank}${c.suit}\``).join(" ");
}

module.exports = { createDeck, handValue, isBlackjack, formatHand };
