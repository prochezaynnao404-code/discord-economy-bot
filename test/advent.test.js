const test = require("node:test");
const assert = require("node:assert");

const { Economy } = require("../utils/db");
const { ADVENT, doorContent, doorReward, calendarState } = require("../utils/advent");
const { syncTitles } = require("../utils/titles");

const NO_GOLD = { roll: 0.99 };

test("état du calendrier selon la date (heure de Paris)", () => {
    assert.strictEqual(calendarState(Date.UTC(2026, 10, 19, 12)).phase, "avant");
    // 30 novembre 23 h 30 UTC = 1er décembre 0 h 30 à Paris
    assert.deepStrictEqual(calendarState(Date.UTC(2026, 10, 30, 23, 30)), { phase: "ouvert", year: 2026, day: 1 });
    assert.deepStrictEqual(calendarState(Date.UTC(2026, 11, 24, 12)), { phase: "ouvert", year: 2026, day: 24 });
    assert.strictEqual(calendarState(Date.UTC(2026, 11, 25, 12)).phase, "termine");
    const before = calendarState(Date.UTC(2026, 10, 19, 12));
    assert.strictEqual(calendarState(before.startsAt).day, 1);
    assert.strictEqual(calendarState(before.startsAt - 1).phase, "avant");
});

test("contenu des cases : formule et cases spéciales", () => {
    assert.strictEqual(doorContent(1).money, 4500);
    assert.strictEqual(doorContent(24).money, 100_000);
    assert.ok(doorContent(6).special);
    assert.throws(() => doorContent(0));
    assert.throws(() => doorContent(25));
});

test("ticket d'or et bonus de niveau", () => {
    const base = doorReward(3, { multiplier: 1.5, ...NO_GOLD });
    assert.strictEqual(base.money, Math.floor(doorContent(3).money * 1.5));
    const gold = doorReward(3, { multiplier: 1, roll: 0 });
    assert.ok(gold.golden);
    assert.strictEqual(gold.money, doorContent(3).money * ADVENT.GOLDEN_MULTIPLIER);
});

test("une case ne s'ouvre qu'une fois et paie le joueur", () => {
    const eco = new Economy(":memory:");
    const r = eco.openAdventDoor("a", 2026, 5, NO_GOLD);
    assert.ok(r.ok);
    assert.strictEqual(eco.getUser("a").money, doorContent(5).money);
    assert.strictEqual(eco.openAdventDoor("a", 2026, 5, NO_GOLD).ok, false);
    assert.strictEqual(eco.getUser("a").money, doorContent(5).money);
    // Autre année : nouvelle case
    assert.ok(eco.openAdventDoor("a", 2027, 5, NO_GOLD).ok);
    assert.strictEqual(eco.getAdventDoors("a", 2026).length, 1);
});

test("hotte complète et titres à 24/24", () => {
    const eco = new Economy(":memory:");
    let last;
    for (let day = 1; day <= 24; day++) last = eco.openAdventDoor("a", 2026, day, NO_GOLD);
    assert.ok(last.full);
    assert.strictEqual(last.money, doorContent(24).money + ADVENT.FULL_BONUS);
    assert.strictEqual(eco.adventBest("a"), 24);
    const ids = syncTitles(eco, "a").map((t) => t.id);
    assert.ok(ids.includes("lutin") && ids.includes("perenoel"));
    assert.strictEqual(eco.topAdvent(2026)[0].doors, 24);
});

test("pas de hotte complète s'il manque une case", () => {
    const eco = new Economy(":memory:");
    for (let day = 2; day <= 23; day++) eco.openAdventDoor("a", 2026, day, NO_GOLD);
    assert.strictEqual(eco.openAdventDoor("a", 2026, 24, NO_GOLD).full, false);
});
