/*
==================================================
TITRES
- Débloqués par des exploits (vérifiés à partir des stats)
  ou achetés en boutique (l'argent est détruit)
- Un titre débloqué est gardé pour toujours, même si la
  condition n'est plus remplie (ex. on redevient pauvre)
- On équipe un titre : il s'affiche sur le profil
==================================================
*/

const RARITIES = {
    commun: { label: "Commun", emoji: "⚪", color: "#a3acbd", order: 0 },
    rare: { label: "Rare", emoji: "🔵", color: "#5b8def", order: 1 },
    epique: { label: "Épique", emoji: "🟣", color: "#a77bf3", order: 2 },
    legendaire: { label: "Légendaire", emoji: "🟡", color: "#f7c948", order: 3 },
    mythique: { label: "Mythique", emoji: "🔴", color: "#f2545b", order: 4 }
};

const CATEGORIES = {
    economie: "💰 Économie",
    activite: "💬 Activité",
    niveaux: "✨ Niveaux",
    entreprise: "🏢 Entreprise",
    bar: "🍻 Bar",
    jeux: "🎮 Jeux",
    crime: "🦹 Crime",
    art: "🎨 Art",
    boutique: "🛒 Boutique"
};

const M = 1_000_000;

// goal : objectif ; value(ctx) : progression actuelle
const TITLES = [
    // Économie
    {
        id: "epargnant",
        name: "Petit épargnant",
        rarity: "commun",
        category: "economie",
        hint: "Avoir 100 000 $ en banque",
        goal: 100_000,
        value: (c) => c.bank
    },
    {
        id: "millionnaire",
        name: "Millionnaire",
        rarity: "rare",
        category: "economie",
        hint: "Posséder 1 000 000 $ (poche + banque)",
        goal: M,
        value: (c) => c.wealth
    },
    {
        id: "magnat",
        name: "Magnat",
        rarity: "epique",
        category: "economie",
        hint: "Posséder 50 000 000 $",
        goal: 50 * M,
        value: (c) => c.wealth
    },
    {
        id: "cresus",
        name: "Crésus",
        rarity: "legendaire",
        category: "economie",
        hint: "Posséder 500 000 000 $",
        goal: 500 * M,
        value: (c) => c.wealth
    },
    {
        id: "contribuable",
        name: "Contribuable modèle",
        rarity: "rare",
        category: "economie",
        hint: "Payer 1 000 000 $ d'impôt sur la fortune au total",
        goal: M,
        value: (c) => c.taxPaid
    },

    // Activité
    {
        id: "bavard",
        name: "Bavard",
        rarity: "commun",
        category: "activite",
        hint: "Envoyer 1 000 messages",
        goal: 1000,
        value: (c) => c.messages
    },
    {
        id: "moulin",
        name: "Moulin à paroles",
        rarity: "rare",
        category: "activite",
        hint: "Envoyer 10 000 messages",
        goal: 10_000,
        value: (c) => c.messages
    },
    {
        id: "voix",
        name: "Voix d'or",
        rarity: "rare",
        category: "activite",
        hint: "Passer 100 h en vocal",
        goal: 100 * 3600,
        value: (c) => c.voice,
        unit: "h"
    },
    {
        id: "assidu",
        name: "Assidu",
        rarity: "commun",
        category: "activite",
        hint: "Atteindre une série de 7 daily",
        goal: 7,
        value: (c) => c.dailyStreak
    },

    // Niveaux
    {
        id: "motive",
        name: "Débutant motivé",
        rarity: "commun",
        category: "niveaux",
        hint: "Atteindre le niveau 5",
        goal: 5,
        value: (c) => c.level
    },
    {
        id: "veteran",
        name: "Vétéran",
        rarity: "rare",
        category: "niveaux",
        hint: "Atteindre le niveau 25",
        goal: 25,
        value: (c) => c.level
    },
    {
        id: "legende",
        name: "Légende vivante",
        rarity: "legendaire",
        category: "niveaux",
        hint: "Atteindre le niveau 75",
        goal: 75,
        value: (c) => c.level
    },
    {
        id: "numero1",
        name: "Numéro 1",
        rarity: "mythique",
        category: "niveaux",
        hint: "Être 1er du classement des niveaux",
        goal: 1,
        value: (c) => (c.rank === 1 && c.level > 1 ? 1 : 0)
    },

    // Entreprise
    {
        id: "entrepreneur",
        name: "Entrepreneur",
        rarity: "rare",
        category: "entreprise",
        hint: "Fonder une entreprise",
        goal: 1,
        value: (c) => (c.business ? 1 : 0)
    },
    {
        id: "empire",
        name: "Empire industriel",
        rarity: "epique",
        category: "entreprise",
        hint: "Encaisser 50 000 000 $ avec ton entreprise",
        goal: 50 * M,
        value: (c) => c.business?.totalEarned ?? 0
    },
    {
        id: "robots",
        name: "Roi des robots",
        rarity: "epique",
        category: "entreprise",
        hint: "Posséder 10 robots",
        goal: 10,
        value: (c) => c.botCount
    },
    {
        id: "employe",
        name: "Employé modèle",
        rarity: "rare",
        category: "entreprise",
        hint: "Être élu employé du mois",
        goal: 1,
        value: (c) => c.awards
    },
    {
        id: "employeannee",
        name: "Employé de l'année",
        rarity: "legendaire",
        category: "entreprise",
        hint: "Être élu employé du mois 3 fois",
        goal: 3,
        value: (c) => c.awards
    },

    // Bar
    {
        id: "comptoir",
        name: "Pilier de comptoir",
        rarity: "rare",
        category: "bar",
        hint: "Boire 50 verres au bar",
        goal: 50,
        value: (c) => c.drinks
    },
    {
        id: "genereux",
        name: "Généreux",
        rarity: "rare",
        category: "bar",
        hint: "Offrir 10 verres",
        goal: 10,
        value: (c) => c.drinksOffered
    },

    // Jeux
    {
        id: "joueur",
        name: "Joueur",
        rarity: "commun",
        category: "jeux",
        hint: "Gagner 10 parties de mini-jeux",
        goal: 10,
        value: (c) => c.gameWins
    },
    {
        id: "champion",
        name: "Champion",
        rarity: "epique",
        category: "jeux",
        hint: "Gagner 100 parties de mini-jeux",
        goal: 100,
        value: (c) => c.gameWins
    },

    // Crime (braquages en équipe)
    {
        id: "complice",
        name: "Complice",
        rarity: "commun",
        category: "crime",
        hint: "Participer à un braquage en équipe",
        goal: 1,
        value: (c) => c.heists
    },
    {
        id: "taulard",
        name: "Taulard",
        rarity: "commun",
        category: "crime",
        hint: "Aller 3 fois en prison",
        goal: 3,
        value: (c) => c.jailCount
    },
    {
        id: "braqueur",
        name: "Braqueur",
        rarity: "rare",
        category: "crime",
        hint: "Réussir 5 braquages en équipe",
        goal: 5,
        value: (c) => c.heistsWon
    },
    {
        id: "ennemipublic",
        name: "Ennemi public n°1",
        rarity: "epique",
        category: "crime",
        hint: "Réussir 25 braquages en équipe",
        goal: 25,
        value: (c) => c.heistsWon
    },
    {
        id: "cerveau",
        name: "Cerveau du crime",
        rarity: "legendaire",
        category: "crime",
        hint: "Amasser 10 000 000 $ en braquages",
        goal: 10 * M,
        value: (c) => c.heistLoot
    },

    // Art (dessin)
    {
        id: "artiste",
        name: "Artiste en herbe",
        rarity: "commun",
        category: "art",
        hint: "Enregistrer 3 œuvres dans ta galerie",
        goal: 3,
        value: (c) => c.works
    },
    {
        id: "admire",
        name: "Artiste admiré",
        rarity: "rare",
        category: "art",
        hint: "Recevoir 10 ❤️ sur tes œuvres",
        goal: 10,
        value: (c) => c.likes
    },
    {
        id: "maitre",
        name: "Maître de l'art",
        rarity: "epique",
        category: "art",
        hint: "Recevoir 50 ❤️ sur tes œuvres",
        goal: 50,
        value: (c) => c.likes
    },
    {
        id: "devin",
        name: "Devin",
        rarity: "rare",
        category: "art",
        hint: "Deviner 20 mots à « Dessine et devine »",
        goal: 20,
        value: (c) => c.drawGuesses
    },
    {
        id: "duoparfait",
        name: "Duo parfait",
        rarity: "epique",
        category: "art",
        hint: "Faire 450 points en une partie de « Dessine et devine »",
        goal: 450,
        value: (c) => c.drawBest
    },

    // Boutique
    { id: "baron", name: "Baron", rarity: "rare", category: "boutique", price: 10 * M },
    { id: "comte", name: "Comte", rarity: "epique", category: "boutique", price: 50 * M },
    { id: "duc", name: "Duc", rarity: "legendaire", category: "boutique", price: 250 * M },
    { id: "empereur", name: "Empereur", rarity: "mythique", category: "boutique", price: 1000 * M }
];

