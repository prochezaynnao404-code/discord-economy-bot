const { ECONOMY } = require("../config");

/*
==================================================
NIVEAUX
- Courbe progressive : passer du niveau n au niveau n+1 coûte 5n² + 50n + 100 XP
- Chaque niveau au-dessus du 1 donne un bonus sur les gains (messages, vocal, daily, work)
==================================================
*/

// XP nécessaire pour passer du niveau `level` au suivant
function xpForLevel(level) {
    return 5 * level * level + 50 * level + 100;
}

// XP totale accumulée pour atteindre le début du niveau `level`
function totalXpForLevel(level) {
    let total = 0;
    for (let n = 1; n < level; n++) total += xpForLevel(n);
    return total;
}

// Niveau et XP restante à partir d'une XP totale
function levelFromTotal(total) {
    let level = 1;
    let xp = Math.max(0, Math.floor(total));
    while (xp >= xpForLevel(level)) {
        xp -= xpForLevel(level);
        level++;
    }
    return { level, xp };
}

// Bonus de gains (fraction) : +1 % par niveau au-dessus du 1, plafonné
function levelBonus(level) {
    const { BONUS_PER_LEVEL, BONUS_MAX } = ECONOMY.LEVELS;
    return Math.min(Math.max(0, level - 1) * BONUS_PER_LEVEL, BONUS_MAX);
}

function applyBonus(amount, level) {
    return Math.floor(amount * (1 + levelBonus(level)));
}

const formatBonus = (level) => `+${Math.round(levelBonus(level) * 100)} %`;

// Couleur d'accent selon le palier
function levelColor(level) {
    if (level >= 75) return "#e74c3c";
    if (level >= 50) return "#f39c12";
    if (level >= 25) return "#9b59b6";
    if (level >= 10) return "#3498db";
    return "#43b581";
}

// Réglages d'annonce par serveur (stockés dans la table settings)
const channelKey = (guildId) => `levels.channel.${guildId}`;
const enabledKey = (guildId) => `levels.announce.${guildId}`;

function announceSettings(economy, guildId) {
    return {
        channelId: economy.getSetting(channelKey(guildId)),
        enabled: economy.getSetting(enabledKey(guildId)) !== "0"
    };
}

module.exports = {
    xpForLevel,
    totalXpForLevel,
    levelFromTotal,
    levelBonus,
    applyBonus,
    formatBonus,
    levelColor,
    announceSettings,
    channelKey,
    enabledKey
};
