/*
==================================================
BRAQUAGE EN ÉQUIPE
- 2 à 5 joueurs, chacun choisit un rôle
- Chaque rôle a sa propre mission (message privé à boutons)
- Les missions ratées déclenchent des alertes, qui augmentent
  le risque d'arrestation ; le chauffeur aide à s'enfuir
- Un joueur arrêté perd sa part et va en prison
  (plus de /work, /rob ni /braquage) sauf s'il paie la caution
==================================================
*/

const { pick, shuffle, money } = require("./helpers");

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const HEIST = {
    COOLDOWN: 8 * HOUR,
    LOBBY_TIME: 3 * MIN,
    MISSION_TIME: 90 * 1000,
    UNASSIGNED_CHANCE: 0.4, // rôle sans joueur : réussite au hasard
    MISTAKES_ALLOWED: 1, // erreurs tolérées par mission
    VAULT_FAIL_LOOT: 0.4, // coffre mal ouvert : part du butin récupérée
    ARREST_BASE: 0.05,
    ARREST_PER_ALERT: 0.2,
    ARREST_NO_DRIVER: 0.15,
    ARREST_MAX: 0.9
};

const ROLES = {
    hacker: {
        name: "Hacker",
        emoji: "💻",
        job: "Désactive l'alarme",
        task: "Mémorise le code affiché, puis retrouve le symbole demandé",
        fail: "l'alarme se déclenche (+1 alerte)"
    },
    artificier: {
        name: "Artificier",
        emoji: "💣",
        job: "Ouvre le coffre",
        task: "Coupe le câble de la couleur de l'indice",
        fail: `le coffre s'ouvre mal (butin ×${HEIST.VAULT_FAIL_LOOT.toLocaleString("fr-FR")})`
    },
    guetteur: {
        name: "Guetteur",
        emoji: "👀",
        job: "Surveille les caméras",
        task: "Compte les policiers 👮 sur l'écran de surveillance",
        fail: "une patrouille vous repère (+1 alerte)"
    },
    grosbras: {
        name: "Gros bras",
        emoji: "💪",
        job: "Neutralise les vigiles",
        task: "Repère et frappe le vigile 👮 caché dans la foule",
        fail: "un vigile donne l'alerte (+1 alerte)"
    },
    chauffeur: {
        name: "Chauffeur",
        emoji: "🚗",
        job: "Assure la fuite",
        task: "Choisis la voie libre à chaque carrefour",
        fail: "la fuite est chaotique (risque d'arrestation +15 %)"
    }
};

const ALERT_ROLES = ["hacker", "guetteur", "grosbras"];

const TARGETS = {
    superette: {
        name: "Supérette",
        emoji: "🏪",
        minPlayers: 2,
        difficulty: 1,
        fee: 2_000,
        loot: [40_000, 90_000],
        jail: 30 * MIN,
        bail: 15_000
    },
    bijouterie: {
        name: "Bijouterie",
        emoji: "💎",
        minPlayers: 3,
        difficulty: 2,
        fee: 10_000,
        loot: [150_000, 300_000],
        jail: HOUR,
        bail: 50_000
    },
    banque: {
        name: "Banque centrale",
        emoji: "🏦",
        minPlayers: 4,
        difficulty: 3,
        fee: 30_000,
        loot: [400_000, 800_000],
        jail: 2 * HOUR,
        bail: 150_000
    },
    casino: {
        name: "Casino Royal",
        emoji: "🎰",
        minPlayers: 5,
        difficulty: 4,
        fee: 80_000,
        loot: [1_000_000, 2_000_000],
        jail: 3 * HOUR,
        bail: 400_000
    }
};

// ---------- Missions ----------
// Une mission = des manches ; chaque manche propose des boutons et une bonne réponse.
// Les styles sont des noms de ButtonStyle (« Primary », « Danger »…).

const SYMBOLS = ["🔺", "🔷", "🟢", "🟡", "⭐", "❤️", "🌙", "⚡", "🍀", "🔶"];
const WIRES = {
    rouge: { emoji: "🟥", style: "Danger", clues: ["🍓", "🌹", "🚒", "🍒", "🥵"] },
    bleu: { emoji: "🟦", style: "Primary", clues: ["🌊", "🐳", "🫐", "💧", "🧊"] },
    vert: { emoji: "🟩", style: "Success", clues: ["🍀", "🥝", "🐸", "🥦", "🌲"] },
    jaune: { emoji: "🟨", style: "Secondary", clues: ["🍋", "🌻", "🐤", "🍌", "🌽"] },
    violet: { emoji: "🟪", style: "Secondary", clues: ["🍇", "🍆", "🔮", "☂️", "🦄"] }
};
const CROWD = ["🧍", "👷", "💂", "🤵", "🧔", "🕵️"];
const LANES = [
    { id: "gauche", label: "Gauche", emoji: "⬅️" },
    { id: "centre", label: "Tout droit", emoji: "⬆️" },
    { id: "droite", label: "Droite", emoji: "➡️" }
];
const OBSTACLES = ["🚓", "🚧", "🚛", "🚔", "🛻"];

const ordinal = (n) => (n === 1 ? "1er" : `${n}e`);

function hackerRound(d) {
    const code = shuffle(SYMBOLS).slice(0, 3 + d);
    const pos = Math.floor(Math.random() * code.length);
    const answer = code[pos];
    const others = shuffle(SYMBOLS.filter((s) => s !== answer)).slice(0, 3);
    return {
        preview: `🔐 **Mémorise le code :**\n# ${code.join(" ")}`,
        previewMs: Math.max(1800, 3500 - d * 300),
        text: `Quel était le **${ordinal(pos + 1)}** symbole du code ?`,
        buttons: shuffle([answer, ...others]).map((s, i) => ({
            id: String(i),
            emoji: s,
            style: "Secondary",
            value: s
        })),
        answerValue: answer
    };
}

