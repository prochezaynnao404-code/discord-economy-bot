const { AuditLogEvent, Events } = require("discord.js");

/*
==================================================
SUIVI DES INVITATIONS
Retient, pour chaque membre qui arrive, l'invitation utilisée et
qui l'a créée. Pour un bot : qui l'a ajouté (audit log).
Nécessite l'intent GuildInvites et la permission "Gérer le serveur".
==================================================
*/

const cache = new Map(); // guildId -> Map(code -> { uses, inviterId })

async function loadInvites(guild) {
    try {
        const invites = await guild.invites.fetch();
        cache.set(guild.id, new Map(invites.map((i) => [i.code, { uses: i.uses ?? 0, inviterId: i.inviterId }])));
    } catch (e) {
        console.log(`⚠️ Invitations de ${guild.name} illisibles (permission "Gérer le serveur" ?) : ${e.message}`);
    }
}

async function findBotAdder(guild, botId) {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 50 }).catch(() => null);
    const entry = logs?.entries.find((e) => e.targetId === botId);
    return entry ? { inviterId: entry.executorId, code: null, joinedAt: entry.createdTimestamp } : null;
}

function startInviteTracking(client, economy) {
    client.once(Events.ClientReady, async () => {
        for (const guild of client.guilds.cache.values()) await loadInvites(guild);
    });
    client.on(Events.GuildCreate, (guild) => loadInvites(guild));

    client.on(Events.InviteCreate, (invite) => {
        if (!invite.guild) return;
        if (!cache.has(invite.guild.id)) cache.set(invite.guild.id, new Map());
        cache.get(invite.guild.id).set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviterId });
    });

    client.on(Events.InviteDelete, (invite) => {
        // On garde l'invitation : elle a pu être supprimée parce qu'elle venait d'atteindre sa limite
        const known = invite.guild && cache.get(invite.guild.id)?.get(invite.code);
        if (known) known.deleted = true;
    });

    client.on(Events.GuildMemberAdd, async (member) => {
        const guild = member.guild;
        try {
            if (member.user.bot) {
                const adder = await findBotAdder(guild, member.id);
                if (adder) economy.recordJoin(guild.id, member.id, adder.inviterId, "bot", Date.now());
                return;
            }

            const before = cache.get(guild.id) || new Map();
            const invites = await guild.invites.fetch().catch(() => null);
            let used = null;

            if (invites) {
                for (const invite of invites.values()) {
                    if ((invite.uses ?? 0) > (before.get(invite.code)?.uses ?? 0)) {
                        used = { code: invite.code, inviterId: invite.inviterId };
                        break;
                    }
                }
                // Invitation à usage unique : elle disparaît dès qu'elle est utilisée
                if (!used) {
                    for (const [code, info] of before) {
                        if (!invites.has(code)) {
                            used = { code, inviterId: info.inviterId };
                            break;
                        }
                    }
                }
                cache.set(
                    guild.id,
                    new Map(invites.map((i) => [i.code, { uses: i.uses ?? 0, inviterId: i.inviterId }]))
                );
            }
            if (!used && guild.vanityURLCode) used = { code: guild.vanityURLCode, inviterId: null };

            economy.recordJoin(guild.id, member.id, used?.inviterId ?? null, used?.code ?? null, Date.now());
        } catch (e) {
            console.log("⚠️ Suivi d'invitation :", e.message);
        }
    });
}

// Qui a fait venir ce membre ? { inviterId, code, joinedAt } ou null
async function getInviter(guild, economy, userId, isBot) {
    const known = economy.getJoin(guild.id, userId);
    if (known) return known;
    if (isBot) return findBotAdder(guild, userId);
    return null;
}

module.exports = { startInviteTracking, getInviter };
