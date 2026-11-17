const fs = require("fs");
const path = require("path");
const { AuditLogEvent, Events, PermissionFlagsBits, PermissionsBitField } = require("discord.js");

const config = require("../config");
const { startSnapshots } = require("./snapshot");
const { startInviteTracking, getInviter } = require("./invites");
const { restoreIncident } = require("./restore");
const { sendReport } = require("./report");
const { createBackup } = require("./backup");

/*
==================================================
IRISIABOT ANTI-NUKE V4
1. Chaque action d'un membre non autorisé est notée dans un journal
2. Si un seuil est dépassé (ou action dangereuse) : INCIDENT
   → bannissement immédiat de l'auteur
   → annulation de TOUTES ses actions (le serveur est remis comme avant)
   → rapport complet envoyé en MP au propriétaire du bot
==================================================
*/

const CONFIG = {
    // Fenêtre pendant laquelle les actions sont comptées
    WINDOW: 10000,

    // Nombre d'actions dans la fenêtre qui déclenche l'incident
    LIMITS: {
        [AuditLogEvent.ChannelDelete]: 3,
        [AuditLogEvent.ChannelCreate]: 5,
        [AuditLogEvent.RoleDelete]: 3,
        [AuditLogEvent.RoleCreate]: 5,
        [AuditLogEvent.MemberBanAdd]: 3,
        [AuditLogEvent.MemberKick]: 3,
        [AuditLogEvent.MemberPrune]: 1,
        [AuditLogEvent.WebhookCreate]: 3,
        [AuditLogEvent.EmojiDelete]: 3
    },

    // Durée pendant laquelle les actions restent dans le journal (pour être annulées)
    JOURNAL_TTL: 15 * 60 * 1000,

    // Attente après la sanction pour recevoir les dernières actions en cours
    GRACE: 4000
};

// Actions notées dans le journal (car on sait les annuler ou les signaler)
const TRACKED = new Set([
    AuditLogEvent.ChannelCreate,
    AuditLogEvent.ChannelUpdate,
    AuditLogEvent.ChannelDelete,
    AuditLogEvent.ChannelOverwriteCreate,
    AuditLogEvent.ChannelOverwriteUpdate,
    AuditLogEvent.ChannelOverwriteDelete,
    AuditLogEvent.MemberKick,
    AuditLogEvent.MemberPrune,
    AuditLogEvent.MemberBanAdd,
    AuditLogEvent.MemberUpdate,
    AuditLogEvent.MemberRoleUpdate,
    AuditLogEvent.BotAdd,
    AuditLogEvent.RoleCreate,
    AuditLogEvent.RoleUpdate,
    AuditLogEvent.RoleDelete,
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.EmojiDelete,
    AuditLogEvent.GuildUpdate
]);

// Permissions considérées comme dangereuses
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

