const { Events } = require("discord.js");

/*
==================================================
CAPTURE DES ÉLÉMENTS SUPPRIMÉS
Quand un salon, un rôle ou un emoji est supprimé, Discord envoie
encore l'objet complet : on le garde en mémoire pour pouvoir le
recréer à l'identique si la suppression fait partie d'une attaque.
==================================================
*/

const TTL = 30 * 60 * 1000;
const deleted = new Map(); // "guildId:id" -> { kind, data, at }

function serializeChannel(channel) {
    return {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId ?? null,
        position: channel.rawPosition ?? channel.position ?? 0,
        topic: channel.topic ?? null,
        nsfw: channel.nsfw ?? false,
        rateLimitPerUser: channel.rateLimitPerUser ?? 0,
        bitrate: channel.bitrate ?? null,
        userLimit: channel.userLimit ?? null,
        rtcRegion: channel.rtcRegion ?? null,
        permissionOverwrites: channel.permissionOverwrites
            ? channel.permissionOverwrites.cache.map((o) => ({
                  id: o.id,
                  type: o.type,
                  allow: o.allow.bitfield.toString(),
                  deny: o.deny.bitfield.toString()
              }))
            : []
    };
}

function serializeRole(role) {
    return {
        id: role.id,
        everyone: role.id === role.guild.id,
        managed: role.managed,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        position: role.position,
        mentionable: role.mentionable,
        permissions: role.permissions.bitfield.toString(),
        unicodeEmoji: role.unicodeEmoji ?? null
    };
}

function remember(guildId, id, kind, data) {
    deleted.set(`${guildId}:${id}`, { kind, data, at: Date.now() });
}

function getDeleted(guildId, id) {
    return deleted.get(`${guildId}:${id}`)?.data ?? null;
}

function startSnapshots(client) {
    client.on(Events.ChannelDelete, (channel) => {
        if (channel.guild) remember(channel.guild.id, channel.id, "channel", serializeChannel(channel));
    });

    client.on(Events.GuildRoleDelete, (role) => {
        // Les membres gardent encore l'ID du rôle supprimé dans leur liste interne
        const members = role.guild.members.cache.filter((m) => m._roles.includes(role.id)).map((m) => m.id);
        remember(role.guild.id, role.id, "role", { ...serializeRole(role), members });
    });

    client.on(Events.GuildEmojiDelete, (emoji) => {
        remember(emoji.guild.id, emoji.id, "emoji", {
            id: emoji.id,
            name: emoji.name,
            url: emoji.imageURL({ extension: emoji.animated ? "gif" : "png", size: 128 })
        });
    });

    // Charger tous les membres permet de savoir qui avait un rôle s'il est supprimé
    client.once(Events.ClientReady, async () => {
        for (const guild of client.guilds.cache.values()) {
            await guild.members
                .fetch()
                .catch((e) => console.log(`⚠️ Membres de ${guild.name} non chargés : ${e.message}`));
        }
    });

    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of deleted) if (now - value.at > TTL) deleted.delete(key);
    }, 60 * 1000).unref();
}

module.exports = { startSnapshots, getDeleted, serializeChannel, serializeRole };
