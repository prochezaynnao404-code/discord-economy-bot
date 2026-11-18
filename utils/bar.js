/*
==================================================
BAR
- Les boissons donnent un bonus temporaire (gains ou XP)
- Un effet plus fort remplace le plus faible ; le même effet
  rafraîchit la durée ; un effet plus faible est ignoré
- L'alcool rend ivre : /work peut rater, et au-delà d'un seuil
  le barman refuse de servir. L'ivresse redescend avec le temps.
- L'argent dépensé au bar est détruit (anti-inflation)
==================================================
*/

const MIN = 60 * 1000;

const DRINKS = {
    cafe: {
        emoji: "☕",
        name: "Café",
        price: 500,
        effects: { xp: 0.1 },
        duration: 30 * MIN,
        ivresse: -2,
        line: "Un petit noir bien serré. Ça réveille."
    },
    soda: {
        emoji: "🥤",
        name: "Soda",
        price: 1_000,
        effects: { gains: 0.05 },
        duration: 30 * MIN,
        ivresse: 0,
        line: "Sucré, pétillant, sans risque."
    },
    biere: {
        emoji: "🍺",
        name: "Bière",
        price: 2_500,
        effects: { gains: 0.1 },
        duration: 60 * MIN,
        ivresse: 1,
        line: "Une pression bien fraîche."
    },
    vin: {
        emoji: "🍷",
        name: "Vin rouge",
        price: 6_000,
        effects: { xp: 0.15 },
        duration: 60 * MIN,
        ivresse: 1,
        line: "Un verre de grand cru, pour l'inspiration."
    },
    cocktail: {
        emoji: "🍸",
        name: "Cocktail",
        price: 15_000,
        effects: { gains: 0.2 },
        duration: 60 * MIN,
        ivresse: 2,
        line: "La spécialité de la maison."
    },
    whisky: {
        emoji: "🥃",
        name: "Whisky",
        price: 40_000,
        effects: { gains: 0.3 },
        duration: 120 * MIN,
        ivresse: 2,
        line: "Vieilli 18 ans en fût de chêne."
    },
    champagne: {
        emoji: "🍾",
        name: "Champagne",
        price: 150_000,
        effects: { gains: 0.25, xp: 0.25 },
        duration: 180 * MIN,
        ivresse: 2,
        line: "Pour fêter ça comme il se doit."
    }
};

const EFFECT_LABELS = { gains: "💰 Gains", xp: "✨ XP" };

const IVRESSE = {
    DECAY: 30 * MIN, // -1 point toutes les 30 minutes
    MAX: 6, // au-delà, plus d'alcool servi
    STATES: [
        { from: 0, label: "Sobre", emoji: "🙂", workFail: 0 },
        { from: 2, label: "Pompette", emoji: "😊", workFail: 0.15 },
        { from: 4, label: "Ivre", emoji: "🥴", workFail: 0.35 },
        { from: 6, label: "Complètement saoul", emoji: "🤢", workFail: 0.6 }
    ]
};

// Ivresse actuelle à partir de la valeur stockée et de l'heure à laquelle elle a été stockée
function currentIvresse(value, at, now = Date.now()) {
    if (value <= 0) return 0;
    return Math.max(0, value - Math.floor(Math.max(0, now - at) / IVRESSE.DECAY));
}

function ivresseState(level) {
    return [...IVRESSE.STATES].reverse().find((s) => level >= s.from);
}

// Heure à laquelle on redevient sobre
function soberAt(value, at) {
    return value > 0 ? at + value * IVRESSE.DECAY : at;
}

const percent = (value) => `+${Math.round(value * 100)} %`;

module.exports = { DRINKS, EFFECT_LABELS, IVRESSE, currentIvresse, ivresseState, soberAt, percent };
