/*
==================================================
DESSIN
- Grille de 16 × 16 pixels, palette de 16 couleurs
- Un curseur se déplace avec des boutons ; crayon levé ou baissé
- Outils : peindre, remplir, gomme, taille du pinceau, annuler
- Une œuvre est stockée en texte : un caractère hexadécimal par pixel
==================================================
*/

const SIZE = 16;
const HISTORY_MAX = 30;

// index 0 = blanc (fond)
const PALETTE = [
    { name: "Blanc", hex: "#ffffff", emoji: "⬜" },
    { name: "Noir", hex: "#1b1b1f", emoji: "⬛" },
    { name: "Gris", hex: "#8a8f98", emoji: "🔘" },
    { name: "Gris clair", hex: "#d4d7dd", emoji: "⚪" },
    { name: "Rouge", hex: "#e53935", emoji: "🟥" },
    { name: "Orange", hex: "#fb8c00", emoji: "🟧" },
    { name: "Jaune", hex: "#fdd835", emoji: "🟨" },
    { name: "Vert", hex: "#2e9e44", emoji: "🟩" },
    { name: "Vert clair", hex: "#9ccc65", emoji: "🍏" },
    { name: "Cyan", hex: "#26c6da", emoji: "💠" },
    { name: "Bleu", hex: "#1e88e5", emoji: "🟦" },
    { name: "Bleu nuit", hex: "#283593", emoji: "🔵" },
    { name: "Violet", hex: "#8e24aa", emoji: "🟪" },
    { name: "Rose", hex: "#f48fb1", emoji: "🌸" },
    { name: "Marron", hex: "#6d4c41", emoji: "🟫" },
    { name: "Beige", hex: "#ffcc80", emoji: "🍪" }
];

const DRAWING = {
    SIZE,
    MAX_PER_USER: 12,
    NAME_MAX: 32
};

const blankPixels = () => "0".repeat(SIZE * SIZE);

function isValidPixels(pixels) {
    return typeof pixels === "string" && pixels.length === SIZE * SIZE && /^[0-9a-f]+$/.test(pixels);
}

function createCanvasState(pixels = blankPixels()) {
    return {
        pixels: Array.from(pixels, (c) => parseInt(c, 16)),
        cursor: { x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2) },
        color: 1,
        penDown: false,
        step: 1,
        brush: 1,
        history: []
    };
}

const serialize = (state) => state.pixels.map((p) => p.toString(16)).join("");
const isBlank = (state) => state.pixels.every((p) => p === 0);
const clamp = (v) => Math.max(0, Math.min(SIZE - 1, v));

function snapshot(state) {
    state.history.push(serialize(state));
    if (state.history.length > HISTORY_MAX) state.history.shift();
}

// Peint le pinceau (1 ou 3 pixels de côté) autour du curseur
function stamp(state, color = state.color) {
    const r = state.brush === 3 ? 1 : 0;
    const { x, y } = state.cursor;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (px >= 0 && py >= 0 && px < SIZE && py < SIZE) state.pixels[py * SIZE + px] = color;
        }
    }
}

function paint(state) {
    snapshot(state);
    stamp(state);
}

// Déplacement ; crayon baissé : on peint chaque case traversée
function move(state, dx, dy) {
    if (state.penDown) snapshot(state);
    for (let i = 0; i < state.step; i++) {
        const x = clamp(state.cursor.x + dx);
        const y = clamp(state.cursor.y + dy);
        if (x === state.cursor.x && y === state.cursor.y) break;
        state.cursor = { x, y };
        if (state.penDown) stamp(state);
    }
}

// Pot de peinture (remplissage de la zone de même couleur)
function fill(state) {
    const { x, y } = state.cursor;
    const target = state.pixels[y * SIZE + x];
    if (target === state.color) return false;
    snapshot(state);
    const stack = [[x, y]];
    while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
        const i = cy * SIZE + cx;
        if (state.pixels[i] !== target) continue;
        state.pixels[i] = state.color;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return true;
}

function clear(state) {
    if (isBlank(state)) return false;
    snapshot(state);
    state.pixels.fill(0);
    return true;
}

function undo(state) {
    const last = state.history.pop();
    if (!last) return false;
    state.pixels = Array.from(last, (c) => parseInt(c, 16));
    return true;
}

// Applique une action d'éditeur ; renvoie false si rien n'a changé
const MOVES = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

function applyAction(state, action, value) {
    if (MOVES[action]) {
        const before = `${state.cursor.x},${state.cursor.y}`;
        move(state, ...MOVES[action]);
        return before !== `${state.cursor.x},${state.cursor.y}`;
    }
    switch (action) {
        case "paint":
            paint(state);
            return true;
        case "pen":
            state.penDown = !state.penDown;
            if (state.penDown) paint(state);
            return true;
        case "fill":
            return fill(state);
        case "step":
            state.step = state.step === 1 ? 3 : 1;
            return true;
        case "brush":
            state.brush = state.brush === 1 ? 3 : 1;
            return true;
        case "eraser":
            state.color = 0;
            return true;
        case "color": {
            const c = Number(value);
            if (!Number.isInteger(c) || c < 0 || c >= PALETTE.length) return false;
            state.color = c;
            return true;
        }
        case "undo":
            return undo(state);
        case "clear":
            return clear(state);
        default:
            return false;
    }
}