function isTrusted(guild, userId) {
    return (
        userId === guild.client.user.id ||
        userId === guild.ownerId ||
        userId === config.OWNER_ID ||
        config.SECURITY_WHITELIST.includes(userId)
    );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
==================================================
JOURNAL DES ACTIONS
==================================================
*/

const journals = new Map(); // "guild:executor" -> { entries: [] }
const incidents = new Map(); // "guild:executor" -> incident en cours

function serializeEntry(entry, guild) {
    const changes = (entry.changes || []).map((c) => ({ key: c.key, old: c.old, new: c.new }));
    const name = (key) => changes.find((c) => c.key === key);
    let extra = null;
    if (entry.extra) {
        const isRole = entry.extra.constructor?.name === "Role" || guild.roles.cache.has(entry.extra.id);
        extra = {
            id: entry.extra.id ?? null,
            type: entry.extra.type !== undefined ? Number(entry.extra.type) : isRole ? 0 : 1,
            removed: entry.extra.removed ?? null
        };
    }
    return {
        id: entry.id,
        action: entry.action,
        at: entry.createdTimestamp,
        executorId: entry.executorId,
        targetId: entry.targetId,
        targetName:
            entry.target?.name ??
            entry.target?.tag ??
            entry.target?.username ??
            name("name")?.old ??
            name("name")?.new ??
            null,
        changes,
        extra
    };
}

// Faut-il déclencher un incident ? Renvoie la raison ou null
function detectTrigger(record, journal, guild) {
    const { action, changes } = record;
    const change = (key) => changes.find((c) => c.key === key);

    if (action === AuditLogEvent.BotAdd)
        return `ajout du bot ${record.targetName ?? record.targetId} sans autorisation`;

    if (action === AuditLogEvent.RoleUpdate) {
        const perms = change("permissions");
        if (perms && !hasDangerous(perms.old) && hasDangerous(perms.new)) {
            return `permissions dangereuses ajoutées au rôle @${record.targetName ?? record.targetId}`;
        }
    }

    if (action === AuditLogEvent.MemberRoleUpdate) {
        const added = change("$add")?.new || [];
        const dangerous = added.filter((r) => {
            const role = guild.roles.cache.get(r.id);
            return role && hasDangerous(role.permissions.bitfield);
        });
        if (dangerous.length) {
            return `rôle dangereux (${dangerous.map((r) => `@${r.name}`).join(", ")}) donné à ${record.targetName ?? record.targetId}`;
        }
    }

    if (action === AuditLogEvent.GuildUpdate && change("vanity_url_code")) {
        return "modification de l'URL personnalisée du serveur";
    }

    const limit = CONFIG.LIMITS[action];
    if (limit) {
        const recent = journal.entries.filter((e) => e.action === action && record.at - e.at < CONFIG.WINDOW).length;
        if (recent >= limit)
            return `${recent} actions « ${AuditLogEvent[action]} » en moins de ${CONFIG.WINDOW / 1000} s`;
    }
    return null;
}

/*
==================================================
SANCTION
==================================================
*/

async function punish(member, reason) {
    if (!member) return { ok: false, detail: "l'auteur n'est plus sur le serveur" };
    if (member.bannable) {
        try {
            await member.ban({ deleteMessageSeconds: 0, reason: `Irisiabot Anti-Nuke : ${reason}` });
            return { ok: true, method: "banni du serveur" };
        } catch (e) {
            // on tente le retrait des rôles ci-dessous
            console.log("❌ Ban impossible :", e.message);
        }
    }
    if (member.manageable) {
        try {
            await member.roles.set([], `Irisiabot Anti-Nuke : ${reason}`);
            return { ok: true, method: "impossible de bannir : tous ses rôles ont été retirés" };
        } catch {
            // échec ci-dessous
        }
    }
    return {
        ok: false,
        detail: "impossible de le sanctionner : son rôle est au-dessus de celui du bot. Monte le rôle du bot tout en haut !"
    };
}

/*
==================================================
INCIDENT : sanction → restauration → rapport
==================================================
*/

async function handleIncident(client, economy, guild, executorId, trigger) {
    const key = `${guild.id}:${executorId}`;
    const journal = journals.get(key);
    const incident = {
        guild,
        trigger,
        detectedAt: Date.now(),
        startedAt: Math.min(...journal.entries.map((e) => e.at))
    };
    incidents.set(key, incident);
    console.log(`🚨 [${guild.name}] Incident : ${trigger} (auteur ${executorId})`);

    try {
        // Infos sur l'auteur AVANT de le bannir (ses rôles disparaissent ensuite)
        const member = await guild.members.fetch(executorId).catch(() => null);
        const user = member?.user ?? (await client.users.fetch(executorId).catch(() => null));
        incident.executor = {
            id: executorId,
            tag: user?.tag ?? executorId,
            bot: user?.bot ?? false,
            createdAt: user?.createdTimestamp ?? null,
            joinedAt: member?.joinedTimestamp ?? null,
            roles: member ? member.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.name) : []
        };

        incident.sanction = await punish(member, trigger);
        incident.sanctionedAt = Date.now();

        const inviter = await getInviter(guild, economy, executorId, incident.executor.bot);
        if (inviter?.inviterId) {
            const inviterUser = await client.users.fetch(inviter.inviterId).catch(() => null);
            inviter.inviterTag = inviterUser?.tag ?? null;
        }
        incident.inviter = inviter;

        // Laisser arriver les dernières actions déjà envoyées par l'attaquant
        await sleep(CONFIG.GRACE);

        incident.restoreStartedAt = Date.now();
        const processed = new Set();
        const results = [];
        for (let pass = 0; pass < 3; pass++) {
            const todo = journal.entries.filter((e) => !processed.has(e.id));
            if (todo.length === 0) break;
            for (const e of todo) processed.add(e.id);
            results.push(...(await restoreIncident(guild, todo)).results);
        }

        incident.entries = journal.entries.filter((e) => processed.has(e.id)).sort((a, b) => a.at - b.at);
        incident.lastActionAt = Math.max(...incident.entries.map((e) => e.at));
        incident.results = results;
        incident.finishedAt = Date.now();

        const sent = await sendReport(client, incident);
        console.log(
            `🛡️ [${guild.name}] Incident terminé : ${incident.entries.length} actions annulées en ` +
                `${incident.finishedAt - incident.restoreStartedAt} ms, rapport ${sent ? "envoyé" : "NON envoyé"}`
        );
    } catch (error) {
        console.error("❌ Erreur pendant l'incident :", error);
    } finally {
        incidents.delete(key);
        journals.delete(key);
    }
}

