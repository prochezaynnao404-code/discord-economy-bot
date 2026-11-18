/*
==================================================
CASINO : logique et probabilités des jeux
Chaque jeu a un "retour joueur" (RTP) légèrement inférieur à 100 %,
comme un vrai casino : sur la durée, la maison gagne un peu.
==================================================
*/

const { EPHEMERAL } = require("./helpers");

// ---------- Mise commune ----------

// Retire la mise (atomique). Renvoie false et répond au joueur si impossible.
async function placeBet(interaction, bet) {
    if (interaction.client.economy.takeMoney(interaction.user.id, bet)) return true;
    await interaction.reply({ content: "❌ Pas assez d'argent en poche.", flags: EPHEMERAL });
    return false;
}

// Paie le joueur et fait avancer la quête casino
function settle(economy, userId, payout) {
    if (payout > 0) economy.addMoney(userId, payout);
    economy.progressQuest(userId, "casino");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function weightedPick(items, weightOf = (i) => i.weight, random = Math.random) {
    const total = items.reduce((s, i) => s + weightOf(i), 0);
    let roll = random() * total;
    for (const item of items) {
        roll -= weightOf(item);
        if (roll < 0) return item;
    }
    return items.at(-1);
}

/*
==================================================
MACHINE À SOUS : 3 rouleaux indépendants
==================================================
*/

const SLOT_SYMBOLS = [
    { emoji: "🍒", weight: 20 },
    { emoji: "🍋", weight: 16 },
    { emoji: "🍊", weight: 12 },
    { emoji: "🍇", weight: 8 },
    { emoji: "🔔", weight: 5 },
    { emoji: "7️⃣", weight: 2 },
    { emoji: "💎", weight: 1 }
];

// Multiplicateurs (mise comprise) pour 3 symboles identiques
const SLOT_TRIPLES = { "🍒": 4, "🍋": 6, "🍊": 10, "🍇": 20, "🔔": 40, "7️⃣": 100 };
const SLOT_JACKPOT_SHARE = 0.02; // 2 % de chaque mise alimente le jackpot
const SLOT_JACKPOT_SEED = 50_000;

// Résultat d'un tirage : { multiplier, jackpot, label }
function slotPayout(reels) {
    const [a, b, c] = reels;
    if (a === b && b === c) {
        if (a === "💎") return { multiplier: 0, jackpot: true, label: "💎 JACKPOT 💎" };
        return { multiplier: SLOT_TRIPLES[a], jackpot: false, label: `Triple ${a}` };
    }
    const cherries = reels.filter((r) => r === "🍒").length;
    if (cherries === 2) return { multiplier: 2, jackpot: false, label: "Deux cerises" };
    if (cherries === 1) return { multiplier: 0.5, jackpot: false, label: "Une cerise (la moitié remboursée)" };
    return { multiplier: 0, jackpot: false, label: "Perdu" };
}

function spinReel(random = Math.random) {
    return weightedPick(SLOT_SYMBOLS, (s) => s.weight, random).emoji;
}

/*
==================================================
CRASH : le multiplicateur grimpe jusqu'au crash
P(crash ≥ x) = 0,97 / x  → 3 % d'avantage maison
==================================================
*/

const CRASH_EDGE = 0.97;
const CRASH_MAX = 100;
const CRASH_SPEED = 0.12; // m(t) = e^(0,12 t) : x2 en ~5,8 s, x10 en ~19 s

function crashPoint(random = Math.random) {
    const u = random();
    const raw = CRASH_EDGE / (1 - u);
    if (raw < 1) return 1; // crash immédiat
    return Math.min(CRASH_MAX, Math.floor(raw * 100) / 100);
}

const crashMultiplierAt = (ms) => Math.floor(Math.exp((CRASH_SPEED * ms) / 1000) * 100) / 100;
const crashTimeFor = (multiplier) => (Math.log(multiplier) / CRASH_SPEED) * 1000;

/*
==================================================
PILE OU FACE contre le bot : gain x1,95 (2,5 % maison)
==================================================
*/

const COIN_PAYOUT = 1.95;
const flipCoin = (random = Math.random) => (random() < 0.5 ? "pile" : "face");

/*
==================================================
ROUE DE LA FORTUNE : 24 cases (RTP ≈ 95,8 %)
==================================================
*/

const WHEEL_SEGMENTS = (() => {
    const counts = [
        [0, 11],
        [0.5, 4],
        [1, 3],
        [1.5, 2],
        [2, 2],
        [3, 1],
        [8, 1]
    ];
    // Répartition alternée pour que la roue ait l'air mélangée
    const pool = counts.flatMap(([m, n]) => Array(n).fill(m));
    const zeros = pool.filter((m) => m === 0);
    const others = pool.filter((m) => m !== 0).sort((a, b) => ((a * 7) % 5) - ((b * 7) % 5));
    const wheel = [];
    while (zeros.length || others.length) {
        if (others.length) wheel.push(others.shift());
        if (zeros.length) wheel.push(zeros.shift());
    }
    return wheel;
})();

const WHEEL_STYLE = {
    0: "⬛",
    0.5: "🟫",
    1: "⬜",
    1.5: "🟦",
    2: "🟩",
    3: "🟨",
    8: "🟥"
};

const spinWheel = (random = Math.random) => Math.floor(random() * WHEEL_SEGMENTS.length);

/*
==================================================
COURSE DE CHEVAUX : 5 chevaux, cotes selon la chance de gagner
==================================================
*/

const HORSES = [
    { name: "Éclair", emoji: "🐎", chance: 0.35 },
    { name: "Tonnerre", emoji: "🐴", chance: 0.25 },
    { name: "Comète", emoji: "🦄", chance: 0.18 },
    { name: "Tornade", emoji: "🦓", chance: 0.13 },
    { name: "Petit Poney", emoji: "🫏", chance: 0.09 }
].map((h) => ({ ...h, odds: Math.floor((0.95 / h.chance) * 10) / 10 })); // 5 % maison

const RACE_LENGTH = 20;
const RACE_TICKS = 8;

// Prépare une course : le gagnant est tiré selon les chances, puis on génère
// une progression crédible où il franchit la ligne en premier.
function planRace(random = Math.random) {
    const winner = weightedPick(HORSES, (h) => h.chance, random);
    const frames = Array.from({ length: RACE_TICKS }, () => []);

    HORSES.forEach((horse, index) => {
        const finalPos = horse === winner ? RACE_LENGTH : 10 + Math.floor(random() * (RACE_LENGTH - 10));
        // Progression croissante et irrégulière jusqu'à finalPos
        const steps = Array.from({ length: RACE_TICKS }, () => 0.5 + random());
        const total = steps.reduce((s, x) => s + x, 0);
        let acc = 0;
        for (let t = 0; t < RACE_TICKS; t++) {
            acc += steps[t];
            frames[t][index] =
                t === RACE_TICKS - 1 ? finalPos : Math.min(finalPos, Math.floor((acc / total) * finalPos));
        }
    });

    // Le gagnant ne doit jamais être doublé sur la dernière image
    return { winner, frames };
}

module.exports = {
    placeBet,
    settle,
    sleep,
    weightedPick,
    SLOT_SYMBOLS,
    SLOT_TRIPLES,
    SLOT_JACKPOT_SHARE,
    SLOT_JACKPOT_SEED,
    slotPayout,
    spinReel,
    CRASH_EDGE,
    CRASH_MAX,
    crashPoint,
    crashMultiplierAt,
    crashTimeFor,
    COIN_PAYOUT,
    flipCoin,
    WHEEL_SEGMENTS,
    WHEEL_STYLE,
    spinWheel,
    HORSES,
    RACE_LENGTH,
    RACE_TICKS,
    planRace
};
