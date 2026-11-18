const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const lv = require("../utils/levels");
const { Economy } = require("../utils/db");

test("courbe progressive : 5n² + 50n + 100", () => {
    assert.strictEqual(lv.xpForLevel(1), 155);
    assert.strictEqual(lv.xpForLevel(10), 1100);
    assert.strictEqual(lv.totalXpForLevel(1), 0);
    assert.strictEqual(lv.totalXpForLevel(3), 155 + 220);
});

test("levelFromTotal est l'inverse de totalXpForLevel", () => {
    for (const level of [1, 2, 7, 30, 80]) {
        assert.deepStrictEqual(lv.levelFromTotal(lv.totalXpForLevel(level)), { level, xp: 0 });
        assert.deepStrictEqual(lv.levelFromTotal(lv.totalXpForLevel(level) + 10), { level, xp: 10 });
    }
});

test("bonus de gains : +1 % par niveau, plafonné à +50 %", () => {
    assert.strictEqual(lv.levelBonus(1), 0);
    assert.strictEqual(lv.applyBonus(1000, 1), 1000);
    assert.strictEqual(lv.applyBonus(1000, 11), 1100);
    assert.strictEqual(lv.formatBonus(11), "+10 %");
    assert.strictEqual(lv.levelBonus(51), 0.5);
    assert.strictEqual(lv.levelBonus(200), 0.5);
});

test("daily avec multiplicateur de niveau", () => {
    const eco = new Economy(":memory:");
    const r = eco.claimDaily("a", { reward: 5000, streakMax: 10, cooldown: 1000, multiplier: 1.1 }, 10_000);
    assert.strictEqual(r.gain, 5500);
    assert.strictEqual(eco.getUser("a").money, 5500);
});

test("migration de courbe : l'XP totale de chacun est conservée, une seule fois", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lvl-")), "old.sqlite");
    let eco = new Economy(file);
    // Simule une base de l'ancienne courbe (100 × niveau)
    eco.db.prepare("DELETE FROM settings WHERE key = 'levels.curve'").run();
    eco.ensureUser("a");
    eco.ensureUser("b");
    eco.db.prepare("UPDATE users SET level = 5, xp = 30 WHERE userId = 'a'").run(); // 1000 + 30 = 1030 XP
    eco.db.prepare("UPDATE users SET level = 1, xp = 99 WHERE userId = 'b'").run();
    eco.close();

    eco = new Economy(file);
    const a = eco.getUser("a");
    assert.strictEqual(lv.totalXpForLevel(a.level) + a.xp, 1030);
    assert.deepStrictEqual([a.level, a.xp], [4, 1030 - (155 + 220 + 295)]);
    assert.deepStrictEqual([eco.getUser("b").level, eco.getUser("b").xp], [1, 99]);
    eco.close();

    // Rouvrir ne reconvertit pas
    eco = new Economy(file);
    assert.deepStrictEqual([eco.getUser("a").level, eco.getUser("a").xp], [4, 360]);
    eco.close();
});