function artificierRound(d) {
    const colors = shuffle(Object.keys(WIRES)).slice(0, d >= 3 ? 5 : 4);
    const answer = pick(colors);
    return {
        text: `Coupe le câble de la couleur de :\n# ${pick(WIRES[answer].clues)}`,
        buttons: colors.map((c) => ({ id: c, label: c, emoji: WIRES[c].emoji, style: WIRES[c].style, value: c })),
        answerValue: answer
    };
}

function guetteurRound(d) {
    const total = 8 + 2 * d;
    const guards = 1 + Math.floor(Math.random() * (2 + d));
    const crowd = shuffle([...Array(guards).fill("👮"), ...Array.from({ length: total - guards }, () => pick(CROWD))]);
    const start = Math.max(0, guards - Math.floor(Math.random() * 4));
    return {
        text: `📹 **Caméra ${Math.floor(Math.random() * 9) + 1}** — combien de 👮 ?\n# ${crowd.join("")}`,
        buttons: [0, 1, 2, 3].map((k) => ({
            id: String(start + k),
            label: String(start + k),
            style: "Primary",
            value: start + k
        })),
        answerValue: guards
    };
}

function grosbrasRound(d) {
    const size = d >= 3 ? 16 : 9;
    const guard = Math.floor(Math.random() * size);
    return {
        text: "🥊 Frappe le **vigile 👮** avant qu'il ne donne l'alerte !",
        buttons: Array.from({ length: size }, (_, i) => ({
            id: String(i),
            emoji: i === guard ? "👮" : pick(CROWD),
            style: "Secondary",
            value: i
        })),
        perRow: size === 16 ? 4 : 3,
        answerValue: guard
    };
}

function chauffeurRound() {
    const free = Math.floor(Math.random() * 3);
    const road = LANES.map((_, i) => (i === free ? "🟩" : pick(OBSTACLES)));
    return {
        text: `🚨 La police vous suit ! Quelle voie est libre ?\n# ${road.join("  ")}`,
        buttons: LANES.map((l, i) => ({ id: l.id, label: l.label, emoji: l.emoji, style: "Primary", value: i })),
        answerValue: free
    };
}

const ROUND_MAKERS = {
    hacker: hackerRound,
    artificier: artificierRound,
    guetteur: guetteurRound,
    grosbras: grosbrasRound,
    chauffeur: chauffeurRound
};

function roundCount(difficulty) {
    return 2 + difficulty;
}

function roundTime(difficulty) {
    return Math.max(5000, 10_000 - difficulty * 1000);
}

// Liste des manches de la mission d'un rôle
function makeMission(role, difficulty) {
    const make = ROUND_MAKERS[role];
    if (!make) throw new Error(`Rôle inconnu : ${role}`);
    return Array.from({ length: roundCount(difficulty) }, () => {
        const round = make(difficulty);
        const answer = round.buttons.find((b) => b.value === round.answerValue);
        return { ...round, answer: answer.id, time: roundTime(difficulty) };
    });
}

function missionSuccess(correct, total) {
    return correct >= total - HEIST.MISTAKES_ALLOWED;
}

// ---------- Résolution ----------

// members : [{ userId, role }] ; results : { role: true/false } pour les rôles tenus
function resolveHeist(target, members, results, rng = Math.random) {
    const taken = new Set(members.map((m) => m.role));
    const roles = {};
    for (const key of Object.keys(ROLES)) {
        roles[key] = taken.has(key)
            ? { ok: results[key] === true, auto: false }
            : { ok: rng() < HEIST.UNASSIGNED_CHANCE, auto: true };
    }

    const alerts = ALERT_ROLES.filter((r) => !roles[r].ok).length;
    let lootMult = roles.artificier.ok ? 1 : HEIST.VAULT_FAIL_LOOT;
    if (alerts === ALERT_ROLES.length) lootMult = 0; // la police arrive avant le coffre

    let arrestChance = HEIST.ARREST_BASE + HEIST.ARREST_PER_ALERT * alerts;
    arrestChance = roles.chauffeur.ok ? arrestChance / 2 : arrestChance + HEIST.ARREST_NO_DRIVER;
    arrestChance = Math.min(HEIST.ARREST_MAX, Math.round(arrestChance * 1000) / 1000);

    const [min, max] = target.loot;
    const loot = Math.floor((min + rng() * (max - min)) * lootMult);

    const caught = members.map(() => rng() < arrestChance);
    const free = caught.filter((c) => !c).length;
    const share = free ? Math.floor(loot / free) : 0;

    return {
        roles,
        alerts,
        lootMult,
        arrestChance,
        loot,
        outcomes: members.map((m, i) => ({ ...m, caught: caught[i], gain: caught[i] ? 0 : share }))
    };
}

// Message affiché quand un prisonnier tente une commande bloquée
function jailNotice(jail) {
    return (
        `🚔 Tu es en prison, libération <t:${Math.floor(jail.until / 1000)}:R>.\n` +
        `Paie la caution (${money(jail.bail)}) avec \`/braquage prison\` pour sortir plus tôt.`
    );
}

module.exports = {
    HEIST,
    jailNotice,
    ROLES,
    ALERT_ROLES,
    TARGETS,
    WIRES,
    makeMission,
    missionSuccess,
    resolveHeist,
    roundCount,
    roundTime
};
