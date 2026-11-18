require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const { Client, Collection, GatewayIntentBits, Events } = require("discord.js");

const config = require("./config");
const { Economy } = require("./utils/db");
const { EPHEMERAL, randInt } = require("./utils/helpers");
const { startAntiNuke } = require("./security/antiNuke");
const { startWealthTax } = require("./utils/tax");
const { startEmployeeOfMonth } = require("./utils/business");
const { applyBonus } = require("./utils/levels");
const { announceLevelUp } = require("./utils/levelRender");

const ECO = config.ECONOMY;

console.log("🚀 Démarrage du bot...");

// =========================
// SERVEUR WEB (health check de l'hébergeur)
// =========================

const app = express();
app.get("/", (req, res) => res.status(200).send("Bot Discord OK"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`🌐 Serveur web sur le port ${PORT}`));

// =========================
// CLIENT
// =========================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        // Nécessaire pour les mini-jeux où il faut retaper un mot (/work, /rob)
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        // Nécessaire pour recevoir les entrées d'audit log en temps réel (anti-nuke)
        GatewayIntentBits.GuildModeration,
        // Anti-nuke : savoir qui a invité chaque membre, et recréer les emojis supprimés
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildExpressions
    ]
});

// =========================
// BASE DE DONNÉES
// =========================

const economy = new Economy(config.DB_PATH);
client.economy = economy;
console.log(`🗄️ Base de données : ${path.resolve(config.DB_PATH)}`);

// =========================
// COMMANDES
// =========================

client.commands = new Collection();

for (const file of fs.readdirSync(path.join(__dirname, "slashCommands")).filter((f) => f.endsWith(".js"))) {
    const command = require(`./slashCommands/${file}`);
    if (!command.data || !command.execute) {
        console.warn(`❌ Commande invalide : ${file}`);
        continue;
    }
    client.commands.set(command.data.name, command);
}
console.log(`✅ ${client.commands.size} commandes chargées`);

// =========================
// SÉCURITÉ
// =========================

startAntiNuke(client, economy);

// =========================
// IMPÔT SUR LA FORTUNE (chaque dimanche à 21 h)
// =========================

startWealthTax(client, economy);

// =========================
// ENTREPRISES : EMPLOYÉ DU MOIS (au changement de mois)
// =========================

startEmployeeOfMonth(client, economy);

// =========================
// TEMPS VOCAL (une seule source de vérité)
// =========================

const voiceSessions = new Map(); // userId -> début de la période non comptabilisée

function flushVoice(userId, now = Date.now()) {
    const start = voiceSessions.get(userId);
    if (!start) return;
    economy.addVoiceTime(userId, Math.floor((now - start) / 1000));
    voiceSessions.set(userId, now);
}

function flushAllVoice() {
    const now = Date.now();
    for (const userId of voiceSessions.keys()) flushVoice(userId, now);
}

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    if (!oldState.channelId && newState.channelId) {
        voiceSessions.set(member.id, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
        flushVoice(member.id);
        voiceSessions.delete(member.id);
    }
});

setInterval(flushAllVoice, 60 * 1000);

// =========================
// GAINS VOCAUX
// =========================

// Seuls les membres réellement actifs gagnent de l'argent :
// pas en AFK, pas en sourdine (casque), et au moins 2 humains dans le salon.
function isActiveInVoice(state) {
    if (!state.channel || !state.member || state.member.user.bot) return false;
    if (state.channelId === state.guild.afkChannelId) return false;
    if (state.selfDeaf || state.serverDeaf) return false;
    const humans = state.channel.members.filter((m) => !m.user.bot && !m.voice.selfDeaf && !m.voice.serverDeaf);
    return humans.size >= 2;
}

setInterval(() => {
    const rewarded = new Set();
    for (const guild of client.guilds.cache.values()) {
        for (const state of guild.voiceStates.cache.values()) {
            if (rewarded.has(state.id) || !isActiveInVoice(state)) continue;
            rewarded.add(state.id);
            try {
                const { level } = economy.getUser(state.id);
                economy.addMoney(
                    state.id,
                    economy.drinkBoost(state.id, "gains", applyBonus(randInt(...ECO.VOICE_GAIN), level))
                );
                const up = economy.addXp(state.id, economy.drinkBoost(state.id, "xp", randInt(...ECO.VOICE_XP)));
                if (up.leveledUp) {
                    // Annonce dans le salon configuré, sinon dans le chat du salon vocal
                    announceLevelUp({
                        economy,
                        guild,
                        user: state.member.user,
                        level: up.level,
                        previous: up.previous,
                        fallback: state.channel
                    }).catch((err) => console.error("❌ Annonce de niveau :", err.message));
                }
                economy.progressQuest(state.id, "vocal", ECO.VOICE_TICK / 60000);
            } catch (err) {
                console.error("❌ Erreur gain vocal :", err);
            }
        }
    }
}, ECO.VOICE_TICK);