/*
==================================================
LOCKDOWN MANUEL (/security lockdown et unlock)
==================================================
*/

const LOCK_DIR = path.join(config.BACKUP_DIR, "lockdown");
const lockFile = (guildId) => path.join(LOCK_DIR, `${guildId}.json`);
const isLocked = (guildId) => fs.existsSync(lockFile(guildId));

async function lockdown(guild, reason = "Anti-Nuke") {
    if (isLocked(guild.id)) return 0;
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
DÉMARRAGE
==================================================
*/

function startAntiNuke(client, economy) {
    startSnapshots(client);
    startInviteTracking(client, economy);

    // Sauvegarde automatique des rôles et salons (secours si une suppression n'a pas été capturée)
    const autoBackup = async () => {
        for (const guild of client.guilds.cache.values()) {
            await createBackup(guild).catch((e) => console.log(`⚠️ Sauvegarde de ${guild.name} : ${e.message}`));
        }
    };
    client.once(Events.ClientReady, autoBackup);
    setInterval(autoBackup, 6 * 60 * 60 * 1000).unref();

    client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
        try {
            const { executorId, action } = entry;
            if (!executorId || !TRACKED.has(action) || isTrusted(guild, executorId)) return;

            const key = `${guild.id}:${executorId}`;
            if (!journals.has(key)) journals.set(key, { entries: [] });
            const journal = journals.get(key);
            const record = serializeEntry(entry, guild);
            journal.entries.push(record);

            // Incident déjà en cours : l'action sera annulée avec les autres
            if (incidents.has(key)) return;

            const trigger = detectTrigger(record, journal, guild);
            if (trigger) handleIncident(client, economy, guild, executorId, trigger);
        } catch (error) {
            console.log("⚠️ Erreur anti-nuke :", error.message);
        }
    });

    // Oubli des actions anciennes (hors incident)
    setInterval(() => {
        const now = Date.now();
        for (const [key, journal] of journals) {
            if (incidents.has(key)) continue;
            journal.entries = journal.entries.filter((e) => now - e.at < CONFIG.JOURNAL_TTL);
            if (journal.entries.length === 0) journals.delete(key);
        }
    }, 60 * 1000).unref();

    console.log(`🛡️ Anti-Nuke V4 activé (${config.SECURITY_WHITELIST.length} membre(s) en liste blanche)`);
}

module.exports = { startAntiNuke, lockdown, unlock, isLocked, CONFIG, detectTrigger, serializeEntry };
