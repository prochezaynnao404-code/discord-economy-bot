const fs = require("fs");
const path = require("path");
const { AuditLogEvent, Events, PermissionFlagsBits, PermissionsBitField, EmbedBuilder } = require("discord.js");

const config = require("../config");

/*
==================================================
IRISIABOT ANTI-NUKE V3
Basé sur l'événement temps réel GuildAuditLogEntryCreate
(intent GuildModeration + permission "Voir les logs du serveur").
==================================================
*/

const CONFIG = {
    // Fenêtre pendant laquelle les actions sont comptées
    WINDOW: 10000,

    // Nombre maximum d'actions dans la fenêtre avant sanction
    LIMITS: {
        [AuditLogEvent.ChannelDelete]: 3,
        [AuditLogEvent.ChannelCreate]: 5,
        [AuditLogEvent.RoleDelete]: 3,
        [AuditLogEvent.RoleCreate]: 5,
        [AuditLogEvent.MemberBanAdd]: 3,
        [AuditLogEvent.MemberKick]: 3,
        [AuditLogEvent.MemberPrune]: 1,
        [AuditLogEvent.WebhookCreate]: 3
    },

    // Verrouiller les salons quand un nuke est détecté
    LOCKDOWN: true
};

// Permissions considérées comme dangereuses si elles sont données par un membre non autorisé
const DANGEROUS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.MentionEveryone
];

function hasDangerous(bitfield) {
    const perms = new PermissionsBitField(BigInt(bitfield || 0));
    return DANGEROUS.some((p) => perms.has(p, false));
}

/*
==================================================
LISTE BLANCHE
==================================================
*/

function isTrusted(guild, userId) {
    return (
        userId === guild.client.user.id ||
        userId === guild.ownerId ||
        userId === config.OWNER_ID ||
        config.SECURITY_WHITELIST.includes(userId)
    );
}

/*
==================================================
COMPTEURS
==================================================
*/

const actions = new Map(); // "guild:executor:action" -> timestamps

function registerAction(guildId, executorId, action) {
    const key = `${guildId}:${executorId}:${action}`;
    const now = Date.now();
    const list = (actions.get(key) || []).filter((t) => now - t < CONFIG.WINDOW);
    list.push(now);
    actions.set(key, list);
    return list.length;
}

// Nettoyage des compteurs expirés
setInterval(() => {
    const now = Date.now();
    for (const [key, list] of actions) {
        if (list.every((t) => now - t >= CONFIG.WINDOW)) actions.delete(key);
    }
}, 60000).unref();

/*
==================================================
ALERTES
==================================================
*/

async function alert(guild, title, description) {
    console.log(`🛡️ [${guild.name}] ${title} — ${description}`);
    if (!config.SECURITY_LOG_CHANNEL_ID) return;
    const channel = guild.channels.cache.get(config.SECURITY_LOG_CHANNEL_ID);
    if (!channel?.isTextBased()) return;
    await channel
        .send({
            embeds: [
                new EmbedBuilder().setColor("Red").setTitle(`🛡️ ${title}`).setDescription(description).setTimestamp()
            ],
            allowedMentions: { parse: [] }
        })
        .catch(() => {});
}

/*
==================================================
LOCKDOWN / UNLOCK
==================================================
*/

const LOCK_DIR = path.join(config.BACKUP_DIR, "lockdown");

function lockFile(guildId) {
    return path.join(LOCK_DIR, `${guildId}.json`);
}

function isLocked(guildId) {
    return fs.existsSync(lockFile(guildId));
}

async function lockdown(guild, reason = "Anti-Nuke") {
    if (isLocked(guild.id)) return 0;

    // On mémorise l'état d'origine de @everyone pour pouvoir le restaurer
    const previous = {};
    let locked = 0;
    for (const channel of guild.channels.cache.values()) {
        if (!channel.permissionOverwrites || channel.isThread()) continue;
        const overwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
        const state = (flag) => (overwrite?.allow.has(flag) ? true : overwrite?.deny.has(flag) ? false : null);
        previous[channel.id] = {
            SendMessages: state(PermissionFlagsBits.SendMessages),
            CreatePublicThreads: state(PermissionFlagsBits.CreatePublicThreads),
            CreatePrivateThreads: state(PermissionFlagsBits.CreatePrivateThreads),
            Connect: state(PermissionFlagsBits.Connect)
        };
        try {
            await channel.permissionOverwrites.edit(
                guild.roles.everyone,
                { SendMessages: false, CreatePublicThreads: false, CreatePrivateThreads: false, Connect: false },
                { reason: `Irisiabot Lockdown : ${reason}` }
            );
            locked++;
        } catch (error) {
            console.log(`⚠️ Lockdown impossible pour ${channel.name} : ${error.message}`);
        }
    }

    fs.mkdirSync(LOCK_DIR, { recursive: true });
    fs.writeFileSync(lockFile(guild.id), JSON.stringify({ createdAt: Date.now(), reason, previous }, null, 2));
    await alert(
        guild,
        "Serveur verrouillé",
        `${locked} salons verrouillés.\nRaison : ${reason}\nDéverrouiller : \`/security unlock\``
    );
    return locked;
}

