const test = require("node:test");
const assert = require("node:assert");

const { Economy } = require("../utils/db");
const { computeWealthTax, exemptionThreshold, lastDueTime, nextDueTime } = require("../utils/tax");

test("barème : exonération sous 1 000 000", () => {
    assert.strictEqual(exemptionThreshold(), 1_000_000);
    assert.strictEqual(computeWealthTax(0).total, 0);
    assert.strictEqual(computeWealthTax(1_000_000).total, 0);
});

test("barème : calcul par tranches", () => {
    // 2M : 1 % sur la tranche 1M-2M
    assert.strictEqual(computeWealthTax(2_000_000).total, 10_000);
    // 10M : 1 % de 4M + 2 % de 5M
    assert.strictEqual(computeWealthTax(10_000_000).total, 40_000 + 100_000);
    // 200M : 40k + 300k + 2.4M + 5 % de 100M
    assert.strictEqual(computeWealthTax(200_000_000).total, 40_000 + 300_000 + 2_400_000 + 5_000_000);
    // Pas d'effet de seuil : 1 $ de plus ne coûte jamais plus de 5 centimes
    const a = computeWealthTax(5_000_000).total;
    const b = computeWealthTax(5_000_001).total;
    assert.ok(b - a <= 1);
});

test("échéance : dimanche 21 h heure de Paris (heure d'hiver et d'été)", () => {
    // Mercredi 18 novembre 2026, 12 h UTC -> dernier dimanche 15/11 21 h Paris = 20 h UTC
    assert.strictEqual(new Date(lastDueTime(Date.UTC(2026, 10, 18, 12))).toISOString(), "2026-11-15T20:00:00.000Z");
    assert.strictEqual(new Date(nextDueTime(Date.UTC(2026, 10, 18, 12))).toISOString(), "2026-11-22T20:00:00.000Z");
    // Dimanche 22/11 20 h 59 Paris : pas encore l'échéance du jour
    assert.strictEqual(new Date(lastDueTime(Date.UTC(2026, 10, 22, 19, 59))).toISOString(), "2026-11-15T20:00:00.000Z");
    // Dimanche 22/11 21 h 00 Paris pile
    assert.strictEqual(new Date(lastDueTime(Date.UTC(2026, 10, 22, 20, 0))).toISOString(), "2026-11-22T20:00:00.000Z");
    // Été : 21 h Paris = 19 h UTC
    assert.strictEqual(new Date(lastDueTime(Date.UTC(2026, 6, 15, 12))).toISOString(), "2026-07-12T19:00:00.000Z");
    // Passage à l'heure d'été (29 mars 2026) : semaine suivante bien calée
    assert.strictEqual(new Date(nextDueTime(Date.UTC(2026, 2, 25, 12))).toISOString(), "2026-03-29T19:00:00.000Z");
});

test("prélèvement : poche puis banque, argent détruit, historique", () => {
    const eco = new Economy(":memory:");
    eco.addMoney("riche", 1_500_000);
    eco.deposit("riche", 1_495_000); // poche 5 000, banque 1 495 000
    eco.addMoney("pauvre", 500_000);

    const result = eco.collectWealthTax((w) => computeWealthTax(w).total, 1000);
    assert.strictEqual(result.total, 5_000);
    assert.deepStrictEqual(result.payers, [{ userId: "riche", amount: 5_000, wealth: 1_500_000 }]);

    const riche = eco.getUser("riche");
    assert.strictEqual(riche.money, 0);
    assert.strictEqual(riche.bank, 1_495_000);
    assert.strictEqual(eco.getUser("pauvre").money, 500_000);

    const summary = eco.getTaxSummary("riche");
    assert.strictEqual(summary.total, 5_000);
    assert.strictEqual(summary.last.at, 1000);
    assert.strictEqual(eco.totalTaxDestroyed(), 5_000);
    assert.strictEqual(eco.recentTaxRuns()[0].payers, 1);
});

test("réglages : lecture / écriture", () => {
    const eco = new Economy(":memory:");
    assert.strictEqual(eco.getSetting("x"), null);
    eco.setSetting("x", "1");
    eco.setSetting("x", "2");
    assert.strictEqual(eco.getSetting("x"), "2");
});
