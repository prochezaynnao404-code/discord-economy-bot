const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const { xpForLevel, levelFromTotal } = require("./levels");

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
    joinedAt: "INTEGER NOT NULL DEFAULT 0"
};

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
        CREATE INDEX IF NOT EXISTS idx_users_money ON users(money DESC);
        CREATE INDEX IF NOT EXISTS idx_users_level ON users(level DESC, xp DESC);
    `);
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

    createBusiness(ownerId, name, price, now = Date.now()) {
        return this.db.transaction(() => {
            if (this.getBusinessByOwner(ownerId)) return "exists";
            if (!this.takeMoney(ownerId, price)) return "money";
            this.db
                .prepare("INSERT INTO businesses (ownerId, name, createdAt) VALUES (?, ?, ?)")
                .run(ownerId, name, now);
            return "ok";
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

    hire(businessId, userId, now = Date.now()) {
        const result = this.db
            .prepare("INSERT OR IGNORE INTO employees (businessId, userId, hiredAt) VALUES (?, ?, ?)")
            .run(businessId, userId, now);
        return result.changes === 1;
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
