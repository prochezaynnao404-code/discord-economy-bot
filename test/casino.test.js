const test = require("node:test");
const assert = require("node:assert");

const c = require("../utils/casino");

test("machine à sous : retour joueur entre 94 % et 98 % (calcul exact)", () => {
    const total = c.SLOT_SYMBOLS.reduce((s, x) => s + x.weight, 0);
    let rtp = 0;
    let jackpotChance = 0;
    for (const a of c.SLOT_SYMBOLS) {
        for (const b of c.SLOT_SYMBOLS) {
            for (const d of c.SLOT_SYMBOLS) {
                const p = (a.weight / total) * (b.weight / total) * (d.weight / total);
                const result = c.slotPayout([a.emoji, b.emoji, d.emoji]);
                rtp += p * result.multiplier;
                if (result.jackpot) jackpotChance += p;
            }
        }
    }
    assert.ok(rtp > 0.94 && rtp < 0.98, `RTP = ${(rtp * 100).toFixed(2)} %`);
    assert.ok(jackpotChance > 0 && jackpotChance < 1e-5);
});

test("machine à sous : combinaisons", () => {
    assert.strictEqual(c.slotPayout(["7️⃣", "7️⃣", "7️⃣"]).multiplier, 100);
    assert.strictEqual(c.slotPayout(["💎", "💎", "💎"]).jackpot, true);
    assert.strictEqual(c.slotPayout(["🍒", "🍋", "🍒"]).multiplier, 2);
    assert.strictEqual(c.slotPayout(["🍋", "🍒", "🍊"]).multiplier, 0.5);
    assert.strictEqual(c.slotPayout(["🍋", "🍊", "🍇"]).multiplier, 0);
});

test("roue : 24 cases et retour joueur ≈ 95,8 %", () => {
    assert.strictEqual(c.WHEEL_SEGMENTS.length, 24);
    const rtp = c.WHEEL_SEGMENTS.reduce((s, m) => s + m, 0) / c.WHEEL_SEGMENTS.length;
    assert.ok(Math.abs(rtp - 23 / 24) < 1e-9, `RTP = ${rtp}`);
    for (const m of c.WHEEL_SEGMENTS) assert.ok(c.WHEEL_STYLE[m], `style manquant pour x${m}`);
});

test("crash : P(crash ≥ x) ≈ 0,97 / x", () => {
    const n = 200_000;
    const points = Array.from({ length: n }, () => c.crashPoint());
    for (const x of [1.5, 2, 5, 10]) {
        const observed = points.filter((p) => p >= x).length / n;
        const expected = 0.97 / x;
        assert.ok(Math.abs(observed - expected) < 0.01, `x${x} : ${observed} au lieu de ${expected}`);
    }
    assert.ok(points.every((p) => p >= 1 && p <= c.CRASH_MAX));
    // Le temps et le multiplicateur sont cohérents
    assert.strictEqual(c.crashMultiplierAt(c.crashTimeFor(2) + 1), 2);
    assert.strictEqual(c.crashMultiplierAt(0), 1);
});

test("chevaux : cotes avec 5 % pour la maison et gagnant en tête à l'arrivée", () => {
    const sum = c.HORSES.reduce((s, h) => s + h.chance, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
    for (const h of c.HORSES) {
        const rtp = h.chance * h.odds;
        assert.ok(rtp > 0.9 && rtp <= 0.95, `${h.name} : ${rtp}`);
    }

    const wins = new Map();
    for (let i = 0; i < 20_000; i++) {
        const { winner, frames } = c.planRace();
        const last = frames.at(-1);
        const wi = c.HORSES.indexOf(winner);
        assert.strictEqual(last[wi], c.RACE_LENGTH);
        assert.ok(last.every((p, j) => j === wi || p < c.RACE_LENGTH));
        // Les chevaux n'avancent jamais en arrière
        for (let t = 1; t < frames.length; t++) frames[t].forEach((p, j) => assert.ok(p >= frames[t - 1][j]));
        wins.set(winner.name, (wins.get(winner.name) || 0) + 1);
    }
    for (const h of c.HORSES) {
        assert.ok(Math.abs(wins.get(h.name) / 20_000 - h.chance) < 0.02, `${h.name} gagne trop ou pas assez`);
    }
});

test("pile ou face : 50/50", () => {
    let pile = 0;
    for (let i = 0; i < 100_000; i++) if (c.flipCoin() === "pile") pile++;
    assert.ok(Math.abs(pile / 100_000 - 0.5) < 0.01);
    assert.ok(0.5 * c.COIN_PAYOUT < 1);
});
