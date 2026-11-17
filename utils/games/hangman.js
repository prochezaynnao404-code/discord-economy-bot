/*
==================================================
PENDU
==================================================
*/

const WORDS = [
    "abricot",
    "aventure",
    "avion",
    "baleine",
    "banane",
    "bateau",
    "bibliotheque",
    "bicyclette",
    "bouteille",
    "boulangerie",
    "cactus",
    "camion",
    "canard",
    "carnaval",
    "cerise",
    "chameau",
    "champignon",
    "chateau",
    "chaussure",
    "chocolat",
    "citrouille",
    "clavier",
    "coquillage",
    "crocodile",
    "cuisine",
    "dauphin",
    "desert",
    "dinosaure",
    "dragon",
    "echelle",
    "ecureuil",
    "elephant",
    "enveloppe",
    "escalier",
    "etoile",
    "fantome",
    "fenetre",
    "feuille",
    "flamant",
    "fontaine",
    "fourchette",
    "fromage",
    "galaxie",
    "girafe",
    "glacier",
    "grenouille",
    "guitare",
    "hamster",
    "harmonica",
    "helicoptere",
    "herisson",
    "hibou",
    "horloge",
    "igloo",
    "jardin",
    "jongleur",
    "kangourou",
    "kiwi",
    "labyrinthe",
    "lampadaire",
    "lapin",
    "licorne",
    "limonade",
    "lunettes",
    "magicien",
    "mandarine",
    "manege",
    "marmotte",
    "medaille",
    "montagne",
    "moustique",
    "musique",
    "nuage",
    "ordinateur",
    "orchestre",
    "ouragan",
    "pamplemousse",
    "panthere",
    "papillon",
    "parapluie",
    "pastèque",
    "perroquet",
    "phare",
    "pingouin",
    "pirate",
    "planete",
    "plongeur",
    "pompier",
    "printemps",
    "pyramide",
    "queue",
    "raquette",
    "renard",
    "requin",
    "robot",
    "sablier",
    "sandwich",
    "sauterelle",
    "serpent",
    "sorciere",
    "squelette",
    "telescope",
    "tempete",
    "tortue",
    "toboggan",
    "tournesol",
    "tracteur",
    "trampoline",
    "tresor",
    "trompette",
    "tulipe",
    "univers",
    "vampire",
    "vélo",
    "violon",
    "volcan",
    "wagon",
    "xylophone",
    "yaourt",
    "zebre",
    "zoologie",
    "discord",
    "javascript",
    "economie",
    "banquier",
    "casino"
];

const MAX_ERRORS = 7;

const STAGES = [
    "\n\n\n\n\n=========",
    "\n      |\n      |\n      |\n      |\n=========",
    "  +---+\n      |\n      |\n      |\n      |\n=========",
    "  +---+\n  |   |\n  O   |\n      |\n      |\n=========",
    "  +---+\n  |   |\n  O   |\n  |   |\n      |\n=========",
    "  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n=========",
    "  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n=========",
    "  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n========="
];

const normalize = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase(); // \p{M} = accents

class HangmanGame {
    constructor(word = WORDS[Math.floor(Math.random() * WORDS.length)]) {
        this.word = normalize(word);
        this.guessed = new Set();
        this.errors = 0;
    }

    get masked() {
        return [...this.word].map((l) => (this.guessed.has(l) ? l : "_")).join(" ");
    }

    get wrongLetters() {
        return [...this.guessed].filter((l) => !this.word.includes(l)).sort();
    }

    get won() {
        return [...this.word].every((l) => this.guessed.has(l));
    }

    get lost() {
        return this.errors >= MAX_ERRORS;
    }

    // Renvoie "already" | "good" | "bad"
    guessLetter(letter) {
        const l = normalize(letter);
        if (this.guessed.has(l)) return "already";
        this.guessed.add(l);
        if (this.word.includes(l)) return "good";
        this.errors++;
        return "bad";
    }

    // Proposer le mot entier : une erreur coûte 1 vie
    guessWord(text) {
        if (normalize(text.trim()) === this.word) {
            for (const l of this.word) this.guessed.add(l);
            return true;
        }
        this.errors++;
        return false;
    }

    drawing() {
        return STAGES[Math.min(this.errors, STAGES.length - 1)];
    }
}

module.exports = { HangmanGame, MAX_ERRORS, normalize, WORDS };