async function unlock(guild) {
    if (!isLocked(guild.id)) return null;
    const { previous } = JSON.parse(fs.readFileSync(lockFile(guild.id), "utf8"));

    let restored = 0;
    for (const [channelId, perms] of Object.entries(previous)) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel) continue;
        try {
            await channel.permissionOverwrites.edit(guild.roles.everyone, perms, {
                reason: "Irisiabot : fin du lockdown"
            });
            restored++;
        } catch (error) {
            console.log(`⚠️ Unlock impossible pour ${channel.name} : ${error.message}`);
        }
    }

    fs.unlinkSync(lockFile(guild.id));
    return restored;
}

/*
==================================================
SANCTION
==================================================
*/

async function punish(guild, executorId, reason, { lock = false } = {}) {
    if (isTrusted(guild, executorId)) return;

    const executor = await guild.members.fetch(executorId).catch(() => null);
    let done = false;

    if (executor?.bannable) {
        done = await executor
            .ban({ deleteMessageSeconds: 0, reason: `Irisiabot Anti-Nuke : ${reason}` })
            .then(() => true)
            .catch((e) => {
                console.log("❌ Erreur ban :", e.message);
                return false;
            });
    } else if (executor?.manageable) {
        // Impossible de bannir : on retire au moins tous ses rôles
        done = await executor.roles
            .set([], `Irisiabot Anti-Nuke : ${reason}`)
            .then(() => true)
            .catch(() => false);
    }

    const tag = executor ? `${executor.user.tag} (${executorId})` : executorId;
    await alert(guild, done ? "Membre sanctionné" : "Sanction impossible", `👤 ${tag}\n📛 ${reason}`);

    // Lockdown si c'est un nuke de masse, ou si on n'a pas pu arrêter l'auteur
    if (CONFIG.LOCKDOWN && (lock || !done)) await lockdown(guild, reason);
}

/*
==================================================
DÉTECTIONS
==================================================
*/

async function onAuditLogEntry(entry, guild) {
    const { action, executorId } = entry;
    if (!executorId || isTrusted(guild, executorId)) return;

    // Ajout d'un bot non autorisé : expulsion du bot + sanction
    if (action === AuditLogEvent.BotAdd) {
        const bot = await guild.members.fetch(entry.targetId).catch(() => null);
        if (bot?.bannable)
            await bot.ban({ reason: "Irisiabot Anti-Nuke : bot ajouté sans autorisation" }).catch(() => {});
        return punish(guild, executorId, `Ajout du bot ${bot?.user.tag ?? entry.targetId} non autorisé`);
    }

    // Permissions dangereuses ajoutées à un rôle (ex : Administrator sur @everyone)
    if (action === AuditLogEvent.RoleUpdate) {
        const change = entry.changes.find((c) => c.key === "permissions");
        if (change && !hasDangerous(change.old) && hasDangerous(change.new)) {
            const role = guild.roles.cache.get(entry.targetId);
            if (role?.editable)
                await role
                    .setPermissions(BigInt(change.old || 0), "Irisiabot : permissions restaurées")
                    .catch(() => {});
            return punish(
                guild,
                executorId,
                `Permissions dangereuses ajoutées au rôle ${role?.name ?? entry.targetId}`
            );
        }
        return;
    }

    // Rôle dangereux donné à un membre
    if (action === AuditLogEvent.MemberRoleUpdate) {
        const added = entry.changes.find((c) => c.key === "$add")?.new || [];
        const dangerous = added
            .map((r) => guild.roles.cache.get(r.id))
            .filter((r) => r && hasDangerous(r.permissions.bitfield));
        if (dangerous.length === 0) return;
        const member = await guild.members.fetch(entry.targetId).catch(() => null);
        if (member) await member.roles.remove(dangerous, "Irisiabot : rôle dangereux retiré").catch(() => {});
        return punish(
            guild,
            executorId,
            `Rôle dangereux (${dangerous.map((r) => r.name).join(", ")}) donné à ${member?.user.tag ?? entry.targetId}`
        );
    }

    // Changement de l'URL personnalisée ou du nom du serveur
    if (action === AuditLogEvent.GuildUpdate) {
        if (entry.changes.some((c) => c.key === "vanity_url_code")) {
            return punish(guild, executorId, "Modification de l'URL personnalisée du serveur");
        }
        return;
    }

    // Actions de masse
    const limit = CONFIG.LIMITS[action];
    if (!limit) return;
    const count = registerAction(guild.id, executorId, action);
    if (count >= limit) {
        await punish(guild, executorId, `${count} actions "${AuditLogEvent[action]}" en ${CONFIG.WINDOW / 1000} s`, {
            lock: true
        });
    }
}

/*
==================================================
DÉMARRAGE
==================================================
*/

function startAntiNuke(client) {
    client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
        onAuditLogEntry(entry, guild).catch((error) => console.log("⚠️ Erreur anti-nuke :", error.message));
    });
    console.log(`🛡️ Anti-Nuke V3 activé (${config.SECURITY_WHITELIST.length} membre(s) en liste blanche)`);
}

module.exports = { startAntiNuke, lockdown, unlock, isLocked, CONFIG };
