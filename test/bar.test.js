const test = require("node:test");
const assert = require("node:assert");

const { Economy } = require("../utils/db");
const { DRINKS, IVRESSE, currentIvresse, ivresseState } = require("../utils/bar");

const MIN = 60 * 1000;

function fresh() {
    const eco = new Economy(":memory:");
    eco.addMoney("a", 10_000_000);
    return eco;
}

test("acheter une boisson : paie, applique le bonus, puis il expire", () => {
    const eco = fresh();
    const t0 = 1_000_000;
    const r = eco.buyDrink("a", "a", "biere", t0);
    assert.strictEqual(r.status, "ok");
    assert.strictEqual(eco.getUser("a").money, 10_000_000 - DRINKS.biere.price);
    assert.strictEqual(eco.drinkBoost("a", "gains", 1000, t0 + MIN), 1100);
    assert.strictEqual(eco.drinkBoost("a", "xp", 1000, t0 + MIN), 1000);
    assert.strictEqual(eco.drinkBoost("a", "gains", 1000, t0 + DRINKS.biere.duration + 1), 1000);
});

test("un effet plus faible ne remplace pas un plus fort", () => {
    const eco = fresh();
    eco.buyDrink("a", "a", "whisky", 0);
    const r = eco.buyDrink("a", "a", "soda", MIN);
    assert.strictEqual(r.effects[0].kept, "whisky");
    assert.strictEqual(eco.drinkBoost("a", "gains", 1000, 2 * MIN), 1300);
    // Champagne : gains 25 % < whisky 30 % (whisky conservé), mais l'effet XP s'applique
    const c = eco.buyDrink("a", "a", "champagne", 3 * MIN);
    assert.deepStrictEqual(
        c.effects.map((e) => [e.effect, e.kept]),
        [
            ["gains", "whisky"],
            ["xp", null]
        ]
    );
    assert.strictEqual(eco.drinkBoost("a", "gains", 1000, 4 * MIN), 1300);
    assert.strictEqual(eco.drinkBoost("a", "xp", 1000, 4 * MIN), 1250);
    // Un plus fort remplace : la bière (10 %) d'un autre joueur est remplacée par le cocktail (20 %)
    eco.buyDrink("a", "b", "biere", 0);
    eco.buyDrink("a", "b", "cocktail", MIN);
    assert.strictEqual(eco.drinkBoost("b", "gains", 1000, 2 * MIN), 1200);
});

test("pas assez d'argent", () => {
    const eco = new Economy(":memory:");
    assert.strictEqual(eco.buyDrink("a", "a", "cafe").status, "money");
    assert.throws(() => eco.buyDrink("a", "a", "poison"));
});

test("ivresse : monte, redescend avec le temps, le café dessoûle, refus au maximum", () => {
    const eco = fresh();
    for (let i = 0; i < 3; i++) eco.buyDrink("a", "a", "cocktail", 0);
    assert.strictEqual(eco.getIvresse("a", 0), IVRESSE.MAX);
    assert.strictEqual(eco.buyDrink("a", "a", "biere", 0).status, "drunk");
    assert.strictEqual(eco.buyDrink("a", "a", "soda", 0).status, "ok"); // sans alcool : servi
    assert.strictEqual(eco.buyDrink("a", "a", "cafe", 0).ivresse, IVRESSE.MAX - 2);
    assert.strictEqual(eco.getIvresse("a", IVRESSE.DECAY * 2), IVRESSE.MAX - 4);
    assert.strictEqual(currentIvresse(3, 0, IVRESSE.DECAY * 10), 0);
    assert.strictEqual(ivresseState(0).workFail, 0);
    assert.ok(ivresseState(IVRESSE.MAX).workFail > ivresseState(2).workFail);
});

test("offrir : l'acheteur paie, le joueur reçoit l'effet", () => {
    const eco = fresh();
    assert.strictEqual(eco.buyDrink("a", "b", "vin", 0).status, "ok");
    assert.strictEqual(eco.getUser("a").money, 10_000_000 - DRINKS.vin.price);
    assert.strictEqual(eco.drinkBoost("b", "xp", 100, MIN), 115);
    assert.strictEqual(eco.drinkBoost("a", "xp", 100, MIN), 100);
    assert.strictEqual(eco.getUser("a").drinksOffered, 1);
    assert.strictEqual(eco.getUser("b").drinks, 1);
});
