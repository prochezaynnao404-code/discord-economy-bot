const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const { xpForLevel, levelFromTotal } = require("./levels");
const { UPGRADES, BOTS, businessStats, accruedPassive, monthKey } = require("./business");
const { DRINKS, IVRESSE, currentIvresse } = require("./bar");

// Colonnes de la table users : ajoutées automatiquement si elles manquent
const USER_COLUMNS = {
    money: "INTEGER NOT NULL DEFAULT 0",
    bank: "INTEGER NOT NULL DEFAULT 0",
    messages: "INTEGER NOT NULL DEFAULT 0",
    voiceTime: "INTEGER NOT NULL DEFAULT 0",
    xp: "INTEGER NOT NULL DEFAULT 0",
    level: "INTEGER NOT NULL DEFAULT 1",
    lastDaily: "INTEGER NOT NULL DEFAULT 0",
    dailyStreak: "INTEGER NOT NULL DEFAULT 0",
    activeQuest: "TEXT NOT NULL DEFAULT 'none'",
    questProgress: "INTEGER NOT NULL DEFAULT 0",
    questGoal: "INTEGER NOT NULL DEFAULT 0",
    questCompleted: "INTEGER NOT NULL DEFAULT 0",
    lastRob: "INTEGER NOT NULL DEFAULT 0",
    lastWork: "INTEGER NOT NULL DEFAULT 0",
    joinedAt: "INTEGER NOT NULL DEFAULT 0",
    ivresse: "INTEGER NOT NULL DEFAULT 0",
    ivresseAt: "INTEGER NOT NULL DEFAULT 0",
    drinks: "INTEGER NOT NULL DEFAULT 0",
    drinksOffered: "INTEGER NOT NULL DEFAULT 0",
    title: "TEXT"
};

// Colonnes ajoutées aux tables existantes (entreprises v2)
const BUSINESS_COLUMNS = {
    marketing: "INTEGER NOT NULL DEFAULT 0",
    bureaux: "INTEGER NOT NULL DEFAULT 0",
    coffre: "INTEGER NOT NULL DEFAULT 0",
    automatisation: "INTEGER NOT NULL DEFAULT 0",
    pending: "INTEGER NOT NULL DEFAULT 0", // revenu passif accumulé (plafonné)
    vault: "INTEGER NOT NULL DEFAULT 0", // parts reversées par les employés (non plafonné)
    lastSettle: "INTEGER NOT NULL DEFAULT 0",
    totalEarned: "INTEGER NOT NULL DEFAULT 0"
};
const EMPLOYEE_COLUMNS = {
    contributed: "INTEGER NOT NULL DEFAULT 0",
    works: "INTEGER NOT NULL DEFAULT 0"
};

