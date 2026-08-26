const {
    AuditLogEvent,
    PermissionsBitField,
    EmbedBuilder
} = require("discord.js");

const ACTIONS = {
    CHANNEL_DELETE: {
        event: AuditLogEvent.ChannelDelete,
        name: "suppression de salons",
        threshold: 3
    },

    CHANNEL_CREATE: {
        event: AuditLogEvent.ChannelCreate,
        name: "création massive de salons",
        threshold: 5
    },

    CHANNEL_UPDATE: {
        event: AuditLogEvent.ChannelUpdate,
        name: "modification massive de salons",
        threshold: 8
    },

    ROLE_DELETE: {
        event: AuditLogEvent.RoleDelete,
        name: "suppression de rôles",
        threshold: 3
    },

    ROLE_CREATE: {
        event: AuditLogEvent.RoleCreate,
        name: "création massive de rôles",
        threshold: 5
    },

    ROLE_UPDATE: {
        event: AuditLogEvent.RoleUpdate,
        name: "modification massive de rôles",
        threshold: 8
    },

    BAN: {
        event: AuditLogEvent.MemberBanAdd,
        name: "bannissements massifs",
        threshold: 5
    },

    KICK: {
        event: AuditLogEvent.MemberKick,
        name: "expulsions massives",
        threshold: 5
    },

    WEBHOOK_CREATE: {
        event: AuditLogEvent.WebhookCreate,
        name: "création massive de webhooks",
        threshold: 3
    },

    BOT_ADD: {
        event: AuditLogEvent.BotAdd,
        name: "ajout massif de bots",
        threshold: 2
    },

    GUILD_UPDATE: {
        event: AuditLogEvent.GuildUpdate,
        name: "modifications du serveur",
        threshold: 3
    }
};

const activity = new Map();

const COOLDOWN = 10_000;

function getKey(guildId, userId, action) {
    return `${guildId}:${userId}:${action}`;
}

function getEnvUsers() {

    const raw =
        process.env.SECURITY_WHITELIST || "";

    return raw
        .split(",")
        .map(id => id.trim())
        .filter(Boolean);
}

function isWhitelisted(guild, userId) {

    if (!userId) return true;

    // Le propriétaire est toujours protégé
    if (guild.ownerId === userId) {
        return true;
    }

    // Utilisateurs définis dans .env
    if (getEnvUsers().includes(userId)) {
        return true;
    }

    return false;
}

async function getExecutor(guild, auditEvent) {

    try {

        const logs =
            await guild.fetchAuditLogs({
                type: auditEvent,
                limit: 10
            });

        const now = Date.now();

        const entry =
            logs.entries.find(log => {

                const age =
                    now - log.createdTimestamp;

                return age >= 0 && age < 10_000;
            });

        if (!entry) {
            return null;
        }

        return entry.executor;

    } catch (error) {

        console.error(
            "❌ Anti-Nuke Audit Log:",
            error
        );

        return null;
    }
}

function addAction(
    guildId,
    userId,
    action
) {

    const key =
        getKey(
            guildId,
            userId,
            action
        );

    const now =
        Date.now();

    let data =
        activity.get(key);

    if (!data) {

        data = {
            timestamps: [],
            warned: false
        };

        activity.set(
            key,
            data
        );
    }

    data.timestamps =
        data.timestamps.filter(
            timestamp =>
                now - timestamp < COOLDOWN
        );

    data.timestamps.push(now);

    return data.timestamps.length;
}

async function sendSecurityLog(
    guild,
    embed
) {

    const channelId =
        process.env.SECURITY_LOG_CHANNEL_ID;

    if (!channelId) return;

    const channel =
        guild.channels.cache.get(
            channelId
        );

    if (!channel) return;

    try {

        await channel.send({
            embeds: [embed]
        });

    } catch (error) {

        console.error(
            "❌ Impossible d'envoyer le log Anti-Nuke:",
            error
        );
    }
}

async function removeDangerousRoles(
    member
) {

    if (!member) return false;

    if (!member.manageable) {

        console.log(
            `⚠️ Impossible de retirer les rôles de ${member.user.tag}`
        );

        return false;
    }

    try {

        await member.roles.set(
            [],
            "Anti-Nuke : activité suspecte détectée"
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Impossible de retirer les rôles:",
            error
        );

        return false;
    }
}

async function lockdownGuild(
    guild
) {

    try {

        const everyone =
            guild.roles.everyone;

        const channels =
            guild.channels.cache;

        for (const channel of channels.values()) {

            if (
                !channel.permissionOverwrites
            ) continue;

            try {

                await channel.permissionOverwrites.edit(
                    everyone,
                    {
                        SendMessages: false,
                        AddReactions: false,
                        CreatePublicThreads: false,
                        CreatePrivateThreads: false
                    },
                    {
                        reason:
                            "Anti-Nuke : lockdown automatique"
                    }
                );

            } catch (error) {

                console.error(
                    `❌ Lockdown ${channel.name}:`,
                    error.message
                );
            }
        }

        return true;

    } catch (error) {

        console.error(
            "❌ Lockdown impossible:",
            error
        );

        return false;
    }
}

