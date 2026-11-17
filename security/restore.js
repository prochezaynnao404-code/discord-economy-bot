const { AuditLogEvent, ChannelType, Routes } = require("discord.js");

const { getDeleted } = require("./snapshot");
const { loadBackup } = require("./backup");

/*
==================================================
ANNULATION D'UNE ATTAQUE
Rejoue à l'envers toutes les actions de l'attaquant :
- supprime ce qu'il a créé (salons, rôles, webhooks)
- débannit les membres qu'il a bannis
- recrée les rôles (et les redonne aux membres) et salons supprimés
- annule les modifications (rôles, salons, permissions, membres, serveur)
- recrée les emojis supprimés
- renvoie une invitation aux membres expulsés/bannis
==================================================
*/

const REASON = "Irisiabot Anti-Nuke : restauration après attaque";

const before = (changes, key) => changes?.find((c) => c.key === key)?.old;
const after = (changes, key) => changes?.find((c) => c.key === key)?.new;
const has = (changes, key) => Boolean(changes?.some((c) => c.key === key));

// Données d'un salon supprimé : capture en direct > sauvegarde > audit log
function deletedChannelData(guild, entry, backup) {
    const live = getDeleted(guild.id, entry.targetId);
    if (live) return live;
    const saved = backup?.channels.find((c) => c.id === entry.targetId);
    if (saved) return saved;
    if (!before(entry.changes, "name")) return null;
    return {
        id: entry.targetId,
        name: before(entry.changes, "name"),
        type: before(entry.changes, "type") ?? ChannelType.GuildText,
        parentId: null,
        position: 0,
        nsfw: before(entry.changes, "nsfw") ?? false,
        rateLimitPerUser: before(entry.changes, "rate_limit_per_user") ?? 0,
        permissionOverwrites: before(entry.changes, "permission_overwrites") || []
    };
}

function deletedRoleData(guild, entry, backup) {
    const live = getDeleted(guild.id, entry.targetId);
    if (live) return live;
    const saved = backup?.roles.find((r) => r.id === entry.targetId);
    if (saved) return { ...saved, members: [] };
    if (!before(entry.changes, "name")) return null;
    return {
        id: entry.targetId,
        name: before(entry.changes, "name"),
        color: before(entry.changes, "color") ?? 0,
        hoist: before(entry.changes, "hoist") ?? false,
        mentionable: before(entry.changes, "mentionable") ?? false,
        permissions: before(entry.changes, "permissions") ?? "0",
        position: 1,
        members: []
    };
}

