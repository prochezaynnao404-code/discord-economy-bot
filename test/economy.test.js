const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { Economy } = require("../utils/db");

function fresh() {
    return new Economy(":memory:");
}

test("takeMoney refuse si le solde est insuffisant", () => {
    const eco = fresh();
    eco.addMoney("a", 100);
    assert.strictEqual(eco.takeMoney("a", 150), false);
    assert.strictEqual(eco.getUser("a").money, 100);
    assert.strictEqual(eco.takeMoney("a", 100), true);
    assert.strictEqual(eco.getUser("a").money, 0);
});

test("transfer est atomique et ne crée pas d'argent", () => {
    const eco = fresh();
    eco.addMoney("a", 50);
    assert.strictEqual(eco.transfer("a", "b", 80), false);
    assert.strictEqual(eco.transfer("a", "b", 50), true);
    assert.strictEqual(eco.getUser("a").money, 0);
    assert.strictEqual(eco.getUser("b").money, 50);
    // Deux envois successifs du même argent : le second échoue
    assert.strictEqual(eco.transfer("a", "b", 50), false);
});

test("deposit / withdraw", () => {
    const eco = fresh();
    eco.addMoney("a", 100);
    assert.ok(eco.deposit("a", 60));
    assert.strictEqual(eco.withdraw("a", 100), false);
    assert.ok(eco.withdraw("a", 60));
    const u = eco.getUser("a");
    assert.strictEqual(u.money, 100);
    assert.strictEqual(u.bank, 0);
});

test("addXp garde le surplus et peut monter plusieurs niveaux", () => {
    const eco = fresh();
    const r = eco.addXp("a", 400); // niveau 1 -> 155, niveau 2 -> 220, reste 25
    assert.deepStrictEqual(r, { level: 3, xp: 25, previous: 1, leveledUp: true });
    assert.strictEqual(eco.getUser("a").xp, 25);
});

test("tryCooldown bloque puis libère", () => {
    const eco = fresh();
    assert.strictEqual(eco.tryCooldown("a", "lastWork", 1000, 10_000), 0);
    assert.strictEqual(eco.tryCooldown("a", "lastWork", 1000, 10_500), 500);
    assert.strictEqual(eco.tryCooldown("a", "lastWork", 1000, 11_000), 0);
    assert.throws(() => eco.tryCooldown("a", "money; DROP TABLE users", 1));
});

test("claimDaily : série, bonus et remise à zéro", () => {
    const eco = fresh();
    const opts = { reward: 100, streakMax: 3, cooldown: 1000 };
    assert.strictEqual(eco.claimDaily("a", opts, 1000).streak, 1);
    assert.strictEqual(eco.claimDaily("a", opts, 1500).ok, false);
    assert.strictEqual(eco.claimDaily("a", opts, 2000).streak, 2);
    const bonus = eco.claimDaily("a", opts, 3000);
    assert.ok(bonus.bonus);
    assert.strictEqual(bonus.gain, 200);
    // Plus de 2 cooldowns sans daily : série perdue
    assert.strictEqual(eco.claimDaily("a", opts, 10_000).streak, 1);
});

test("quêtes : progression et récompense une seule fois", () => {
    const eco = fresh();
    eco.startQuest("a", "casino", 2);
    assert.strictEqual(eco.progressQuest("a", "messages"), false);
    assert.strictEqual(eco.progressQuest("a", "casino"), false);
    assert.strictEqual(eco.progressQuest("a", "casino"), true);
    assert.strictEqual(eco.claimQuest("a", 500), true);
    assert.strictEqual(eco.claimQuest("a", 500), false);
    assert.strictEqual(eco.getUser("a").money, 500);
});

test("entreprise : achat atomique, une seule par joueur, embauche unique", () => {
    const eco = fresh();
    assert.strictEqual(eco.createBusiness("boss", "Corp", 1000), "money");
    eco.addMoney("boss", 2000);
    assert.strictEqual(eco.createBusiness("boss", "Corp", 1000), "ok");
    assert.strictEqual(eco.createBusiness("boss", "Corp2", 1000), "exists");
    assert.strictEqual(eco.getUser("boss").money, 1000);
    const biz = eco.getBusinessByOwner("boss");
    assert.strictEqual(eco.hire(biz.id, "worker"), "ok");
    assert.strictEqual(eco.hire(biz.id, "worker"), "taken");
    assert.strictEqual(eco.hire(biz.id, "boss"), "taken");
    assert.strictEqual(eco.getEmployment("worker").name, "Corp");
});

test("levelRank et top", () => {
    const eco = fresh();
    eco.addXp("a", 50);
    eco.addXp("b", 150);
    eco.addXp("c", 10);
    assert.strictEqual(eco.levelRank("b"), 1);
    assert.strictEqual(eco.levelRank("a"), 2);
    assert.deepStrictEqual(
        eco.top("level").map((u) => u.userId),
        ["b", "a", "c"]
    );
    assert.throws(() => eco.top("userId; --"));
});

test("migration : ajoute les colonnes manquantes à une ancienne base", () => {
    const Database = require("better-sqlite3");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "eco-")), "old.sqlite");
    const old = new Database(file);
    old.exec("CREATE TABLE users (userId TEXT PRIMARY KEY, money INTEGER DEFAULT 0)");
    old.prepare("INSERT INTO users VALUES ('a', 42)").run();
    old.close();

    const eco = new Economy(file);
    const u = eco.getUser("a");
    assert.strictEqual(u.money, 42);
    assert.strictEqual(u.level, 1);
    assert.strictEqual(u.activeQuest, "none");
    eco.close();
});

test("backup : crée une copie et garde les N plus récentes", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eco-bk-"));
    const eco = new Economy(path.join(dir, "db.sqlite"));
    eco.addMoney("a", 1);
    const backups = path.join(dir, "backups");
    for (let i = 0; i < 3; i++) {
        await eco.backup(backups, 2);
        await new Promise((r) => setTimeout(r, 5));
    }
    assert.strictEqual(fs.readdirSync(backups).length, 2);
    eco.close();
});