function addColumns(db, table, columns) {
    const existing = new Set(
        db
            .prepare(`PRAGMA table_info(${table})`)
            .all()
            .map((c) => c.name)
    );
    for (const [name, type] of Object.entries(columns)) {
        if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
}

const COOLDOWN_COLUMNS = new Set(["lastDaily", "lastRob", "lastWork"]);
const LEADERBOARD_COLUMNS = new Set(["money", "bank", "level", "messages", "voiceTime"]);

// Ancienne courbe (100 × niveau) : sert seulement à convertir les niveaux existants
function oldTotalXp(level, xp) {
    return (100 * (level - 1) * level) / 2 + xp;
}

// Passage à la courbe progressive : l'XP totale de chacun est conservée
function migrateLevelCurve(db) {
    const done = db.prepare("SELECT value FROM settings WHERE key = 'levels.curve'").get();
    if (done?.value === "2") return;
    db.transaction(() => {
        const update = db.prepare("UPDATE users SET level = ?, xp = ? WHERE userId = ?");
        for (const u of db.prepare("SELECT userId, level, xp FROM users WHERE level > 1 OR xp > 0").all()) {
            const { level, xp } = levelFromTotal(oldTotalXp(u.level, u.xp));
            update.run(level, xp, u.userId);
        }
        db.prepare(
            "INSERT INTO settings (key, value) VALUES ('levels.curve', '2') ON CONFLICT(key) DO UPDATE SET value = '2'"
        ).run();
    })();
}

function migrate(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS users (userId TEXT PRIMARY KEY)`);

    const existing = new Set(
        db
            .prepare("PRAGMA table_info(users)")
            .all()
            .map((c) => c.name)
    );
    for (const [name, type] of Object.entries(USER_COLUMNS)) {
        if (!existing.has(name)) {
            db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
        }
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ownerId TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            createdAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS employees (
            businessId INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
            userId TEXT NOT NULL UNIQUE,
            hiredAt INTEGER NOT NULL,
            PRIMARY KEY (businessId, userId)
        );
        CREATE TABLE IF NOT EXISTS inventory (
            userId TEXT NOT NULL,
            item TEXT NOT NULL,
            amount INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (userId, item)
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS tax_payments (
            userId TEXT NOT NULL,
            amount INTEGER NOT NULL,
            wealth INTEGER NOT NULL,
            at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tax_payments_user ON tax_payments(userId, at DESC);
        CREATE TABLE IF NOT EXISTS tax_runs (
            at INTEGER NOT NULL,
            total INTEGER NOT NULL,
            payers INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS member_joins (
            guildId TEXT NOT NULL,
            userId TEXT NOT NULL,
            inviterId TEXT,
            code TEXT,
            joinedAt INTEGER NOT NULL,
            PRIMARY KEY (guildId, userId)
        );
        CREATE TABLE IF NOT EXISTS game_stats (
            userId TEXT NOT NULL,
            game TEXT NOT NULL,
            wins INTEGER NOT NULL DEFAULT 0,
            losses INTEGER NOT NULL DEFAULT 0,
            draws INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (userId, game)
        );
        CREATE TABLE IF NOT EXISTS business_bots (
            businessId INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            amount INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (businessId, type)
        );
        CREATE TABLE IF NOT EXISTS employee_month_stats (
            businessId INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
            userId TEXT NOT NULL,
            month TEXT NOT NULL,
            works INTEGER NOT NULL DEFAULT 0,
            contributed INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (businessId, userId, month)
        );
        CREATE TABLE IF NOT EXISTS employee_awards (
            month TEXT NOT NULL,
            businessId INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
            userId TEXT NOT NULL,
            works INTEGER NOT NULL,
            contributed INTEGER NOT NULL,
            prize INTEGER NOT NULL,
            PRIMARY KEY (month, businessId)
        );
        CREATE TABLE IF NOT EXISTS user_titles (
            userId TEXT NOT NULL,
            titleId TEXT NOT NULL,
            unlockedAt INTEGER NOT NULL,
            PRIMARY KEY (userId, titleId)
        );
        CREATE TABLE IF NOT EXISTS drink_effects (
            userId TEXT NOT NULL,
            effect TEXT NOT NULL,
            value REAL NOT NULL,
            expiresAt INTEGER NOT NULL,
            drink TEXT NOT NULL,
            PRIMARY KEY (userId, effect)
        );
        CREATE INDEX IF NOT EXISTS idx_users_money ON users(money DESC);
        CREATE INDEX IF NOT EXISTS idx_users_level ON users(level DESC, xp DESC);
    `);
    addColumns(db, "businesses", BUSINESS_COLUMNS);
    addColumns(db, "employees", EMPLOYEE_COLUMNS);
    // Entreprises existantes : le revenu passif démarre maintenant
    db.prepare("UPDATE businesses SET lastSettle = ? WHERE lastSettle = 0").run(Date.now());
    migrateLevelCurve(db);
}

class Economy {
    constructor(file) {
        this.file = file;
        this.db = new Database(file);
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        migrate(this.db);
    }

    // ---------- Utilisateurs ----------

    ensureUser(userId, joinedAt = 0) {
        this.db.prepare("INSERT OR IGNORE INTO users (userId, joinedAt) VALUES (?, ?)").run(userId, joinedAt);
    }

    getUser(userId) {
        this.ensureUser(userId);
        return this.db.prepare("SELECT * FROM users WHERE userId = ?").get(userId);
    }

    findUser(userId) {
        return this.db.prepare("SELECT * FROM users WHERE userId = ?").get(userId) || null;
    }

    // ---------- Argent ----------

    addMoney(userId, amount) {
        this.ensureUser(userId);
        this.db.prepare("UPDATE users SET money = money + ? WHERE userId = ?").run(amount, userId);
    }

