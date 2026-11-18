const { Events } = require("discord.js");

const { ECONOMY } = require("../config");
const { zonedToUtc } = require("./tax");

/*
==================================================
ENTREPRISES
- Revenu passif par heure (base + robots), multiplié par le
  marketing et par le nombre d'employés humains
- Le revenu s'accumule dans le coffre jusqu'à une limite d'heures
- Les employés humains reversent une part de leurs /work au coffre
- Chaque mois, l'employé ayant le plus rapporté devient
  « employé du mois » et touche une prime
==================================================
*/

const BUSINESS = {
    PRICE: ECONOMY.BUSINESS_PRICE,
    BASE_INCOME: 10_000, // $ / heure
    BASE_STORAGE_HOURS: 12,
    BASE_EMPLOYEES: 3,
    BASE_BOT_SLOTS: 2,
    EMPLOYEE_BONUS: 0.05, // +5 % de revenu passif par employé humain
    WORK_SHARE: 0.35, // part du salaire /work reversée au coffre (créée, pas retirée à l'employé)
    WORK_BONUS: 0.2, // bonus de salaire pour un employé
    EMPLOYEE_OF_MONTH: { BASE: 25_000, SHARE: 0.1 }
};

const UPGRADES = {
    marketing: {
        emoji: "📣",
        name: "Marketing",
        description: "+15 % de revenu passif par niveau",
        max: 10,
        baseCost: 750_000,
        growth: 1.6,
        effect: (lvl) => `+${lvl * 15} % de revenu`
    },
    bureaux: {
        emoji: "🏢",
        name: "Bureaux",
        description: "+2 places d'employé par niveau",
        max: 10,
        baseCost: 500_000,
        growth: 1.5,
        effect: (lvl) => `${BUSINESS.BASE_EMPLOYEES + lvl * 2} employés max`
    },
    coffre: {
        emoji: "🔐",
        name: "Coffre-fort",
        description: "+6 h de stockage du revenu passif par niveau",
        max: 6,
        baseCost: 400_000,
        growth: 1.7,
        effect: (lvl) => `${BUSINESS.BASE_STORAGE_HOURS + lvl * 6} h de stockage`
    },
    automatisation: {
        emoji: "⚙️",
        name: "Automatisation",
        description: "+2 emplacements de robot par niveau",
        max: 8,
        baseCost: 1_000_000,
        growth: 1.8,
        effect: (lvl) => `${BUSINESS.BASE_BOT_SLOTS + lvl * 2} robots max`
    }
};

const BOTS = {
    basique: { emoji: "🤖", name: "Robot basique", cost: 500_000, income: 2_500 },
    avance: { emoji: "🦾", name: "Robot avancé", cost: 2_000_000, income: 9_000 },
    ia: { emoji: "🧠", name: "IA quantique", cost: 8_000_000, income: 32_000 }
};

const HOUR = 60 * 60 * 1000;

function upgradeCost(key, level) {
    const u = UPGRADES[key];
    if (!u || level >= u.max) return null;
    return Math.round((u.baseCost * u.growth ** level) / 1000) * 1000;
}

// Statistiques dérivées d'une entreprise (niveaux d'amélioration, robots, nb d'employés)
function businessStats(biz, bots = {}, employeeCount = 0) {
    const botIncome = Object.entries(bots).reduce((sum, [type, n]) => sum + (BOTS[type]?.income || 0) * n, 0);
    const botCount = Object.values(bots).reduce((a, b) => a + b, 0);
    const multiplier = (1 + biz.marketing * 0.15) * (1 + employeeCount * BUSINESS.EMPLOYEE_BONUS);
    const hourly = Math.floor((BUSINESS.BASE_INCOME + botIncome) * multiplier);
    const storageHours = BUSINESS.BASE_STORAGE_HOURS + biz.coffre * 6;
    return {
        hourly,
        multiplier,
        botIncome,
        botCount,
        storageHours,
        storageMax: hourly * storageHours,
        maxEmployees: BUSINESS.BASE_EMPLOYEES + biz.bureaux * 2,
        maxBots: BUSINESS.BASE_BOT_SLOTS + biz.automatisation * 2
    };
}

// Revenu passif en attente : ce qui était déjà accumulé + le temps écoulé, plafonné
function accruedPassive(biz, stats, now = Date.now()) {
    const elapsed = Math.max(0, now - biz.lastSettle);
    return Math.min(stats.storageMax, biz.pending + Math.floor((stats.hourly * elapsed) / HOUR));
}

// Mois au format "2026-11" (heure de Paris)
function monthKey(ms = Date.now()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" })
        .formatToParts(new Date(ms))
        .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    return `${parts.year}-${parts.month}`;
}

// Début du mois suivant (minuit, heure de Paris)
function nextMonthStart(ms = Date.now()) {
    const [year, month] = monthKey(ms).split("-").map(Number);
    return month === 12
        ? zonedToUtc(year + 1, 1, 1, 0, 0, "Europe/Paris")
        : zonedToUtc(year, month + 1, 1, 0, 0, "Europe/Paris");
}

const MONTHS = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre"
];

function monthLabel(key) {
    const [year, month] = key.split("-").map(Number);
    return `${MONTHS[month - 1]} ${year}`;
}

function employeeOfMonthPrize(contributed) {
    return BUSINESS.EMPLOYEE_OF_MONTH.BASE + Math.floor(contributed * BUSINESS.EMPLOYEE_OF_MONTH.SHARE);
}

/*
---------- Employé du mois (automatique au changement de mois) ----------
*/

const LAST_MONTH_KEY = "business.employeeOfMonth.lastMonth";

async function runEmployeeOfMonth(client, economy, month) {
    const winners = economy.awardEmployeesOfMonth(month, employeeOfMonthPrize);
    console.log(`🏆 Employé du mois (${month}) : ${winners.length} entreprise(s)`);
    for (const w of winners) {
        const text =
            `🏆 **Employé du mois — ${monthLabel(month)}**\n` +
            `<@${w.userId}> est l'employé du mois de **${w.businessName}** ` +
            `avec **${w.contributed.toLocaleString("fr-FR")} $** rapportés en ${w.works} service(s) !\n` +
            `💰 Prime : **${w.prize.toLocaleString("fr-FR")} $**`;
        for (const id of new Set([w.userId, w.ownerId])) {
            const user = await client.users.fetch(id).catch(() => null);
            await user?.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
        }
    }
    return winners;
}

function startEmployeeOfMonth(client, economy) {
    if (!economy.getSetting(LAST_MONTH_KEY)) economy.setSetting(LAST_MONTH_KEY, monthKey());

    let running = false;
    const check = async () => {
        if (running) return;
        const last = economy.getSetting(LAST_MONTH_KEY);
        const current = monthKey();
        if (last === current) return;
        running = true;
        try {
            // On marque le mois avant d'envoyer les MP : jamais de double prime
            economy.setSetting(LAST_MONTH_KEY, current);
            await runEmployeeOfMonth(client, economy, last);
        } catch (err) {
            console.error("❌ Erreur employé du mois :", err);
        } finally {
            running = false;
        }
    };

    client.once(Events.ClientReady, check);
    setInterval(check, 60 * 1000).unref();
}

module.exports = {
    BUSINESS,
    UPGRADES,
    BOTS,
    HOUR,
    upgradeCost,
    businessStats,
    accruedPassive,
    monthKey,
    monthLabel,
    nextMonthStart,
    employeeOfMonthPrize,
    runEmployeeOfMonth,
    startEmployeeOfMonth
};