async function punishExecutor(
    guild,
    userId,
    actionName,
    count
) {

    if (!userId) return;

    if (
        isWhitelisted(
            guild,
            userId
        )
    ) {

        console.log(
            `🛡️ ${userId} est whitelisté.`
        );

        return;
    }

    let member;

    try {

        member =
            await guild.members.fetch(
                userId
            );

    } catch {

        return;
    }

    const botMember =
        guild.members.me;

    if (!botMember) return;

    // Le bot ne peut pas agir sur un rôle
    // supérieur ou égal au sien.
    if (
        member.roles.highest.position >=
        botMember.roles.highest.position
    ) {

        const embed =
            new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle("🚨 ANTI-NUKE")
                .setDescription(
                    `Une activité dangereuse a été détectée, mais je ne peux pas sanctionner ${member} car son rôle est trop haut dans la hiérarchie.`
                )
                .addFields(
                    {
                        name: "Utilisateur",
                        value:
                            `${member.user.tag}\n\`${member.id}\``
                    },
                    {
                        name: "Action",
                        value:
                            actionName
                    },
                    {
                        name: "Actions détectées",
                        value:
                            `${count}`
                    }
                )
                .setTimestamp();

        await sendSecurityLog(
            guild,
            embed
        );

        return;
    }

    const removed =
        await removeDangerousRoles(
            member
        );

    const locked =
        await lockdownGuild(
            guild
        );

    const embed =
        new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle("🚨 NUKER DÉTECTÉ")
            .setDescription(
                `Une activité dangereuse a été détectée sur le serveur.`
            )
            .addFields(
                {
                    name: "👤 Utilisateur",
                    value:
                        `${member.user.tag}\n\`${member.id}\``
                },
                {
                    name: "⚠️ Action",
                    value:
                        actionName
                },
                {
                    name: "📊 Actions détectées",
                    value:
                        `${count}`
                },
                {
                    name: "🔒 Lockdown",
                    value:
                        locked
                            ? "Activé"
                            : "Échec"
                },
                {
                    name: "⛔ Rôles retirés",
                    value:
                        removed
                            ? "Oui"
                            : "Non"
                }
            )
            .setTimestamp();

    await sendSecurityLog(
        guild,
        embed
    );
}

async function handleAction(
    guild,
    actionKey
) {

    const config =
        ACTIONS[actionKey];

    if (!config) return;

    const executor =
        await getExecutor(
            guild,
            config.event
        );

    if (!executor) {

        console.log(
            `⚠️ Impossible d'identifier l'auteur de : ${config.name}`
        );

        return;
    }

    if (
        isWhitelisted(
            guild,
            executor.id
        )
    ) {

        return;
    }

    const count =
        addAction(
            guild.id,
            executor.id,
            actionKey
        );

    console.log(
        `🛡️ Anti-Nuke : ${executor.tag} → ${config.name} (${count}/${config.threshold})`
    );

    if (
        count < config.threshold
    ) return;

    await punishExecutor(
        guild,
        executor.id,
        config.name,
        count
    );

    const key =
        getKey(
            guild.id,
            executor.id,
            actionKey
        );

    activity.delete(key);
}

function setupAntiNuke(client) {

    console.log(
        "🛡️ Anti-Nuke activé"
    );

    client.on(
        "channelDelete",
        channel => {

            if (!channel.guild) return;

            handleAction(
                channel.guild,
                "CHANNEL_DELETE"
            );
        }
    );

    client.on(
        "channelCreate",
        channel => {

            if (!channel.guild) return;

            handleAction(
                channel.guild,
                "CHANNEL_CREATE"
            );
        }
    );

    client.on(
        "channelUpdate",
        channel => {

            if (!channel.guild) return;

            handleAction(
                channel.guild,
                "CHANNEL_UPDATE"
            );
        }
    );

    client.on(
        "roleDelete",
        role => {

            handleAction(
                role.guild,
                "ROLE_DELETE"
            );
        }
    );

    client.on(
        "roleCreate",
        role => {

            handleAction(
                role.guild,
                "ROLE_CREATE"
            );
        }
    );

    client.on(
        "roleUpdate",
        role => {

            handleAction(
                role.guild,
                "ROLE_UPDATE"
            );
        }
    );

    client.on(
        "guildBanAdd",
        ban => {

            handleAction(
                ban.guild,
                "BAN"
            );
        }
    );

    client.on(
        "webhookUpdate",
        channel => {

            if (!channel.guild) return;

            handleAction(
                channel.guild,
                "WEBHOOK_CREATE"
            );
        }
    );

    client.on(
        "guildUpdate",
        guild => {

            handleAction(
                guild,
                "GUILD_UPDATE"
            );
        }
    );

    client.on(
        "guildMemberAdd",
        async member => {

            if (!member.user.bot) return;

            await handleAction(
                member.guild,
                "BOT_ADD"
            );
        }
    );

    client.on(
        "guildMemberRemove",
        async member => {

            const guild =
                member.guild;

            try {

                const logs =
                    await guild.fetchAuditLogs({
                        limit: 10
                    });

                const now =
                    Date.now();

                const entry =
                    logs.entries.find(log => {

                        const age =
                            now - log.createdTimestamp;

                        if (
                            age < 0 ||
                            age > 10_000
                        ) return false;

                        return (
                            log.targetId === member.id &&
                            (
                                log.action ===
                                    AuditLogEvent.MemberKick ||
                                log.action ===
                                    AuditLogEvent.MemberBanAdd
                            )
                        );
                    });

                if (!entry) return;

                if (
                    entry.action ===
                    AuditLogEvent.MemberBanAdd
                ) return;

                await handleAction(
                    guild,
                    "KICK"
                );

            } catch (error) {

                console.error(
                    "❌ Anti-Nuke memberRemove:",
                    error
                );
            }
        }
    );
}

module.exports = {
    setupAntiNuke
};