    // Retire l'argent seulement si le solde suffit (atomique)
    takeMoney(userId, amount) {
        this.ensureUser(userId);
        const result = this.db
            .prepare("UPDATE users SET money = money - ? WHERE userId = ? AND money >= ?")
            .run(amount, userId, amount);
        return result.changes === 1;
    }

    // Retire jusqu'à `amount` (sans passer sous 0) et renvoie le montant retiré
    takeUpTo(userId, amount) {
        return this.db.transaction(() => {
            const { money } = this.getUser(userId);
            const taken = Math.max(0, Math.min(money, amount));
            this.db.prepare("UPDATE users SET money = money - ? WHERE userId = ?").run(taken, userId);
            return taken;
        })();
    }

    transfer(fromId, toId, amount) {
        return this.db.transaction(() => {
            if (!this.takeMoney(fromId, amount)) return false;
            this.addMoney(toId, amount);
            return true;
        })();
    }

    deposit(userId, amount) {
        return this.db.transaction(() => {
            if (!this.takeMoney(userId, amount)) return false;
            this.db.prepare("UPDATE users SET bank = bank + ? WHERE userId = ?").run(amount, userId);
            return true;
        })();
    }

    withdraw(userId, amount) {
        this.ensureUser(userId);
        return this.db.transaction(() => {
            const result = this.db
                .prepare("UPDATE users SET bank = bank - ? WHERE userId = ? AND bank >= ?")
                .run(amount, userId, amount);
            if (result.changes !== 1) return false;
            this.addMoney(userId, amount);
            return true;
        })();
    }

    // ---------- Expérience ----------

    // Ajoute de l'XP en gardant le surplus au passage de niveau
    addXp(userId, amount) {
        return this.db.transaction(() => {
            const user = this.getUser(userId);
            let xp = user.xp + amount;
            let level = user.level;
            while (xp >= xpForLevel(level)) {
                xp -= xpForLevel(level);
                level++;
            }
            this.db.prepare("UPDATE users SET xp = ?, level = ? WHERE userId = ?").run(xp, level, userId);
            return { level, xp, previous: user.level, leveledUp: level > user.level };
        })();
    }

    // ---------- Cooldowns ----------

    // Démarre le cooldown si possible. Renvoie 0 si OK, sinon le temps restant (ms).
    tryCooldown(userId, column, cooldown, now = Date.now()) {
        if (!COOLDOWN_COLUMNS.has(column)) throw new Error(`Colonne invalide : ${column}`);
        this.ensureUser(userId);
        const result = this.db
            .prepare(`UPDATE users SET ${column} = ? WHERE userId = ? AND ${column} <= ?`)
            .run(now, userId, now - cooldown);
        if (result.changes === 1) return 0;
        const last = this.findUser(userId)[column];
        return Math.max(1, last + cooldown - now);
    }

    // ---------- Daily ----------

    claimDaily(userId, { reward, streakMax, cooldown, multiplier = 1 }, now = Date.now()) {
        return this.db.transaction(() => {
            const user = this.getUser(userId);
            if (user.lastDaily && now - user.lastDaily < cooldown) {
                return { ok: false, remaining: user.lastDaily + cooldown - now };
            }
            // Série perdue si plus de 48 h depuis le dernier daily
            const kept = user.lastDaily && now - user.lastDaily < cooldown * 2;
            let streak = (kept ? user.dailyStreak : 0) + 1;
            let gain = Math.floor(reward * multiplier);
            const bonus = streak >= streakMax;
            if (bonus) gain *= 2;
            this.db
                .prepare("UPDATE users SET money = money + ?, lastDaily = ?, dailyStreak = ? WHERE userId = ?")
                .run(gain, now, bonus ? 0 : streak, userId);
            return { ok: true, gain, streak, bonus };
        })();
    }

    // ---------- Quêtes ----------

    // Fait progresser la quête si elle correspond. Renvoie true si elle vient d'être terminée.
    progressQuest(userId, type, amount = 1) {
        return this.db.transaction(() => {
            const user = this.findUser(userId);
            if (!user || user.activeQuest !== type || user.questCompleted) return false;
            const progress = Math.min(user.questGoal, user.questProgress + amount);
            const completed = progress >= user.questGoal ? 1 : 0;
            this.db
                .prepare("UPDATE users SET questProgress = ?, questCompleted = ? WHERE userId = ?")
                .run(progress, completed, userId);
            return completed === 1;
        })();
    }