// =========================
// READY
// =========================

client.once(Events.ClientReady, () => {
    console.log(`✅ Connecté : ${client.user.tag}`);

    // Reprendre le comptage des membres déjà en vocal au démarrage
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
        for (const state of guild.voiceStates.cache.values()) {
            if (state.channelId && state.member && !state.member.user.bot) voiceSessions.set(state.id, now);
        }
    }
});

// =========================
// NOUVEAU MEMBRE
// =========================

client.on(Events.GuildMemberAdd, (member) => {
    if (member.user.bot) return;
    economy.ensureUser(member.id, Date.now());
});

// =========================
// MESSAGES : ARGENT + XP
// =========================

const lastMessageReward = new Map(); // userId -> timestamp (argent)
const lastMessageXp = new Map(); // userId -> timestamp (XP, cooldown plus long contre le spam)

client.on(Events.MessageCreate, (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const now = Date.now();
    if (now - (lastMessageReward.get(userId) || 0) < ECO.MESSAGE_COOLDOWN) return;
    lastMessageReward.set(userId, now);

    try {
        const { level } = economy.getUser(userId);
        economy.recordMessage(
            userId,
            economy.drinkBoost(userId, "gains", applyBonus(randInt(...ECO.MESSAGE_GAIN), level))
        );

        if (now - (lastMessageXp.get(userId) || 0) >= ECO.MESSAGE_XP_COOLDOWN) {
            lastMessageXp.set(userId, now);
            const up = economy.addXp(userId, economy.drinkBoost(userId, "xp", randInt(...ECO.MESSAGE_XP)));
            if (up.leveledUp) {
                announceLevelUp({
                    economy,
                    guild: message.guild,
                    user: message.author,
                    level: up.level,
                    previous: up.previous,
                    fallback: message.channel
                }).catch((err) => console.error("❌ Annonce de niveau :", err.message));
            }
        }

        if (economy.progressQuest(userId, "messages")) {
            message.channel
                .send(`🎯 ${message.author} a terminé sa quête messages ! Utilise \`/quests\` pour la récompense.`)
                .catch(() => {});
        }
    } catch (err) {
        console.error("❌ Erreur messageCreate :", err);
    }
});

// Nettoyage des cooldowns de messages expirés
setInterval(
    () => {
        const now = Date.now();
        for (const [userId, time] of lastMessageReward) {
            if (now - time > ECO.MESSAGE_COOLDOWN) lastMessageReward.delete(userId);
        }
        for (const [userId, time] of lastMessageXp) {
            if (now - time > ECO.MESSAGE_XP_COOLDOWN) lastMessageXp.delete(userId);
        }
    },
    5 * 60 * 1000
);

// =========================
// COMMANDES SLASH
// =========================

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ Erreur /${interaction.commandName} :`, error);
        const payload = { content: "❌ Une erreur est survenue.", flags: EPHEMERAL };
        try {
            if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
            else await interaction.reply(payload);
        } catch {
            // L'interaction a expiré : rien à faire
        }
    }
});

// =========================
// SAUVEGARDES SQLITE
// =========================

setInterval(async () => {
    try {
        const file = await economy.backup(config.BACKUP_DIR, config.BACKUP_KEEP);
        console.log(`✅ Backup : ${path.basename(file)}`);
    } catch (err) {
        console.error("❌ Erreur backup :", err);
    }
}, config.BACKUP_INTERVAL);

// =========================
// ERREURS & ARRÊT PROPRE
// =========================

process.on("unhandledRejection", (err) => console.error("❌ Promesse rejetée non gérée :", err));

client.on(Events.Error, (err) => console.error("❌ Erreur client Discord :", err));

let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`🛑 ${signal} reçu, arrêt...`);
    try {
        flushAllVoice();
        economy.close();
    } catch (err) {
        console.error(err);
    }
    client.destroy().finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// =========================
// CONNEXION
// =========================

if (!process.env.TOKEN) {
    console.error("❌ Variable TOKEN manquante dans .env");
    process.exit(1);
}

client.login(process.env.TOKEN).catch((err) => {
    console.error("❌ Connexion à Discord impossible :", err.message);
    process.exit(1);
});
