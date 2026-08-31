const {
    AuditLogEvent
} = require("discord.js");

/*
==================================================
IRISIABOT ANTI-NUKE V2
==================================================
*/

const OWNER_ID = "1184567704133324891";

const CONFIG = {

    // Fenêtre pendant laquelle les actions sont comptées
    WINDOW: 10000,

    // Nombre maximum d'actions dans la fenêtre
    LIMITS: {

        [AuditLogEvent.ChannelDelete]: 3,

        [AuditLogEvent.ChannelCreate]: 5,

        [AuditLogEvent.RoleDelete]: 3,

        [AuditLogEvent.RoleCreate]: 5,

        [AuditLogEvent.MemberBanAdd]: 3,

        [AuditLogEvent.MemberKick]: 3

    },

    // Sanction
    PUNISHMENT: "ban",

    // Verrouillage du serveur
    LOCKDOWN: true

};

/*
==================================================
COMPTEURS
==================================================
*/

const actions = new Map();

/*
==================================================
ENTRÉES D'AUDIT LOG DÉJÀ TRAITÉES
==================================================
*/

const processedEntries = new Set();

/*
==================================================
UTILITAIRE
==================================================
*/

function getKey(
    guildId,
    executorId,
    action
) {

    return `${guildId}:${executorId}:${action}`;

}

/*
==================================================
ENREGISTRER UNE ACTION
==================================================
*/

function registerAction(
    guild,
    executorId,
    action
) {

    const key =
        getKey(
            guild.id,
            executorId,
            action
        );

    const now =
        Date.now();

    let list =
        actions.get(key) || [];

    list =
        list.filter(
            timestamp =>
                now - timestamp <
                CONFIG.WINDOW
        );

    list.push(now);

    actions.set(
        key,
        list
    );

    return list.length;

}

/*
==================================================
LOCKDOWN
==================================================
*/

async function lockdown(guild) {

    if (!CONFIG.LOCKDOWN) {
        return;
    }

    console.log(
        `🔒 LOCKDOWN : ${guild.name}`
    );

    for (
        const channel
        of guild.channels.cache.values()
    ) {

        try {

            if (
                !channel.permissionOverwrites
            ) {
                continue;
            }

            await channel.permissionOverwrites.edit(
                guild.roles.everyone,
                {
                    SendMessages: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false
                },
                {
                    reason:
                        "Irisiabot Anti-Nuke Lockdown"
                }
            );

        } catch (error) {

            console.log(
                `⚠️ Lockdown impossible pour ${channel.name}:`,
                error.message
            );

        }

    }

}

/*
==================================================
SANCTION
==================================================
*/

async function punish(
    guild,
    executorId,
    reason
) {

    // Protection du propriétaire
    if (
        executorId === OWNER_ID ||
        executorId === guild.ownerId
    ) {

        console.log(
            `👑 Action ignorée pour le propriétaire : ${executorId}`
        );

        return;

    }

    // Protection d'Irisiabot
    if (
        executorId === guild.client.user.id
    ) {

        return;

    }

    let executor;

    try {

        executor =
            await guild.members.fetch(
                executorId
            );

    } catch (error) {

        console.log(
            `⚠️ Impossible de récupérer ${executorId}:`,
            error.message
        );

        return;

    }

    console.log(
        `🚨 ANTI-NUKE : ${executor.user.tag}`
    );

    console.log(
        `📛 Raison : ${reason}`
    );

    /*
    ==============================================
    LE BOT NE PEUT PAS AGIR
    ==============================================
    */

    if (
        !executor.bannable
    ) {

        console.log(
            `❌ Irisiabot ne peut pas bannir ${executor.user.tag}`
        );

        await lockdown(guild);

        return;

    }

    /*
    ==============================================
    BAN
    ==============================================
    */

    if (
        CONFIG.PUNISHMENT === "ban"
    ) {

        try {

            await executor.ban({

                deleteMessageSeconds: 0,

                reason:
                    `Irisiabot Anti-Nuke : ${reason}`

            });

            console.log(
                `🔨 ${executor.user.tag} BANNI`
            );

        } catch (error) {

            console.log(
                "❌ Erreur lors du ban :",
                error.message
            );

        }

    }

    /*
    ==============================================
    LOCKDOWN
    ==============================================
    */

    await lockdown(guild);

}

/*
==================================================
VÉRIFIER L'AUDIT LOG
==================================================
*/

