const test = require("node:test");
const assert = require("node:assert");

const { Economy } = require("../utils/db");
const { TITLES, TITLE_BY_ID, syncTitles, equippedTitle, progressOf, titleContext } = require("../utils/titles");

test("les identifiants de titres sont uniques et chaque titre a une condition ou un prix", () => {
    assert.strictEqual(new Set(TITLES.map((t) => t.id)).size, TITLES.length);
    for (const t of TITLES) assert.ok(t.goal || t.price, t.id);
});

test("syncTitles débloque une seule fois et garde le titre même si la condition disparaît", () => {
    const eco = new Economy(":memory:");
    eco.addMoney("a", 2_000_000);
    const first = syncTitles(eco, "a").map((t) => t.id);
    assert.ok(first.includes("millionnaire"));
    assert.ok(!first.includes("magnat"));
    assert.deepStrictEqual(syncTitles(eco, "a"), []); // rien de nouveau

    eco.takeMoney("a", 2_000_000);
    syncTitles(eco, "a");
    assert.ok(eco.hasTitle("a", "millionnaire")); // toujours là
});

test("équiper : seulement un titre débloqué ; retirer avec null", () => {
    const eco = new Economy(":memory:");
    assert.strictEqual(eco.equipTitle("a", "millionnaire"), false);
    eco.unlockTitles("a", ["millionnaire"]);
    assert.ok(eco.equipTitle("a", "millionnaire"));
    assert.strictEqual(equippedTitle(eco.getUser("a")).name, "Millionnaire");
    assert.ok(eco.equipTitle("a", null));
    assert.strictEqual(equippedTitle(eco.getUser("a")), null);
});

test("boutique : achat atomique, l'argent est détruit, pas de double achat", () => {
    const eco = new Economy(":memory:");
    const baron = TITLE_BY_ID.baron;
    assert.strictEqual(eco.buyTitle("a", "baron", baron.price), "money");
    eco.addMoney("a", baron.price + 5);
    assert.strictEqual(eco.buyTitle("a", "baron", baron.price), "ok");
    assert.strictEqual(eco.getUser("a").money, 5);
    assert.strictEqual(eco.buyTitle("a", "baron", baron.price), "owned");
});

test("progression : ratio plafonné, titres d'entreprise et de bar", () => {
    const eco = new Economy(":memory:");
    eco.addMoney("boss", 10_000_000);
    eco.createBusiness("boss", "Corp", 1000);
    eco.buyDrink("boss", "x", "biere");
    const ctx = titleContext(eco, "boss");
    assert.strictEqual(progressOf(TITLE_BY_ID.entrepreneur, ctx).done, true);
    assert.strictEqual(progressOf(TITLE_BY_ID.genereux, ctx).current, 1);
    assert.strictEqual(progressOf(TITLE_BY_ID.magnat, ctx).ratio < 1, true);
    assert.strictEqual(progressOf(TITLE_BY_ID.baron, ctx), null); // titre de boutique
    assert.ok(syncTitles(eco, "boss").some((t) => t.id === "entrepreneur"));
});
