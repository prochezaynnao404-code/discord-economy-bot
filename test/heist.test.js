const test = require("node:test");
const assert = require("node:assert");

const { Economy } = require("../utils/db");
const { HEIST, ROLES, TARGETS, makeMission, missionSuccess, resolveHeist, roundCount } = require("../utils/heist");
const { syncTitles } = require("../utils/titles");

// Générateur pseudo-aléatoire qui renvoie les valeurs données, en boucle
const seq = (...values) => {
    let i = 0;
    return () => values[i++ % values.length];
};

test("chaque rôle a une mission jouable : la bonne réponse est toujours un bouton", () => {
    for (const role of Object.keys(ROLES)) {
        for (let d = 1; d <= 4; d++) {
            for (let k = 0; k < 30; k++) {
                const rounds = makeMission(role, d);
                assert.strictEqual(rounds.length, roundCount(d));
                for (const r of rounds) {
                    const ids = r.buttons.map((b) => b.id);
                    assert.strictEqual(new Set(ids).size, ids.length, `${role} : boutons en double`);
                    assert.ok(ids.includes(r.answer), `${role} : réponse absente`);
                    assert.ok(r.buttons.length <= 25 && r.buttons.length >= 2);
                    assert.ok(Math.ceil(r.buttons.length / (r.perRow || 5)) <= 4, "trop de lignes");
                }
            }
        }
    }
});

test("une erreur est tolérée par mission", () => {
    assert.ok(missionSuccess(4, 4));
    assert.ok(missionSuccess(3, 4));
    assert.ok(!missionSuccess(2, 4));
});

test("braquage parfait : pas d'alerte, butin complet partagé, personne arrêté", () => {
    const members = [
        { userId: "a", role: "hacker" },
        { userId: "b", role: "artificier" },
        { userId: "c", role: "guetteur" },
        { userId: "d", role: "grosbras" },
        { userId: "e", role: "chauffeur" }
    ];
    const all = Object.fromEntries(members.map((m) => [m.role, true]));
    // rng : 0,5 pour le butin, puis 0,99 pour chaque arrestation (> risque)
    const r = resolveHeist(TARGETS.casino, members, all, seq(0.5, 0.99, 0.99, 0.99, 0.99, 0.99));
    assert.strictEqual(r.alerts, 0);
    assert.strictEqual(r.arrestChance, HEIST.ARREST_BASE / 2);
    assert.strictEqual(r.loot, 1_500_000);
    assert.ok(r.outcomes.every((o) => !o.caught && o.gain === 300_000));
});

test("3 alertes : pas de butin, gros risque ; rôles libres tirés au hasard", () => {
    const members = [
        { userId: "a", role: "hacker" },
        { userId: "b", role: "artificier" }
    ];
    // rôles libres (guetteur, grosbras, chauffeur) : 0,9 > 40 % -> ratés
    const r = resolveHeist(
        TARGETS.superette,
        members,
        { hacker: false, artificier: true },
        seq(0.9, 0.9, 0.9, 0.5, 0.1, 0.99)
    );
    assert.strictEqual(r.roles.guetteur.auto, true);
    assert.strictEqual(r.alerts, 3);
    assert.strictEqual(r.loot, 0);
    assert.strictEqual(r.arrestChance, 0.8); // 0,05 + 3 × 0,2 + 0,15 (pas de chauffeur)
    assert.deepStrictEqual(
        r.outcomes.map((o) => o.caught),
        [true, false]
    );
});

test("le coffre mal ouvert réduit le butin et les arrêtés perdent leur part", () => {
    const members = [
        { userId: "a", role: "artificier" },
        { userId: "b", role: "chauffeur" },
        { userId: "c", role: "hacker" }
    ];
    const results = { artificier: false, chauffeur: true, hacker: true };
    // guetteur et grosbras libres : 0,1 -> réussis ; butin 0 -> minimum ; a arrêté, b et c libres
    const r = resolveHeist(TARGETS.bijouterie, members, results, seq(0.1, 0.1, 0, 0, 0.99, 0.99));
    assert.strictEqual(r.alerts, 0);
    assert.strictEqual(r.loot, Math.floor(150_000 * HEIST.VAULT_FAIL_LOOT));
    assert.strictEqual(r.outcomes[0].gain, 0);
    assert.strictEqual(r.outcomes[1].gain, 30_000);
});

test("base : départ tout ou rien, prison, caution détruite, titres", () => {
    const eco = new Economy(":memory:");
    const limits = { fee: 2000, cooldown: HEIST.COOLDOWN };
    const T = 10 * HEIST.COOLDOWN; // horloge fictive
    eco.addMoney("a", 5000);
    eco.addMoney("b", 1000);

    const fail = eco.startHeist(["a", "b"], limits, T);
    assert.strictEqual(fail.ok, false);
    assert.deepStrictEqual(
        fail.problems.map((p) => [p.userId, p.reason]),
        [["b", "money"]]
    );
    assert.strictEqual(eco.getUser("a").money, 5000); // personne n'a payé

    eco.addMoney("b", 5000);
    assert.ok(eco.startHeist(["a", "b"], limits, T).ok);
    assert.strictEqual(eco.getUser("a").money, 3000);
    assert.strictEqual(eco.heistBlocker("a", limits, T + 1000).reason, "cooldown");
    assert.strictEqual(eco.heistBlocker("a", limits, T + HEIST.COOLDOWN), null);

    eco.finishHeist(
        [
            { userId: "a", caught: false, gain: 40_000 },
            { userId: "b", caught: true, gain: 0 }
        ],
        TARGETS.superette,
        T
    );
    const a = eco.getUser("a");
    assert.strictEqual(a.money, 43_000);
    assert.strictEqual(a.heistsWon, 1);
    assert.strictEqual(eco.getJail("a", T), null);

    const jail = eco.getJail("b", T);
    assert.strictEqual(jail.until, T + TARGETS.superette.jail);
    assert.strictEqual(eco.heistBlocker("b", limits, T + 1000).reason, "jail");
    assert.strictEqual(eco.payBail("b", T + 1000).status, "money");
    eco.addMoney("b", 20_000);
    assert.strictEqual(eco.payBail("b", T + 1000).status, "ok");
    assert.strictEqual(eco.getUser("b").money, 4000 + 20_000 - TARGETS.superette.bail);
    assert.strictEqual(eco.getJail("b", T + 1000), null);
    assert.strictEqual(eco.payBail("b", T + 1000).status, "free");

    // La prison se termine aussi toute seule
    eco.finishHeist([{ userId: "b", caught: true, gain: 0 }], TARGETS.superette, T);
    assert.ok(eco.getJail("b", T + 1000));
    assert.strictEqual(eco.getJail("b", T + TARGETS.superette.jail), null);

    assert.ok(syncTitles(eco, "a").some((t) => t.id === "complice"));
    assert.deepStrictEqual(
        eco.topHeisters().map((r) => r.userId),
        ["a", "b"]
    );
});
