const {
    AuditLogEvent,
    PermissionFlagsBits
} = require("discord.js");

/*
==================================================
IRISIABOT ANTI-NUKE
==================================================
*/

const OWNER_ID = "1184567704133324891";

/*
==================================================
CONFIGURATION
==================================================
*/

const CONFIG = {

    // Nombre maximum d'actions autorisées
    // pendant la fenêtre de temps.

    WINDOW: 10000,

    LIMITS: {

        CHANNEL_DELETE: 3,

        CHANNEL_CREATE: 5,

        ROLE_DELETE: 3,

        ROLE_CREATE: 5,

        MEMBER_BAN_ADD: 3,

        MEMBER_KICK: 3

    },

    // Sanction de l'attaquant

    PUNISHMENT: "ban",

    // Active le verrouillage après détection

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
UTILITAIRE
==================================================
*/

function getKey(guildId, executorId, action) {

    return `${guildId}:${executorId}:${action}`;

}

/*
==================================================
COMPTER UNE ACTION
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
                `⚠️ Impossible de verrouiller ${channel.name}:`,
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

    // NE JAMAIS sanctionner le propriétaire
    if (
        executorId === OWNER_ID ||
        executorId === guild.ownerId
    ) {

        console.log(
            `👑 Action ignorée : propriétaire ${executorId}`
        );

        return;

    }

    let executor;

    try {

        executor =
            await guild.members.fetch(
                executorId
            );

    } catch {

        console.log(
            `⚠️ Impossible de récupérer ${executorId}`
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
    BOT / ATTAQUANT HORS HIÉRARCHIE
    ==============================================
    */

    if (
        !executor.kickable &&
        !executor.bannable
    ) {

        console.log(
            `❌ Irisiabot ne peut pas sanctionner ${executor.user.tag}`
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
        CONFIG.PUNISHMENT === "ban" &&
        executor.bannable
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
                "❌ Erreur ban :",
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
VÉRIFIER LES AUDIT LOGS
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

                limit: 5

            });

        const entry =
            logs.entries.first();

        if (!entry) {
            return;
        }

        /*
        ==========================================
        IGNORER LES VIEILLES ACTIONS
        ==========================================
        */

        if (
            Date.now() -
            entry.createdTimestamp >
            5000
        ) {

            return;

        }

        const executorId =
            entry.executorId;

        if (!executorId) {
            return;
        }

        /*
        ==========================================
        IGNORER IRISIABOT
        ==========================================
        */

        if (
            executorId === guild.client.user.id
        ) {

            return;

        }

        const actionCount =
            registerAction(
                guild,
                executorId,
                action
            );

        const limit =
            CONFIG.LIMITS[action];

        console.log(
            `🛡️ ${action} : ${actionCount}/${limit}`
        );

        if (
            actionCount >= limit
        ) {

            await punish(

                guild,

                executorId,

                `${actionCount} actions ${action} en ${CONFIG.WINDOW / 1000}s`

            );

        }

    } catch (error) {

        console.log(
            `⚠️ Audit Log ${action} :`,
            error.message
        );

    }

}

/*
==================================================
SURVEILLANCE
==================================================
*/

function startAntiNuke(client) {

    console.log(
        "🛡️ Irisiabot Anti-Nuke activé"
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
PROTECTION AJOUT DE BOTS
==================================================
*/

function startBotProtection(client) {

    client.on(
        "guildMemberAdd",
        async member => {

            if (!member.user.bot) {
                return;
            }

            const guild =
                member.guild;

            console.log(
                `🤖 Nouveau bot détecté : ${member.user.tag}`
            );

            /*
            ======================================
            RÉCUPÉRER QUI A AJOUTÉ LE BOT
            ======================================
            */

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

                if (
                    executorId === OWNER_ID ||
                    executorId === guild.ownerId ||
                    executorId === client.user.id
                ) {

                    return;

                }

                /*
                ==================================
                SUPPRIMER LE BOT AJOUTÉ
                ==================================
                */

                if (member.bannable) {

                    await member.ban({

                        deleteMessageSeconds: 0,

                        reason:
                            "Irisiabot Anti-Nuke : bot ajouté par un utilisateur non autorisé"

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
                    "⚠️ Erreur protection bots :",
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