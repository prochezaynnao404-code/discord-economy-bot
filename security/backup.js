const fs = require("fs");
const path = require("path");

/*
========================================
DOSSIER DES BACKUPS
========================================
*/

const backupFolder = path.join(
    __dirname,
    "../backups"
);

if (!fs.existsSync(backupFolder)) {
    fs.mkdirSync(backupFolder, {
        recursive: true
    });
}

/*
========================================
CRÉER UNE SAUVEGARDE
========================================
*/

async function createBackup(guild) {

    const backup = {

        guild: {
            id: guild.id,
            name: guild.name
        },

        createdAt: Date.now(),

        roles: [],

        channels: []

    };

    /*
    ================================
    RÔLES
    ================================
    */

    for (const role of guild.roles.cache.values()) {

        // @everyone ne doit pas être recréé
        if (role.id === guild.id) {
            continue;
        }

        backup.roles.push({

            id: role.id,

            name: role.name,

            color: role.color,

            hoist: role.hoist,

            position: role.position,

            mentionable: role.mentionable,

            permissions:
                role.permissions.bitfield.toString()

        });

    }

    /*
    ================================
    SALONS
    ================================
    */

    for (const channel of guild.channels.cache.values()) {

        backup.channels.push({

            id: channel.id,

            name: channel.name,

            type: channel.type,

            parentId: channel.parentId,

            position: channel.position,

            nsfw: channel.nsfw ?? false,

            topic: channel.topic ?? null,

            rateLimitPerUser:
                channel.rateLimitPerUser ?? 0

        });

    }

    /*
    ================================
    ENREGISTREMENT
    ================================
    */

    const file = path.join(
        backupFolder,
        `${guild.id}.json`
    );

    fs.writeFileSync(
        file,
        JSON.stringify(
            backup,
            null,
            4
        )
    );

    return file;
}

/*
========================================
CHARGER UNE SAUVEGARDE
========================================
*/

function loadBackup(guildId) {

    const file = path.join(
        backupFolder,
        `${guildId}.json`
    );

    if (!fs.existsSync(file)) {
        return null;
    }

    try {

        return JSON.parse(
            fs.readFileSync(
                file,
                "utf8"
            )
        );

    } catch (error) {

        console.error(
            "Erreur lecture backup :",
            error
        );

        return null;
    }
}

/*
========================================
EXPORT
========================================
*/

module.exports = {

    createBackup,

    loadBackup

};