    startQuest(userId, type, goal) {
        this.ensureUser(userId);
        this.db
            .prepare(
                "UPDATE users SET activeQuest = ?, questGoal = ?, questProgress = 0, questCompleted = 0 WHERE userId = ?"
            )
            .run(type, goal, userId);
    }

    // Récupère la récompense de façon atomique (impossible de la réclamer deux fois)
    claimQuest(userId, reward) {
        this.ensureUser(userId);
        const result = this.db
            .prepare(
                `UPDATE users SET money = money + ?, activeQuest = 'none', questProgress = 0,
                 questGoal = 0, questCompleted = 0 WHERE userId = ? AND questCompleted = 1`
            )
            .run(reward, userId);
        return result.changes === 1;
    }

    // ---------- Activité ----------

    recordMessage(userId, gain) {
        this.ensureUser(userId);
        this.db
            .prepare("UPDATE users SET money = money + ?, messages = messages + 1 WHERE userId = ?")
            .run(gain, userId);
    }

    addVoiceTime(userId, seconds) {
        if (seconds <= 0) return;
        this.ensureUser(userId);
        this.db.prepare("UPDATE users SET voiceTime = voiceTime + ? WHERE userId = ?").run(seconds, userId);
    }

    // ---------- Classements ----------

    top(column = "money", limit = 10) {
        if (!LEADERBOARD_COLUMNS.has(column)) throw new Error(`Colonne invalide : ${column}`);
        const order = column === "level" ? "level DESC, xp DESC" : `${column} DESC`;
        return this.db.prepare(`SELECT * FROM users ORDER BY ${order} LIMIT ?`).all(limit);
    }

    levelRank(userId) {
        const user = this.findUser(userId);
        if (!user) return null;
        const { above } = this.db
            .prepare("SELECT COUNT(*) AS above FROM users WHERE level > ? OR (level = ? AND xp > ?)")
            .get(user.level, user.level, user.xp);
        return above + 1;
    }

    // ---------- Entreprises ----------

    getBusinessByOwner(ownerId) {
        return this.db.prepare("SELECT * FROM businesses WHERE ownerId = ?").get(ownerId) || null;
    }

    getBusiness(id) {
        return this.db.prepare("SELECT * FROM businesses WHERE id = ?").get(id) || null;
    }

    createBusiness(ownerId, name, price, now = Date.now()) {
        return this.db.transaction(() => {
            if (this.getBusinessByOwner(ownerId)) return "exists";
            if (this.getEmployment(ownerId)) return "employed";
            if (!this.takeMoney(ownerId, price)) return "money";
            this.db
                .prepare("INSERT INTO businesses (ownerId, name, createdAt, lastSettle) VALUES (?, ?, ?, ?)")
                .run(ownerId, name, now, now);
            return "ok";
        })();
    }

    getBusinessBots(businessId) {
        const bots = {};
        const rows = this.db
            .prepare("SELECT type, amount FROM business_bots WHERE businessId = ? AND amount > 0")
            .all(businessId);
        for (const r of rows) bots[r.type] = r.amount;
        return bots;
    }

    getEmployees(businessId) {
        return this.db
            .prepare("SELECT * FROM employees WHERE businessId = ? ORDER BY contributed DESC, hiredAt ASC")
            .all(businessId);
    }

    // Vue complète : entreprise + robots + employés + stats + argent en attente
    getBusinessView(businessId, now = Date.now()) {
        const biz = this.getBusiness(businessId);
        if (!biz) return null;
        const bots = this.getBusinessBots(businessId);
        const employees = this.getEmployees(businessId);
        const stats = businessStats(biz, bots, employees.length);
        const passive = accruedPassive(biz, stats, now);
        return { biz, bots, employees, stats, passive, collectable: passive + biz.vault };
    }

    // Fige le revenu passif accumulé avant tout changement de taux (robots, employés, améliorations)
    settleBusiness(businessId, now = Date.now()) {
        const view = this.getBusinessView(businessId, now);
        if (!view) return null;
        this.db
            .prepare("UPDATE businesses SET pending = ?, lastSettle = ? WHERE id = ?")
            .run(view.passive, now, businessId);
        return view;
    }