const TITLE_BY_ID = Object.fromEntries(TITLES.map((t) => [t.id, t]));

// Statistiques utiles aux conditions
function titleContext(economy, userId) {
    const user = economy.getUser(userId);
    const business = economy.getBusinessByOwner(userId);
    const games = economy.getGameStats(userId);
    return {
        bank: user.bank,
        wealth: user.money + user.bank,
        messages: user.messages,
        voice: user.voiceTime,
        dailyStreak: user.dailyStreak,
        level: user.level,
        rank: economy.levelRank(userId),
        taxPaid: economy.getTaxSummary(userId).total,
        business,
        botCount: business ? economy.getBusinessView(business.id).stats.botCount : 0,
        awards: economy.countEmployeeAwards(userId),
        drinks: user.drinks,
        drinksOffered: user.drinksOffered,
        gameWins: games.reduce((sum, g) => sum + g.wins, 0),
        heists: user.heists,
        heistsWon: user.heistsWon,
        heistLoot: user.heistLoot,
        jailCount: user.jailCount,
        works: economy.getDrawings(userId).length,
        likes: economy.likesReceived(userId),
        drawGuesses: user.drawGuesses,
        drawBest: user.drawBest
    };
}

function progressOf(title, ctx) {
    if (!title.goal) return null;
    const current = Math.max(0, title.value(ctx) || 0);
    return { current, goal: title.goal, ratio: Math.min(1, current / title.goal), done: current >= title.goal };
}