// ---------- Mots du jeu « Dessine et devine » ----------

const WORDS = {
    "🐾 Animaux": [
        "chat",
        "chien",
        "poisson",
        "oiseau",
        "serpent",
        "escargot",
        "papillon",
        "araignée",
        "lapin",
        "tortue",
        "baleine",
        "girafe",
        "souris",
        "cochon",
        "canard",
        "abeille",
        "pieuvre",
        "requin"
    ],
    "🍎 Nourriture": [
        "pomme",
        "banane",
        "pizza",
        "gâteau",
        "glace",
        "carotte",
        "fraise",
        "cerise",
        "burger",
        "oeuf",
        "fromage",
        "pastèque",
        "croissant",
        "bonbon",
        "champignon",
        "café"
    ],
    "🏠 Objets": [
        "maison",
        "voiture",
        "parapluie",
        "lunettes",
        "clé",
        "ampoule",
        "téléphone",
        "horloge",
        "ballon",
        "épée",
        "couronne",
        "bougie",
        "livre",
        "chaise",
        "guitare",
        "cadeau",
        "fusée",
        "bateau",
        "avion",
        "vélo",
        "marteau",
        "ciseaux",
        "chapeau",
        "train"
    ],
    "🌳 Nature": [
        "soleil",
        "lune",
        "étoile",
        "nuage",
        "arbre",
        "fleur",
        "montagne",
        "volcan",
        "arc-en-ciel",
        "éclair",
        "flocon",
        "vague",
        "cactus",
        "feuille",
        "île"
    ],
    "🎉 Divers": [
        "fantôme",
        "robot",
        "coeur",
        "pirate",
        "dragon",
        "château",
        "bonhomme de neige",
        "sapin",
        "citrouille",
        "diamant",
        "drapeau",
        "smiley",
        "alien",
        "momie"
    ]
};

const WORD_LIST = Object.entries(WORDS).flatMap(([category, words]) => words.map((word) => ({ word, category })));

// « Gâteau » == « gateau » ; « bonhomme de neige » == « bonhommedeneige »
function normalize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/œ/g, "oe")
        .replace(/[^a-z0-9]/g, "");
}

function levenshtein(a, b) {
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = dp[j];
            dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return dp[b.length];
}

// Morceaux du message à comparer : le message entier, et chaque groupe de mots
// de la longueur du mot cherché (« c'est une fleur » contient « fleur »)
function guessCandidates(guess, wordCount) {
    const tokens = guess.split(/[\s'’,.!?;:()"«»-]+/).filter(Boolean);
    const out = new Set([normalize(guess)]);
    for (let i = 0; i + wordCount <= tokens.length; i++) out.add(normalize(tokens.slice(i, i + wordCount).join("")));
    out.delete("");
    return [...out];
}

// "exact" | "close" | "wrong"
function checkGuess(guess, word) {
    const w = normalize(word);
    const candidates = guessCandidates(guess, word.split(/[\s-]+/).length);
    if (candidates.some((g) => g === w || g === `${w}s` || g === `${w}x`)) return "exact";
    if (w.length >= 4 && candidates.some((g) => levenshtein(g, w) <= 1)) return "close";
    return "wrong";
}

// « _ _ _ _ _ » ; revealed : indices des lettres dévoilées
function wordHint(word, revealed = new Set()) {
    return Array.from(word)
        .map((ch, i) => {
            if (ch === " ") return "   ";
            if (ch === "-") return "-";
            return revealed.has(i) ? ch.toUpperCase() : "_";
        })
        .join(" ");
}

function letterIndexes(word) {
    return Array.from(word)
        .map((ch, i) => (/[\p{L}]/u.test(ch) ? i : -1))
        .filter((i) => i >= 0);
}

// ---------- Jeu à deux ----------

const DUEL = {
    ROUNDS: 4, // chacun dessine 2 fois
    ROUND_TIME: 90 * 1000,
    HINT_AT: 0.5, // dévoile une lettre à mi-temps
    BASE_POINTS: 50,
    POINTS_PER_SECOND: 1, // bonus : secondes restantes
    MONEY_PER_POINT: 40,
    REWARD_COOLDOWN: 60 * 60 * 1000, // récompense en argent : 1 fois par heure
    INVITE_TIME: 60 * 1000
};

function roundPoints(remainingMs) {
    return DUEL.BASE_POINTS + Math.floor((Math.max(0, remainingMs) / 1000) * DUEL.POINTS_PER_SECOND);
}

module.exports = {
    SIZE,
    PALETTE,
    DRAWING,
    DUEL,
    WORDS,
    WORD_LIST,
    blankPixels,
    isValidPixels,
    createCanvasState,
    serialize,
    isBlank,
    applyAction,
    fill,
    normalize,
    checkGuess,
    wordHint,
    letterIndexes,
    roundPoints
};