    collectBusiness(ownerId, now = Date.now()) {
        return this.db.transaction(() => {
            const biz = this.getBusinessByOwner(ownerId);
            if (!biz) return null;
            const view = this.settleBusiness(biz.id, now);
            const amount = view.passive + view.biz.vault;
            this.db
                .prepare("UPDATE businesses SET pending = 0, vault = 0, totalEarned = totalEarned + ? WHERE id = ?")
                .run(amount, biz.id);
            if (amount > 0) this.addMoney(ownerId, amount);
            return { amount, passive: view.passive, vault: view.biz.vault };
        })();
    }

    // "ok" | "none" | "max" | "money"
    buyUpgrade(ownerId, key, cost, now = Date.now()) {
        if (!UPGRADES[key]) throw new Error(`Amélioration invalide : ${key}`);
        return this.db.transaction(() => {
            const biz = this.getBusinessByOwner(ownerId);
            if (!biz) return "none";
            if (biz[key] >= UPGRADES[key].max) return "max";
            if (!this.takeMoney(ownerId, cost)) return "money";
            this.settleBusiness(biz.id, now);
            this.db.prepare(`UPDATE businesses SET ${key} = ${key} + 1 WHERE id = ?`).run(biz.id);
            return "ok";
        })();
    }

    // "ok" | "none" | "full" | "money"
    buyBot(ownerId, type, now = Date.now()) {
        const bot = BOTS[type];
        if (!bot) throw new Error(`Robot invalide : ${type}`);
        return this.db.transaction(() => {
            const biz = this.getBusinessByOwner(ownerId);
            if (!biz) return "none";
            const view = this.getBusinessView(biz.id, now);
            if (view.stats.botCount >= view.stats.maxBots) return "full";
            if (!this.takeMoney(ownerId, bot.cost)) return "money";
            this.settleBusiness(biz.id, now);
            this.db
                .prepare(
                    `INSERT INTO business_bots (businessId, type, amount) VALUES (?, ?, 1)
                     ON CONFLICT(businessId, type) DO UPDATE SET amount = amount + 1`
                )
                .run(biz.id, type);
            return "ok";
        })();
    }

    // Revend un robot à 50 % de son prix. Renvoie le montant remboursé (0 si impossible).
    sellBot(ownerId, type, now = Date.now()) {
        const bot = BOTS[type];
        if (!bot) throw new Error(`Robot invalide : ${type}`);
        return this.db.transaction(() => {
            const biz = this.getBusinessByOwner(ownerId);
            if (!biz || !this.getBusinessBots(biz.id)[type]) return 0;
            this.settleBusiness(biz.id, now);
            this.db
                .prepare("UPDATE business_bots SET amount = amount - 1 WHERE businessId = ? AND type = ?")
                .run(biz.id, type);
            const refund = Math.floor(bot.cost / 2);
            this.addMoney(ownerId, refund);
            return refund;
        })();
    }

    getEmployment(userId) {
        return (
            this.db
                .prepare(
                    "SELECT e.*, b.name, b.ownerId FROM employees e JOIN businesses b ON b.id = e.businessId WHERE e.userId = ?"
                )
                .get(userId) || null
        );
    }

    // "ok" | "taken" (déjà employé ou patron) | "full" (plus de place)
    hire(businessId, userId, now = Date.now()) {
        return this.db.transaction(() => {
            if (this.getEmployment(userId) || this.getBusinessByOwner(userId)) return "taken";
            const view = this.getBusinessView(businessId, now);
            if (!view) return "taken";
            if (view.employees.length >= view.stats.maxEmployees) return "full";
            this.settleBusiness(businessId, now);
            this.db
                .prepare("INSERT INTO employees (businessId, userId, hiredAt) VALUES (?, ?, ?)")
                .run(businessId, userId, now);
            return "ok";
        })();
    }

    // Licenciement (businessId donné) ou démission (businessId = null)
    removeEmployee(userId, businessId = null, now = Date.now()) {
        return this.db.transaction(() => {
            const job = this.getEmployment(userId);
            if (!job || (businessId !== null && job.businessId !== businessId)) return false;
            this.settleBusiness(job.businessId, now);
            this.db.prepare("DELETE FROM employees WHERE userId = ?").run(userId);
            return true;
        })();
    }