// Débloque les titres dont la condition est remplie ; renvoie les nouveaux
function syncTitles(economy, userId, now = Date.now()) {
    const ctx = titleContext(economy, userId);
    const earned = TITLES.filter((t) => t.goal && progressOf(t, ctx).done).map((t) => t.id);
    return economy.unlockTitles(userId, earned, now).map((id) => TITLE_BY_ID[id]);
}

// Titre équipé (objet complet) ou null
function equippedTitle(user) {
    return (user.title && TITLE_BY_ID[user.title]) || null;
}

function titleLabel(title) {
    const r = RARITIES[title.rarity];
    return `${r.emoji} **${title.name}**`;
}

// « 🎉 Nouveau titre débloqué : … » (vide s'il n'y en a pas)
function newTitlesText(titles) {
    if (!titles.length) return "";
    const s = titles.length > 1;
    return `🎉 **Nouveau${s ? "x" : ""} titre${s ? "s" : ""} débloqué${s ? "s" : ""} :** ${titles.map(titleLabel).join(", ")} — \`/titres\` pour l'équiper`;
}

module.exports = {
    newTitlesText,
    RARITIES,
    CATEGORIES,
    TITLES,
    TITLE_BY_ID,
    titleContext,
    progressOf,
    syncTitles,
    equippedTitle,
    titleLabel
};
