require("dotenv").config();

function idList(value) {
    return (value || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
}

module.exports = {
    // Propriétaire du bot (commandes /give, /security)
    OWNER_ID: process.env.OWNER_ID || "1184567704133324891",

    // Membres de confiance ignorés par l'anti-nuke (séparés par des virgules)
    SECURITY_WHITELIST: idList(process.env.SECURITY_WHITELIST),

    // Base de données SQLite
    DB_PATH: process.env.DB_PATH || "./database.sqlite",
    BACKUP_DIR: process.env.BACKUP_DIR || "./backups",
    BACKUP_INTERVAL: 30 * 60 * 1000,
    BACKUP_KEEP: Number(process.env.BACKUP_KEEP) || 48,

    ECONOMY: {
        MESSAGE_COOLDOWN: 30 * 1000,
        MESSAGE_GAIN: [10, 60],
        MESSAGE_XP: 5,

        VOICE_TICK: 10 * 60 * 1000,
        VOICE_GAIN: [50, 150],
        VOICE_XP: 10,

        DAILY_REWARD: 5000,
        DAILY_STREAK_MAX: 10,

        WORK_COOLDOWN: 60 * 60 * 1000,
        WORK_GAIN: [4500, 12000],

        ROB_COOLDOWN: 24 * 60 * 60 * 1000,
        ROB_GAIN: [7000, 32000],
        ROB_FINE_PERCENT: 0.1,
        ROB_FINE_MAX: 10000,

        QUEST_REWARD: 10000,
        QUEST_GOALS: { messages: 30, vocal: 30, casino: 5 },

        BUSINESS_PRICE: 5000000,
        MAX_BET: 1000000
    }
};