    // Un employé a fait /work : une part (créée, pas retirée à l'employé) va au coffre de l'entreprise
    recordEmployeeWork(userId, share, now = Date.now()) {
        return this.db.transaction(() => {
            const job = this.getEmployment(userId);
            if (!job) return null;
            this.db.prepare("UPDATE businesses SET vault = vault + ? WHERE id = ?").run(share, job.businessId);
            this.db
                .prepare("UPDATE employees SET contributed = contributed + ?, works = works + 1 WHERE userId = ?")
                .run(share, userId);
            this.db
                .prepare(
                    `INSERT INTO employee_month_stats (businessId, userId, month, works, contributed) VALUES (?, ?, ?, 1, ?)
                     ON CONFLICT(businessId, userId, month) DO UPDATE SET works = works + 1,
                     contributed = contributed + excluded.contributed`
                )
                .run(job.businessId, userId, monthKey(now), share);
            return job;
        })();
    }

    // Classement du mois (seulement les employés encore en poste)
    monthRanking(businessId, month) {
        return this.db
            .prepare(
                `SELECT s.* FROM employee_month_stats s
                 JOIN employees e ON e.userId = s.userId AND e.businessId = s.businessId
                 WHERE s.businessId = ? AND s.month = ? AND s.contributed > 0
                 ORDER BY s.contributed DESC, s.works DESC`
            )
            .all(businessId, month);
    }

    recentAwards(businessId, limit = 5) {
        return this.db
            .prepare("SELECT * FROM employee_awards WHERE businessId = ? ORDER BY month DESC LIMIT ?")
            .all(businessId, limit);
    }

    // Désigne l'employé du mois de chaque entreprise et verse sa prime (une seule fois par mois et par entreprise)
    awardEmployeesOfMonth(month, prizeOf) {
        return this.db.transaction(() => {
            const winners = [];
            const insert = this.db.prepare(
                `INSERT OR IGNORE INTO employee_awards (month, businessId, userId, works, contributed, prize)
                 VALUES (?, ?, ?, ?, ?, ?)`
            );
            for (const biz of this.db.prepare("SELECT id, name, ownerId FROM businesses").all()) {
                const [top] = this.monthRanking(biz.id, month);
                if (!top) continue;
                const prize = prizeOf(top.contributed);
                if (insert.run(month, biz.id, top.userId, top.works, top.contributed, prize).changes !== 1) continue;
                this.addMoney(top.userId, prize);
                winners.push({
                    businessId: biz.id,
                    businessName: biz.name,
                    ownerId: biz.ownerId,
                    userId: top.userId,
                    works: top.works,
                    contributed: top.contributed,
                    prize
                });
            }
            return winners;
        })();
    }

    countEmployeeAwards(userId) {
        return this.db.prepare("SELECT COUNT(*) AS n FROM employee_awards WHERE userId = ?").get(userId).n;
    }

    topBusinesses(limit = 10) {
        return this.db
            .prepare(
                `SELECT b.*, (SELECT COUNT(*) FROM employees e WHERE e.businessId = b.id) AS employeeCount
                 FROM businesses b ORDER BY totalEarned DESC LIMIT ?`
            )
            .all(limit);
    }

    // ---------- Bar ----------

    getIvresse(userId, now = Date.now()) {
        const user = this.findUser(userId);
        return user ? currentIvresse(user.ivresse, user.ivresseAt, now) : 0;
    }

    getDrinkEffects(userId, now = Date.now()) {
        return this.db
            .prepare("SELECT * FROM drink_effects WHERE userId = ? AND expiresAt > ? ORDER BY effect")
            .all(userId, now);
    }

    // Applique les bonus de boisson actifs à un montant (type : "gains" ou "xp")
    drinkBoost(userId, type, amount, now = Date.now()) {
        const row = this.db
            .prepare("SELECT value FROM drink_effects WHERE userId = ? AND effect = ? AND expiresAt > ?")
            .get(userId, type, now);
        return row ? Math.floor((amount * (100 + Math.round(row.value * 100))) / 100) : amount;
    }

