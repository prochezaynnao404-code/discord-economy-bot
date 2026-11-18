const { Events } = require("discord.js");

/*
==================================================
IMPÔT SUR LA FORTUNE
- Patrimoine = poche + banque
- Barème progressif par tranches (chaque taux ne s'applique
  qu'à la partie du patrimoine comprise dans sa tranche)
- Prélevé chaque semaine, l'argent est détruit (anti-inflation)
==================================================
*/

// Tranches : à partir de `from`, taux `rate` (jusqu'à la tranche suivante)
const BRACKETS = [
    { from: 0, rate: 0 },
    { from: 1_000_000, rate: 0.01 },
    { from: 5_000_000, rate: 0.02 },
    { from: 20_000_000, rate: 0.03 },
    { from: 100_000_000, rate: 0.05 }
];

const SCHEDULE = { weekday: 0, hour: 21, minute: 0, timeZone: "Europe/Paris" }; // dimanche 21 h

function computeWealthTax(wealth, brackets = BRACKETS) {
    let total = 0;
    const details = [];
    for (let i = 0; i < brackets.length; i++) {
        const { from, rate } = brackets[i];
        const to = brackets[i + 1]?.from ?? Infinity;
        if (wealth <= from) break;
        const base = Math.min(wealth, to) - from;
        const amount = Math.floor(base * rate);
        details.push({ from, to, rate, base, amount });
        total += amount;
    }
    return { total, details };
}

// Seuil en dessous duquel on ne paie rien
const exemptionThreshold = (brackets = BRACKETS) => brackets.find((b) => b.rate > 0)?.from ?? Infinity;

/*
---------- Calcul de l'heure du prélèvement (fuseau de Paris) ----------
*/

function zonedParts(ms, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        weekday: "short"
    }).formatToParts(new Date(ms));
    const get = (type) => parts.find((p) => p.type === type).value;
    return {
        year: Number(get("year")),
        month: Number(get("month")),
        day: Number(get("day")),
        hour: Number(get("hour")),
        minute: Number(get("minute")),
        second: Number(get("second")),
        weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"))
    };
}

// Décalage du fuseau (ms) à un instant donné
function offsetAt(ms, timeZone) {
    const p = zonedParts(ms, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// Heure locale (fuseau) -> timestamp UTC, en gérant l'heure d'été
function zonedToUtc(year, month, day, hour, minute, timeZone) {
    const guess = Date.UTC(year, month - 1, day, hour, minute);
    const first = guess - offsetAt(guess, timeZone);
    return guess - offsetAt(first, timeZone);
}

// Dernière échéance passée (ou égale à maintenant)
function lastDueTime(now = Date.now(), schedule = SCHEDULE) {
    const today = zonedParts(now, schedule.timeZone);
    for (let back = 0; back <= 7; back++) {
        const d = new Date(Date.UTC(today.year, today.month - 1, today.day - back));
        if (d.getUTCDay() !== schedule.weekday) continue;
        const due = zonedToUtc(
            d.getUTCFullYear(),
            d.getUTCMonth() + 1,
            d.getUTCDate(),
            schedule.hour,
            schedule.minute,
            schedule.timeZone
        );
        if (due <= now) return due; // au pire, celle d'il y a 7 jours
    }
    throw new Error("Échéance introuvable");
}

function nextDueTime(now = Date.now(), schedule = SCHEDULE) {
    const last = lastDueTime(now, schedule);
    // +7 jours en heure locale (gère le changement d'heure)
    const p = zonedParts(last, schedule.timeZone);
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + 7));
    return zonedToUtc(
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate(),
        schedule.hour,
        schedule.minute,
        schedule.timeZone
    );
}

/*
---------- Prélèvement automatique ----------
*/

const LAST_RUN_KEY = "wealthTax.lastRun";

async function runWealthTax(client, economy, now = Date.now()) {
    const result = economy.collectWealthTax((wealth) => computeWealthTax(wealth).total, now);
    economy.setSetting(LAST_RUN_KEY, String(now));
    console.log(`💸 Impôt sur la fortune : ${result.total} $ détruits, ${result.payers.length} contribuable(s)`);

    // Avis d'imposition en MP
    for (const payer of result.payers) {
        const user = await client.users.fetch(payer.userId).catch(() => null);
        await user
            ?.send(
                `🧾 **Impôt sur la fortune**\n` +
                    `Patrimoine imposé : **${payer.wealth.toLocaleString("fr-FR")} $**\n` +
                    `Montant prélevé : **${payer.amount.toLocaleString("fr-FR")} $** (poche d'abord, puis banque)\n` +
                    `Détail avec \`/impots voir\`.`
            )
            .catch(() => {});
    }
    return result;
}

function startWealthTax(client, economy) {
    // Première installation : on ne taxe pas rétroactivement
    if (!economy.getSetting(LAST_RUN_KEY)) economy.setSetting(LAST_RUN_KEY, String(Date.now()));

    let running = false;
    const check = async () => {
        if (running) return;
        const lastRun = Number(economy.getSetting(LAST_RUN_KEY) || 0);
        if (lastRun >= lastDueTime()) return;
        running = true;
        try {
            await runWealthTax(client, economy);
        } catch (err) {
            console.error("❌ Erreur impôt sur la fortune :", err);
        } finally {
            running = false;
        }
    };

    // Rattrapage au démarrage puis vérification chaque minute
    client.once(Events.ClientReady, check);
    setInterval(check, 60 * 1000).unref();
}

module.exports = {
    BRACKETS,
    SCHEDULE,
    computeWealthTax,
    exemptionThreshold,
    lastDueTime,
    zonedToUtc,
    nextDueTime,
    runWealthTax,
    startWealthTax
};
