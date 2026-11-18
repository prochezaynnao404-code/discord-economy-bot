const test = require("node:test");
const assert = require("node:assert");

const { Economy } = require("../utils/db");
const { BUSINESS, BOTS, HOUR, upgradeCost, monthKey, employeeOfMonthPrize } = require("../utils/business");

function setup(now = 1_000_000) {
    const eco = new Economy(":memory:");
    eco.addMoney("boss", 100_000_000);
    assert.strictEqual(eco.createBusiness("boss", "Corp", 1000, now), "ok");
    return { eco, biz: eco.getBusinessByOwner("boss") };
}

test("revenu passif : s'accumule puis se plafonne au coffre", () => {
    const t0 = 1_000_000;
    const { eco, biz } = setup(t0);
    let view = eco.getBusinessView(biz.id, t0 + 2 * HOUR);
    assert.strictEqual(view.passive, 2 * BUSINESS.BASE_INCOME);
    view = eco.getBusinessView(biz.id, t0 + 1000 * HOUR);
    assert.strictEqual(view.passive, BUSINESS.BASE_STORAGE_HOURS * BUSINESS.BASE_INCOME);
});

test("encaisser verse le passif + les parts employés, puis remet à zéro", () => {
    const t0 = 1_000_000;
    const { eco, biz } = setup(t0);
    const before = eco.getUser("boss").money;
    eco.hire(biz.id, "w", t0);
    eco.recordEmployeeWork("w", 500, t0);
    const now = t0 + HOUR;
    const expectedPassive = Math.floor(BUSINESS.BASE_INCOME * (1 + BUSINESS.EMPLOYEE_BONUS));
    const r = eco.collectBusiness("boss", now);
    assert.deepStrictEqual(r, { amount: expectedPassive + 500, passive: expectedPassive, vault: 500 });
    assert.strictEqual(eco.getUser("boss").money, before + r.amount);
    assert.strictEqual(eco.collectBusiness("boss", now).amount, 0);
    assert.strictEqual(eco.getBusiness(biz.id).totalEarned, r.amount);
});

test("acheter un robot ne change pas rétroactivement le revenu déjà accumulé", () => {
    const t0 = 1_000_000;
    const { eco, biz } = setup(t0);
    assert.strictEqual(eco.buyBot("boss", "ia", t0 + HOUR), "ok");
    const view = eco.getBusinessView(biz.id, t0 + 2 * HOUR);
    // 1re heure au taux de base, 2e heure avec l'IA
    assert.strictEqual(view.passive, BUSINESS.BASE_INCOME + BUSINESS.BASE_INCOME + BOTS.ia.income);
});

test("robots : emplacements limités, revente à 50 %", () => {
    const { eco } = setup();
    assert.strictEqual(eco.buyBot("boss", "basique"), "ok");
    assert.strictEqual(eco.buyBot("boss", "basique"), "ok");
    assert.strictEqual(eco.buyBot("boss", "basique"), "full");
    const money = eco.getUser("boss").money;
    assert.strictEqual(eco.sellBot("boss", "basique"), BOTS.basique.cost / 2);
    assert.strictEqual(eco.getUser("boss").money, money + BOTS.basique.cost / 2);
    assert.strictEqual(eco.sellBot("boss", "avance"), 0);
    assert.throws(() => eco.buyBot("boss", "x; DROP TABLE users"));
});

test("améliorations : coût croissant, niveau max, colonnes protégées", () => {
    const { eco, biz } = setup();
    assert.ok(upgradeCost("marketing", 1) > upgradeCost("marketing", 0));
    assert.strictEqual(upgradeCost("coffre", 6), null);
    assert.strictEqual(eco.buyUpgrade("boss", "automatisation", upgradeCost("automatisation", 0)), "ok");
    assert.strictEqual(eco.getBusiness(biz.id).automatisation, 1);
    assert.strictEqual(eco.getBusinessView(biz.id).stats.maxBots, BUSINESS.BASE_BOT_SLOTS + 2);
    assert.throws(() => eco.buyUpgrade("boss", "money", 1));
    eco.takeMoney("boss", eco.getUser("boss").money);
    assert.strictEqual(eco.buyUpgrade("boss", "marketing", 1), "money");
});

test("embauche limitée par les bureaux, licenciement et démission", () => {
    const { eco, biz } = setup();
    for (let i = 0; i < BUSINESS.BASE_EMPLOYEES; i++) assert.strictEqual(eco.hire(biz.id, `w${i}`), "ok");
    assert.strictEqual(eco.hire(biz.id, "extra"), "full");
    assert.strictEqual(eco.removeEmployee("w0", 999), false); // pas ton employé
    assert.ok(eco.removeEmployee("w0", biz.id));
    assert.ok(eco.removeEmployee("w1")); // démission
    assert.strictEqual(eco.getEmployees(biz.id).length, 1);
    // Un employé ne peut pas fonder d'entreprise
    eco.addMoney("w2", 5000);
    assert.strictEqual(eco.createBusiness("w2", "X", 1000), "employed");
});

test("employé du mois : meilleur contributeur, prime versée une seule fois", () => {
    const now = Date.UTC(2026, 10, 15);
    const month = monthKey(now);
    const { eco, biz } = setup(now);
    eco.hire(biz.id, "a", now);
    eco.hire(biz.id, "b", now);
    eco.recordEmployeeWork("a", 1000, now);
    eco.recordEmployeeWork("b", 3000, now);
    eco.recordEmployeeWork("a", 1500, now);

    assert.deepStrictEqual(
        eco.monthRanking(biz.id, month).map((r) => [r.userId, r.contributed, r.works]),
        [
            ["b", 3000, 1],
            ["a", 2500, 2]
        ]
    );

    const winners = eco.awardEmployeesOfMonth(month, employeeOfMonthPrize);
    assert.strictEqual(winners.length, 1);
    assert.strictEqual(winners[0].userId, "b");
    assert.strictEqual(eco.getUser("b").money, employeeOfMonthPrize(3000));
    assert.strictEqual(eco.awardEmployeesOfMonth(month, employeeOfMonthPrize).length, 0);
    assert.strictEqual(eco.recentAwards(biz.id)[0].userId, "b");
});

test("monthKey suit l'heure de Paris", () => {
    // 31 octobre 23 h 30 UTC = 1er novembre 00 h 30 à Paris
    assert.strictEqual(monthKey(Date.UTC(2026, 9, 31, 23, 30)), "2026-11");
    assert.strictEqual(monthKey(Date.UTC(2026, 9, 31, 22, 30)), "2026-10");
});