    // buyerId paie, targetId boit (identiques si on commande pour soi)
    // status : "ok" | "money" | "drunk"
    buyDrink(buyerId, targetId, key, now = Date.now()) {
        const drink = DRINKS[key];
        if (!drink) throw new Error(`Boisson invalide : ${key}`);
        return this.db.transaction(() => {
            const target = this.getUser(targetId);
            const before = currentIvresse(target.ivresse, target.ivresseAt, now);
            if (drink.ivresse > 0 && before >= IVRESSE.MAX) return { status: "drunk", ivresse: before };
            if (!this.takeMoney(buyerId, drink.price)) return { status: "money" };

            const find = this.db.prepare(
                "SELECT * FROM drink_effects WHERE userId = ? AND effect = ? AND expiresAt > ?"
            );
            const save = this.db.prepare(
                `INSERT INTO drink_effects (userId, effect, value, expiresAt, drink) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(userId, effect) DO UPDATE SET value = excluded.value,
                 expiresAt = excluded.expiresAt, drink = excluded.drink`
            );
            const effects = [];
            for (const [effect, value] of Object.entries(drink.effects)) {
                const active = find.get(targetId, effect, now);
                const expiresAt = now + drink.duration;
                if (active && active.value > value) {
                    // Un effet plus fort est déjà actif : on le garde
                    effects.push({ effect, value: active.value, expiresAt: active.expiresAt, kept: active.drink });
                    continue;
                }
                const finalExpiry =
                    active && active.value === value ? Math.max(active.expiresAt, expiresAt) : expiresAt;
                save.run(targetId, effect, value, finalExpiry, key);
                effects.push({ effect, value, expiresAt: finalExpiry, kept: null });
            }

            const ivresse = Math.max(0, before + drink.ivresse);
            this.db
                .prepare("UPDATE users SET ivresse = ?, ivresseAt = ?, drinks = drinks + 1 WHERE userId = ?")
                .run(ivresse, now, targetId);
            if (buyerId !== targetId) {
                this.db.prepare("UPDATE users SET drinksOffered = drinksOffered + 1 WHERE userId = ?").run(buyerId);
            }
            return { status: "ok", effects, ivresse, before };
        })();
    }

    topDrinkers(limit = 10) {
        return this.db
            .prepare("SELECT userId, drinks, drinksOffered FROM users WHERE drinks > 0 ORDER BY drinks DESC LIMIT ?")
            .all(limit);
    }

    // ---------- Titres ----------

    getUnlockedTitles(userId) {
        return this.db
            .prepare("SELECT titleId, unlockedAt FROM user_titles WHERE userId = ? ORDER BY unlockedAt")
            .all(userId);
    }

    hasTitle(userId, titleId) {
        return !!this.db.prepare("SELECT 1 FROM user_titles WHERE userId = ? AND titleId = ?").get(userId, titleId);
    }

    // Renvoie les identifiants réellement nouveaux
    unlockTitles(userId, titleIds, now = Date.now()) {
        if (!titleIds.length) return [];
        return this.db.transaction(() => {
            const insert = this.db.prepare(
                "INSERT OR IGNORE INTO user_titles (userId, titleId, unlockedAt) VALUES (?, ?, ?)"
            );
            return titleIds.filter((id) => insert.run(userId, id, now).changes === 1);
        })();
    }

    // "ok" | "owned" | "money"
    buyTitle(userId, titleId, price, now = Date.now()) {
        return this.db.transaction(() => {
            if (this.hasTitle(userId, titleId)) return "owned";
            if (!this.takeMoney(userId, price)) return "money";
            this.unlockTitles(userId, [titleId], now);
            return "ok";
        })();
    }

    // titleId null = retirer le titre. Refuse un titre non débloqué.
    equipTitle(userId, titleId) {
        if (titleId !== null && !this.hasTitle(userId, titleId)) return false;
        this.ensureUser(userId);
        this.db.prepare("UPDATE users SET title = ? WHERE userId = ?").run(titleId, userId);
        return true;
    }

    // ---------- Inventaire ----------

    getInventory(userId) {
        return this.db
            .prepare("SELECT item, amount FROM inventory WHERE userId = ? AND amount > 0 ORDER BY item")
            .all(userId);
    }

    // ---------- Mini-jeux ----------