async function restoreIncident(guild, entries) {
    const results = [];
    const roleMap = new Map(); // ancien id -> nouvel id
    const channelMap = new Map();
    const victims = new Map(); // userId -> "banni" | "expulsé"
    const backup = loadBackup(guild.id);

    const attempt = async (category, label, fn) => {
        try {
            const detail = await fn();
            results.push({ category, label, ok: true, detail: detail || null });
        } catch (error) {
            results.push({ category, label, ok: false, detail: error.message });
        }
    };

    const of = (...actions) => entries.filter((e) => actions.includes(e.action));
    const roleId = (id) => roleMap.get(id) ?? id;
    const channelId = (id) => channelMap.get(id) ?? id;
    const nameOf = (e) => e.targetName || after(e.changes, "name") || before(e.changes, "name") || e.targetId;

    // ---------- 1. Supprimer ce que l'attaquant a créé ----------
    // Les salons d'abord, les catégories ensuite
    const created = of(AuditLogEvent.ChannelCreate).sort(
        (a, b) =>
            (after(a.changes, "type") === ChannelType.GuildCategory) -
            (after(b.changes, "type") === ChannelType.GuildCategory)
    );
    for (const e of created) {
        await attempt("createdChannels", `#${nameOf(e)}`, async () => {
            const channel = guild.channels.cache.get(e.targetId);
            if (!channel) return "déjà supprimé";
            await channel.delete(REASON);
        });
    }

    for (const e of of(AuditLogEvent.RoleCreate)) {
        await attempt("createdRoles", `@${nameOf(e)}`, async () => {
            const role = guild.roles.cache.get(e.targetId);
            if (!role) return "déjà supprimé";
            await role.delete(REASON);
        });
    }

    for (const e of of(AuditLogEvent.WebhookCreate)) {
        await attempt("webhooks", nameOf(e), async () => {
            const webhook = await guild.client.fetchWebhook(e.targetId).catch(() => null);
            if (!webhook) return "déjà supprimé";
            await webhook.delete(REASON);
        });
    }

    // Bots ajoutés par l'attaquant : bannis
    for (const e of of(AuditLogEvent.BotAdd)) {
        await attempt("bots", nameOf(e), async () => {
            const bot = await guild.members.fetch(e.targetId).catch(() => null);
            if (!bot) return "déjà parti";
            await bot.ban({ reason: REASON });
        });
    }

    // ---------- 2. Débannir ----------
    for (const e of of(AuditLogEvent.MemberBanAdd)) {
        await attempt("unbans", e.targetName || e.targetId, async () => {
            await guild.members.unban(e.targetId, REASON);
            victims.set(e.targetId, "banni");
        });
    }
    for (const e of of(AuditLogEvent.MemberKick)) victims.set(e.targetId, "expulsé");

    // ---------- 3. Recréer les rôles supprimés ----------
    const deletedRoles = of(AuditLogEvent.RoleDelete)
        .map((e) => ({ e, data: deletedRoleData(guild, e, backup) }))
        .sort((a, b) => (b.data?.position ?? 0) - (a.data?.position ?? 0));

    for (const { e, data } of deletedRoles) {
        await attempt("roles", `@${data?.name ?? e.targetId}`, async () => {
            if (!data) throw new Error("données du rôle introuvables");
            const role = await guild.roles.create({
                name: data.name,
                color: data.color,
                hoist: data.hoist,
                mentionable: data.mentionable,
                permissions: BigInt(data.permissions),
                reason: REASON
            });
            roleMap.set(data.id, role.id);

            // Redonner le rôle à ceux qui l'avaient
            let given = 0;
            for (const memberId of data.members || []) {
                const member = await guild.members.fetch(memberId).catch(() => null);
                if (
                    member &&
                    (await member.roles
                        .add(role, REASON)
                        .then(() => true)
                        .catch(() => false))
                )
                    given++;
            }
            return data.members?.length ? `rendu à ${given}/${data.members.length} membre(s)` : null;
        });
    }

    // Remettre les rôles recréés à leur place (au mieux)
    if (roleMap.size > 0) {
        const positions = deletedRoles
            .filter(({ data }) => data && roleMap.has(data.id))
            .map(({ data }) => ({ role: roleMap.get(data.id), position: Math.max(1, data.position) }));
        await guild.roles.setPositions(positions).catch(() => {});
    }

    // ---------- 4. Recréer les salons supprimés ----------
    const deletedChannels = of(AuditLogEvent.ChannelDelete)
        .map((e) => ({ e, data: deletedChannelData(guild, e, backup) }))
        .sort(
            (a, b) =>
                (b.data?.type === ChannelType.GuildCategory) - (a.data?.type === ChannelType.GuildCategory) ||
                (a.data?.position ?? 0) - (b.data?.position ?? 0)
        );

    for (const { e, data } of deletedChannels) {
        await attempt("channels", `#${data?.name ?? e.targetId}`, async () => {
            if (!data) throw new Error("données du salon introuvables");
            const overwrites = (data.permissionOverwrites || [])
                .map((o) => ({ ...o, id: o.type === 0 ? roleId(o.id) : o.id }))
                .filter((o) => o.type !== 0 || guild.roles.cache.has(o.id) || o.id === guild.id)
                .map((o) => ({ id: o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) }));
            const base = {
                name: data.name,
                type: data.type,
                parent: data.parentId ? channelId(data.parentId) : null,
                permissionOverwrites: overwrites,
                reason: REASON
            };
            let channel;
            try {
                channel = await guild.channels.create({
                    ...base,
                    topic: data.topic ?? undefined,
                    nsfw: data.nsfw,
                    rateLimitPerUser: data.rateLimitPerUser || undefined,
                    bitrate: data.bitrate ?? undefined,
                    userLimit: data.userLimit ?? undefined,
                    position: data.position
                });
            } catch {
                // Ex : débit audio trop élevé si le serveur a perdu des boosts
                channel = await guild.channels.create(base);
            }
            channelMap.set(data.id, channel.id);
        });
    }

    // ---------- 5. Annuler les modifications (de la plus récente à la plus ancienne) ----------
    const updates = of(
        AuditLogEvent.RoleUpdate,
        AuditLogEvent.ChannelUpdate,
        AuditLogEvent.ChannelOverwriteCreate,
        AuditLogEvent.ChannelOverwriteUpdate,
        AuditLogEvent.ChannelOverwriteDelete,
        AuditLogEvent.MemberRoleUpdate,
        AuditLogEvent.MemberUpdate
    ).sort((a, b) => b.at - a.at);

    for (const e of updates) {
        const c = e.changes;

        if (e.action === AuditLogEvent.RoleUpdate) {
            await attempt("updates", `Rôle @${nameOf(e)}`, async () => {
                const role = guild.roles.cache.get(roleId(e.targetId));
                if (!role) throw new Error("rôle introuvable");
                const edit = {};
                if (has(c, "name")) edit.name = before(c, "name");
                if (has(c, "color")) edit.color = before(c, "color");
                if (has(c, "hoist")) edit.hoist = before(c, "hoist");
                if (has(c, "mentionable")) edit.mentionable = before(c, "mentionable");
                if (has(c, "permissions")) edit.permissions = BigInt(before(c, "permissions") ?? 0);
                await role.edit({ ...edit, reason: REASON });
            });
        }

        if (e.action === AuditLogEvent.ChannelUpdate) {
            await attempt("updates", `Salon #${nameOf(e)}`, async () => {
                const channel = guild.channels.cache.get(channelId(e.targetId));
                if (!channel) throw new Error("salon introuvable");
                const keys = {
                    name: "name",
                    topic: "topic",
                    nsfw: "nsfw",
                    rate_limit_per_user: "rateLimitPerUser",
                    bitrate: "bitrate",
                    user_limit: "userLimit",
                    rtc_region: "rtcRegion"
                };
                const edit = {};
                for (const [raw, prop] of Object.entries(keys)) if (has(c, raw)) edit[prop] = before(c, raw) ?? null;
                await channel.edit({ ...edit, reason: REASON });
            });
        }

        if (
            [
                AuditLogEvent.ChannelOverwriteCreate,
                AuditLogEvent.ChannelOverwriteUpdate,
                AuditLogEvent.ChannelOverwriteDelete
            ].includes(e.action)
        ) {
            await attempt("updates", `Permissions de #${nameOf(e)}`, async () => {
                const channel = guild.channels.cache.get(channelId(e.targetId));
                if (!channel) throw new Error("salon introuvable");
                const targetId = e.extra?.type === 0 || e.extra?.type === "0" ? roleId(e.extra.id) : e.extra?.id;
                if (!targetId) throw new Error("cible de la permission inconnue");
                const route = Routes.channelPermission(channel.id, targetId);

                if (e.action === AuditLogEvent.ChannelOverwriteCreate) {
                    await guild.client.rest.delete(route, { reason: REASON });
                    return;
                }
                const current = channel.permissionOverwrites.cache.get(targetId);
                const body = {
                    type: Number(before(c, "type") ?? e.extra?.type ?? current?.type ?? 0),
                    allow: String(before(c, "allow") ?? current?.allow.bitfield ?? 0),
                    deny: String(before(c, "deny") ?? current?.deny.bitfield ?? 0)
                };
                await guild.client.rest.put(route, { body, reason: REASON });
            });
        }

        if (e.action === AuditLogEvent.MemberRoleUpdate) {
            await attempt("updates", `Rôles de ${e.targetName || e.targetId}`, async () => {
                const member = await guild.members.fetch(e.targetId).catch(() => null);
                if (!member) return "membre parti";
                const added = (after(c, "$add") || [])
                    .map((r) => roleId(r.id))
                    .filter((id) => guild.roles.cache.has(id));
                const removed = (after(c, "$remove") || [])
                    .map((r) => roleId(r.id))
                    .filter((id) => guild.roles.cache.has(id));
                if (added.length) await member.roles.remove(added, REASON);
                if (removed.length) await member.roles.add(removed, REASON);
            });
        }

        if (e.action === AuditLogEvent.MemberUpdate) {
            await attempt("updates", `Membre ${e.targetName || e.targetId}`, async () => {
                const member = await guild.members.fetch(e.targetId).catch(() => null);
                if (!member) return "membre parti";
                if (has(c, "nick")) await member.setNickname(before(c, "nick") ?? null, REASON);
                if (has(c, "communication_disabled_until") && !before(c, "communication_disabled_until")) {
                    await member.timeout(null, REASON);
                }
            });
        }
    }

    // ---------- 6. Paramètres du serveur ----------
    for (const e of of(AuditLogEvent.GuildUpdate)) {
        const c = e.changes;
        const keys = {
            name: "name",
            description: "description",
            verification_level: "verificationLevel",
            explicit_content_filter: "explicitContentFilter",
            default_message_notifications: "defaultMessageNotifications",
            afk_timeout: "afkTimeout"
        };
        const edit = {};
        for (const [raw, prop] of Object.entries(keys)) if (has(c, raw)) edit[prop] = before(c, raw);
        for (const [raw, prop] of [
            ["afk_channel_id", "afkChannel"],
            ["system_channel_id", "systemChannel"],
            ["rules_channel_id", "rulesChannel"]
        ]) {
            if (has(c, raw)) edit[prop] = before(c, raw) ? channelId(before(c, raw)) : null;
        }
        if (Object.keys(edit).length) {
            await attempt("guild", "Paramètres du serveur", () => guild.edit({ ...edit, reason: REASON }));
        }
        for (const key of ["icon_hash", "banner_hash", "splash_hash", "vanity_url_code"]) {
            if (has(c, key))
                results.push({
                    category: "irreversible",
                    label: `Serveur : ${key}`,
                    ok: false,
                    detail: "à remettre à la main"
                });
        }
    }

    // ---------- 7. Emojis supprimés ----------
    for (const e of of(AuditLogEvent.EmojiDelete)) {
        const data = getDeleted(guild.id, e.targetId);
        await attempt("emojis", `:${data?.name ?? before(e.changes, "name") ?? e.targetId}:`, async () => {
            if (!data) throw new Error("image de l'emoji introuvable");
            await guild.emojis.create({ attachment: data.url, name: data.name, reason: REASON });
        });
    }

    // ---------- 8. Ce qui ne peut pas être annulé ----------
    for (const e of of(AuditLogEvent.MemberPrune)) {
        results.push({
            category: "irreversible",
            label: `Purge de ${e.extra?.removed ?? "?"} membre(s)`,
            ok: false,
            detail: "les membres purgés doivent revenir par invitation"
        });
    }

    // ---------- 9. Renvoyer une invitation aux victimes ----------
    if (victims.size > 0) {
        await attempt("invites", `${victims.size} membre(s) expulsé(s)/banni(s)`, async () => {
            const channel = guild.channels.cache.find(
                (ch) =>
                    ch.type === ChannelType.GuildText &&
                    ch.permissionsFor(guild.members.me)?.has(["CreateInstantInvite", "ViewChannel"])
            );
            if (!channel) throw new Error("aucun salon pour créer une invitation");
            const invite = await channel.createInvite({
                maxAge: 7 * 24 * 3600,
                maxUses: victims.size * 2,
                unique: true,
                reason: REASON
            });
            let sent = 0;
            for (const [userId, what] of victims) {
                const user = await guild.client.users.fetch(userId).catch(() => null);
                const ok = await user
                    ?.send(
                        `🛡️ Tu as été ${what} de **${guild.name}** lors d'une attaque, qui a été neutralisée.\n` +
                            `Tu peux revenir avec cette invitation : ${invite.url}`
                    )
                    .then(() => true)
                    .catch(() => false);
                if (ok) sent++;
            }
            return `${invite.url} — envoyée en MP à ${sent}/${victims.size}`;
        });
    }

    return { results, roleMap, channelMap };
}

module.exports = { restoreIncident };
