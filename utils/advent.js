/*
==================================================
CALENDRIER DE L'AVENT
- Du 1er au 24 décembre (heure de Paris), une case par jour
- Seule la case du jour peut être ouverte : une case ratée
  est perdue
- Les gains suivent le bonus de niveau, comme le daily, et
  chaque case a une petite chance de cacher un ticket d'or
- Ouvrir les 24 cases d'une même année donne la hotte
  complète en plus de la case du 24
==================================================
*/

const ADVENT = {
    DAYS: 24,
    GOLDEN_CHANCE: 0.08, // ticket d'or : gains ×3
    GOLDEN_MULTIPLIER: 3,
    FULL_BONUS: 250_000 // hotte complète (24/24), versée à l'ouverture de la dernière case
};

// Cases spéciales ; les autres suivent la formule de normalDoor()
const SPECIAL_DOORS = {
    6: { emoji: "🎅", label: "Saint-Nicolas", money: 25_000, xp: 500 },
    12: { emoji: "⛄", label: "Mi-parcours", money: 30_000, xp: 600 },
    18: { emoji: "🦌", label: "Traîneau de Rudolph", money: 40_000, xp: 800 },
    24: { emoji: "🌟", label: "Réveillon", money: 100_000, xp: 2000 }
};

const NORMAL_GIFTS = [
    { emoji: "🍫", label: "Chocolat" },
    { emoji: "🍪", label: "Biscuit de Noël" },
    { emoji: "🍬", label: "Sucre d'orge" },
    { emoji: "🧦", label: "Chaussette garnie" },
    { emoji: "🎀", label: "Petit paquet" },
    { emoji: "🔔", label: "Clochette" }
];

function normalDoor(day) {
    const gift = NORMAL_GIFTS[(day - 1) % NORMAL_GIFTS.length];
    return { ...gift, money: 4000 + day * 500, xp: 100 + day * 10 };
}

// Contenu de base d'une case (avant bonus)
function doorContent(day) {
    if (!Number.isInteger(day) || day < 1 || day > ADVENT.DAYS) throw new Error(`Case invalide : ${day}`);
    return { day, special: !!SPECIAL_DOORS[day], ...(SPECIAL_DOORS[day] || normalDoor(day)) };
}

// Date du jour à Paris : { year, month, day }
function parisDate(ms = Date.now()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    })
        .formatToParts(new Date(ms))
        .reduce((acc, p) => ({ ...acc, [p.type]: Number(p.value) }), {});
    return { year: parts.year, month: parts.month, day: parts.day };
}

// État du calendrier :
// - "avant"   : pas encore décembre (ou avant le 1er) → startsAt = 1er décembre minuit (Paris)
// - "ouvert"  : du 1er au 24 décembre → day = case du jour
// - "termine" : du 25 au 31 décembre
function calendarState(ms = Date.now()) {
    const { year, month, day } = parisDate(ms);
    if (month === 12 && day <= ADVENT.DAYS) return { phase: "ouvert", year, day };
    if (month === 12) return { phase: "termine", year };
    return { phase: "avant", year, startsAt: decemberStart(year) };
}

// 1er décembre minuit à Paris (heure d'hiver, UTC+1), en ms
function decemberStart(year) {
    return Date.UTC(year, 11, 1) - 3600 * 1000;
}

// Récompense finale d'une case pour un joueur
// multiplier : bonus de niveau (1 + levelBonus) ; roll : tirage aléatoire dans [0, 1[
function doorReward(day, { multiplier = 1, roll = Math.random(), opened = 0 } = {}) {
    const door = doorContent(day);
    const golden = roll < ADVENT.GOLDEN_CHANCE;
    const factor = multiplier * (golden ? ADVENT.GOLDEN_MULTIPLIER : 1);
    // opened : cases déjà ouvertes cette année, sans compter celle-ci
    const full = day === ADVENT.DAYS && opened === ADVENT.DAYS - 1;
    return {
        door,
        golden,
        money: Math.floor(door.money * factor) + (full ? ADVENT.FULL_BONUS : 0),
        xp: Math.floor(door.xp * (golden ? ADVENT.GOLDEN_MULTIPLIER : 1)),
        full
    };
}

module.exports = { ADVENT, SPECIAL_DOORS, doorContent, doorReward, calendarState, parisDate, decemberStart };
