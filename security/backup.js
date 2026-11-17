const fs = require("fs");
const path = require("path");
const { ChannelType } = require("discord.js");

const config = require("../config");

const backupFolder = path.join(config.BACKUP_DIR, "guilds");

function backupFile(guildId) {
    return path.join(backupFolder, `${guildId}.json`);
}

/*
========================================
CRÉER UNE SAUVEGARDE
========================================
*/

async function createBackup(guild) {
    await guild.roles.fetch();
    await guild.channels.fetch();

    const backup = {
        guild: { id: guild.id, name: guild.name },
        createdAt: Date.now(),
        roles: [],
        channels: []
    };

    for (const role of guild.roles.cache.values()) {
        if (role.managed) continue; // rôles de bots/intégrations : recréés par Discord
        backup.roles.push({
            id: role.id,
            everyone: role.id === guild.id,
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            position: role.position,
            mentionable: role.mentionable,
            permissions: role.permissions.bitfield.toString()
        });
    }

    for (const channel of guild.channels.cache.values()) {
        if (channel.isThread()) continue;
        backup.channels.push({
            id: channel.id,
            name: channel.name,
            type: channel.type,
            parentId: channel.parentId,
            position: channel.rawPosition,
            nsfw: channel.nsfw ?? false,
            topic: channel.topic ?? null,
            rateLimitPerUser: channel.rateLimitPerUser ?? 0,
            bitrate: channel.bitrate ?? null,
            userLimit: channel.userLimit ?? null,
            permissionOverwrites: channel.permissionOverwrites.cache.map((o) => ({
                id: o.id,
                type: o.type,
                allow: o.allow.bitfield.toString(),
                deny: o.deny.bitfield.toString()
            }))
        });
    }

    fs.mkdirSync(backupFolder, { recursive: true });
    fs.writeFileSync(backupFile(guild.id), JSON.stringify(backup, null, 2));
    return backup;
}

/*
========================================
CHARGER UNE SAUVEGARDE
========================================
*/

function loadBackup(guildId) {
    const file = backupFile(guildId);
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        console.error("Erreur lecture backup :", error);
        return null;
    }
}

/*
========================================
RESTAURER UNE SAUVEGARDE
Recrée uniquement les rôles et salons qui ont disparu
(rien n'est supprimé ni écrasé).
========================================
*/

async function restoreBackup(guild) {
    const backup = loadBackup(guild.id);
    if (!backup) return null;

    await guild.roles.fetch();
    await guild.channels.fetch();

    const roleMap = new Map([[backup.guild.id, guild.id]]); // ancien id -> nouvel id
    const report = { roles: 0, channels: 0, errors: 0 };

    // Rôles : du plus haut au plus bas
    for (const r of [...backup.roles].sort((a, b) => b.position - a.position)) {
        if (r.everyone) continue;
        if (guild.roles.cache.has(r.id)) {
            roleMap.set(r.id, r.id);
            continue;
        }
        try {
            const role = await guild.roles.create({
                name: r.name,
                color: r.color,
                hoist: r.hoist,
                mentionable: r.mentionable,
                permissions: BigInt(r.permissions),
                reason: "Irisiabot : restauration"
            });
            roleMap.set(r.id, role.id);
            report.roles++;
        } catch (error) {
            console.log(`⚠️ Rôle ${r.name} non restauré : ${error.message}`);
            report.errors++;
        }
    }

    const channelMap = new Map();
    const overwrites = (c) =>
        c.permissionOverwrites
            .map((o) => ({ ...o, id: o.type === 0 ? roleMap.get(o.id) : o.id }))
            .filter((o) => o.id)
            .map((o) => ({ id: o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) }));

    // Catégories d'abord, puis les autres salons (pour pouvoir les ranger dedans)
    const ordered = [...backup.channels].sort(
        (a, b) =>
            (b.type === ChannelType.GuildCategory) - (a.type === ChannelType.GuildCategory) || a.position - b.position
    );

    for (const c of ordered) {
        if (guild.channels.cache.has(c.id)) {
            channelMap.set(c.id, c.id);
            continue;
        }
        try {
            const channel = await guild.channels.create({
                name: c.name,
                type: c.type,
                parent: c.parentId ? (channelMap.get(c.parentId) ?? null) : null,
                topic: c.topic ?? undefined,
                nsfw: c.nsfw,
                rateLimitPerUser: c.rateLimitPerUser || undefined,
                bitrate: c.bitrate ?? undefined,
                userLimit: c.userLimit ?? undefined,
                position: c.position,
                permissionOverwrites: overwrites(c),
                reason: "Irisiabot : restauration"
            });
            channelMap.set(c.id, channel.id);
            report.channels++;
        } catch (error) {
            console.log(`⚠️ Salon ${c.name} non restauré : ${error.message}`);
            report.errors++;
        }
    }

    return report;
}

module.exports = { createBackup, loadBackup, restoreBackup };