    recordGame(userId, game, outcome) {
        const column = { win: "wins", loss: "losses", draw: "draws" }[outcome];
        if (!column) throw new Error(`Résultat invalide : ${outcome}`);
        this.db
            .prepare(
                `INSERT INTO game_stats (userId, game, ${column}) VALUES (?, ?, 1)
                 ON CONFLICT(userId, game) DO UPDATE SET ${column} = ${column} + 1`
            )
            .run(userId, game);
    }

    getGameStats(userId) {
        return this.db.prepare("SELECT * FROM game_stats WHERE userId = ? ORDER BY game").all(userId);
    }

    topGamePlayers(game, limit = 10) {
        return this.db
            .prepare("SELECT * FROM game_stats WHERE game = ? AND wins > 0 ORDER BY wins DESC, losses ASC LIMIT ?")
            .all(game, limit);
    }

    // ---------- Invitations ----------

    recordJoin(guildId, userId, inviterId, code, joinedAt) {
        this.db
            .prepare(
                `INSERT INTO member_joins (guildId, userId, inviterId, code, joinedAt) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(guildId, userId) DO UPDATE SET inviterId = excluded.inviterId,
                 code = excluded.code, joinedAt = excluded.joinedAt`
            )
            .run(guildId, userId, inviterId, code, joinedAt);
    }

    getJoin(guildId, userId) {
        return (
            this.db
                .prepare("SELECT inviterId, code, joinedAt FROM member_joins WHERE guildId = ? AND userId = ?")
                .get(guildId, userId) || null
        );
    }

    // ---------- Réglages ----------

    getSetting(key) {
        return this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? null;
    }

    setSetting(key, value) {
        this.db
            .prepare(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
            )
            .run(key, value);
    }

    // ---------- Impôt sur la fortune ----------

    // taxOf(patrimoine) -> montant. Prélève la poche d'abord, puis la banque. L'argent est détruit.
    collectWealthTax(taxOf, now = Date.now()) {
        return this.db.transaction(() => {
            const users = this.db.prepare("SELECT userId, money, bank FROM users WHERE money + bank > 0").all();
            const takeMoney = this.db.prepare("UPDATE users SET money = money - ?, bank = bank - ? WHERE userId = ?");
            const log = this.db.prepare("INSERT INTO tax_payments (userId, amount, wealth, at) VALUES (?, ?, ?, ?)");
            const payers = [];
            let total = 0;

            for (const u of users) {
                const wealth = u.money + u.bank;
                const amount = Math.min(wealth, taxOf(wealth));
                if (amount <= 0) continue;
                const fromPocket = Math.min(u.money, amount);
                takeMoney.run(fromPocket, amount - fromPocket, u.userId);
                log.run(u.userId, amount, wealth, now);
                payers.push({ userId: u.userId, amount, wealth });
                total += amount;
            }

            this.db.prepare("INSERT INTO tax_runs (at, total, payers) VALUES (?, ?, ?)").run(now, total, payers.length);
            return { total, payers };
        })();
    }

    getTaxSummary(userId) {
        const last = this.db
            .prepare("SELECT amount, wealth, at FROM tax_payments WHERE userId = ? ORDER BY at DESC LIMIT 1")
            .get(userId);
        const { total, count } = this.db
            .prepare("SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM tax_payments WHERE userId = ?")
            .get(userId);
        return { last: last || null, total, count };
    }

    recentTaxRuns(limit = 5) {
        return this.db.prepare("SELECT * FROM tax_runs ORDER BY at DESC LIMIT ?").all(limit);
    }

    totalTaxDestroyed() {
        return this.db.prepare("SELECT COALESCE(SUM(total), 0) AS total FROM tax_runs").get().total;
    }

    // ---------- Sauvegardes ----------

    async backup(dir, keep) {
        fs.mkdirSync(dir, { recursive: true });
        const date = new Date().toISOString().replace(/[:.]/g, "-");
        const file = path.join(dir, `database-${date}.sqlite`);
        // API de backup SQLite : copie cohérente même pendant les écritures
        await this.db.backup(file);

        const old = fs
            .readdirSync(dir)
            .filter((f) => /^database-.*\.sqlite$/.test(f))
            .sort()
            .reverse()
            .slice(keep);
        for (const f of old) fs.unlinkSync(path.join(dir, f));
        return file;
    }

    close() {
        this.db.close();
    }
}

module.exports = { Economy, xpForLevel };