async function checkAuditLog(
    guild,
    action
) {

    try {

        const logs =
            await guild.fetchAuditLogs({

                type: action,

                limit: 10

            });

        for (
            const entry
            of logs.entries.values()
        ) {

            /*
            ======================================
            IGNORER LES ENTRÉES DÉJÀ TRAITÉES
            ======================================
            */

            if (
                processedEntries.has(entry.id)
            ) {

                continue;

            }

            /*
            ======================================
            IGNORER LES ACTIONS TROP ANCIENNES
            ======================================
            */

            if (
                Date.now() -
                entry.createdTimestamp >
                10000
            ) {

                processedEntries.add(
                    entry.id
                );

                continue;

            }

            /*
            ======================================
            MARQUER COMME TRAITÉE
            ======================================
            */

            processedEntries.add(
                entry.id
            );

            const executorId =
                entry.executorId;

            if (!executorId) {
                continue;
            }

            /*
            ======================================
            IGNORER IRISIABOT
            ======================================
            */

            if (
                executorId ===
                guild.client.user.id
            ) {

                continue;

            }

            /*
            ======================================
            COMPTER L'ACTION
            ======================================
            */

            const count =
                registerAction(
                    guild,
                    executorId,
                    action
                );

            const limit =
                CONFIG.LIMITS[action];

            console.log(
                `🛡️ Action ${action} : ${count}/${limit}`
            );

            /*
            ======================================
            DÉTECTION NUKE
            ======================================
            */

            if (
                count >= limit
            ) {

                await punish(

                    guild,

                    executorId,

                    `${count} actions dangereuses détectées`

                );

            }

        }

        /*
        ==========================================
        NETTOYAGE
        ==========================================
        */

        if (
            processedEntries.size > 1000
        ) {

            processedEntries.clear();

        }

    } catch (error) {

        console.log(
            `⚠️ Erreur Audit Log ${action}:`,
            error.message
        );

    }

}

/*
==================================================
DÉMARRER L'ANTI-NUKE
==================================================
*/

function startAntiNuke(client) {

    console.log(
        "🛡️ Irisiabot Anti-Nuke V2 activé"
    );

    setInterval(
        async () => {

            for (
                const guild
                of client.guilds.cache.values()
            ) {

                await checkAuditLog(
                    guild,
                    AuditLogEvent.ChannelDelete
                );

                await checkAuditLog(
                    guild,
                    AuditLogEvent.ChannelCreate
                );

                await checkAuditLog(
                    guild,
                    AuditLogEvent.RoleDelete
                );

                await checkAuditLog(
                    guild,
                    AuditLogEvent.RoleCreate
                );

                await checkAuditLog(
                    guild,
                    AuditLogEvent.MemberBanAdd
                );

                await checkAuditLog(
                    guild,
                    AuditLogEvent.MemberKick
                );

            }

        },

        2000
    );

}

/*
==================================================
PROTECTION CONTRE L'AJOUT DE BOTS
==================================================
*/

function startBotProtection(client) {

    console.log(
        "🤖 Protection des bots activée"
    );

    client.on(
        "guildMemberAdd",

        async member => {

            if (
                !member.user.bot
            ) {

                return;

            }

            const guild =
                member.guild;

            console.log(
                `🤖 Nouveau bot : ${member.user.tag}`
            );

            try {

                const logs =
                    await guild.fetchAuditLogs({

                        type:
                            AuditLogEvent.BotAdd,

                        limit: 5

                    });

                const entry =
                    logs.entries.first();

                if (!entry) {
                    return;
                }

                /*
                ==================================
                ACTION TROP ANCIENNE
                ==================================
                */

                if (
                    Date.now() -
                    entry.createdTimestamp >
                    10000
                ) {

                    return;

                }

                const executorId =
                    entry.executorId;

                if (!executorId) {
                    return;
                }

                /*
                ==================================
                IGNORER PROPRIÉTAIRE
                ==================================
                */

                if (
                    executorId === OWNER_ID ||
                    executorId === guild.ownerId ||
                    executorId === client.user.id
                ) {

                    return;

                }

                /*
                ==================================
                SUPPRIMER LE BOT
                ==================================
                */

                if (
                    member.bannable
                ) {

                    await member.ban({

                        deleteMessageSeconds: 0,

                        reason:
                            "Irisiabot Anti-Nuke : bot ajouté sans autorisation"

                    });

                    console.log(
                        `🤖 Bot ${member.user.tag} supprimé`
                    );

                }

                /*
                ==================================
                SANCTIONNER L'AJOUTEUR
                ==================================
                */

                await punish(

                    guild,

                    executorId,

                    "Ajout d'un bot non autorisé"

                );

            } catch (error) {

                console.log(
                    "⚠️ Erreur protection bot :",
                    error.message
                );

            }

        }

    );

}

/*
==================================================
EXPORT
==================================================
*/

module.exports = {

    startAntiNuke,

    startBotProtection,

    lockdown,

    CONFIG

};