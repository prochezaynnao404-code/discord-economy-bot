const test = require("node:test");
const assert = require("node:assert");

const { createDeck, handValue, isBlackjack } = require("../utils/cards");

const c = (rank) => ({ rank, suit: "♠" });

test("le paquet contient 52 cartes uniques", () => {
    const deck = createDeck();
    assert.strictEqual(deck.length, 52);
    assert.strictEqual(new Set(deck.map((x) => x.rank + x.suit)).size, 52);
});

test("valeur des mains avec As", () => {
    assert.strictEqual(handValue([c("A"), c("K")]), 21);
    assert.strictEqual(handValue([c("A"), c("A")]), 12);
    assert.strictEqual(handValue([c("A"), c("9"), c("5")]), 15);
    assert.strictEqual(handValue([c("Q"), c("J"), c("2")]), 22);
});

test("blackjack naturel uniquement avec 2 cartes", () => {
    assert.ok(isBlackjack([c("A"), c("10")]));
    assert.ok(!isBlackjack([c("7"), c("7"), c("7")]));
});
