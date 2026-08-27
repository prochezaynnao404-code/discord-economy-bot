const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const {
    createBackup,
    loadBackup
} = require("../security/backup");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("security")

        .setDescription(
            "Gestion de la sécurité du serveur"
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )

        .addSubcommand(
            subcommand =>
                subcommand

                    .setName("backup")

                    .setDescription(
                        "Créer une sauvegarde du serveur"
                    )
        )

        .addSubcommand(
            subcommand =>
                subcommand

                    .setName("status")

                    .setDescription(
                        "Voir l'état de la sauvegarde"
                    )
        ),

    async execute(interaction) {

        /*
        ================================
        VÉRIFICATION ADMIN
        ================================
        */

        if (
            !interaction.memberPermissions.has(
                PermissionFlagsBits.Administrator
            )
        ) {

            return interaction.reply({

                content:
                    "❌ Tu dois être administrateur.",

                ephemeral: true

            });

        }

        const subcommand =
            interaction.options.getSubcommand();

        /*
        ================================
        BACKUP
        ================================
        */

        if (subcommand === "backup") {

            await interaction.deferReply({
                ephemeral: true
            });

            try {

                const file =
                    await createBackup(
                        interaction.guild
                    );

                const backup =
                    loadBackup(
                        interaction.guild.id
                    );

                return interaction.editReply({

                    embeds: [

                        new EmbedBuilder()

                            .setColor("#43b581")

                            .setTitle(
                                "🛡️ Sauvegarde créée"
                            )

                            .setDescription(
                                "La configuration de ton serveur a été sauvegardée."
                            )

                            .addFields(

                                {
                                    name: "📁 Fichier",
                                    value:
                                        `\`${file}\``
                                },

                                {
                                    name: "🎭 Rôles",
                                    value:
                                        `${backup.roles.length}`
                                },

                                {
                                    name: "💬 Salons",
                                    value:
                                        `${backup.channels.length}`
                                }

                            )

                            .setTimestamp()

                    ]

                });

            } catch (error) {
                console.error("❌ ERREUR SECURITY BACKUP :", error);

                const message = error?.message || "Erreur inconnue";

                if (interaction.replied || interaction.deferred) {
                    return interaction.editReply({
                        content: `❌ Impossible de créer la sauvegarde.\n\`\`\`\n${message}\n\`\`\``
                    });
                }

                return interaction.reply({
                    content: `❌ Impossible de créer la sauvegarde.\n\`\`\`\n${message}\n\`\`\``,
                    ephemeral: true
                });
            }

        }

        /*
        ================================
        STATUS
        ================================
        */

        if (subcommand === "status") {

            const backup =
                loadBackup(
                    interaction.guild.id
                );

            if (!backup) {

                return interaction.reply({

                    content:
                        "❌ Aucune sauvegarde trouvée.",

                    ephemeral: true

                });

            }

            const date =
                new Date(
                    backup.createdAt
                );

            return interaction.reply({

                embeds: [

                    new EmbedBuilder()

                        .setColor("#3498db")

                        .setTitle(
                            "🛡️ Sécurité Irisiabot"
                        )

                        .setDescription(
                            "Voici les informations de la dernière sauvegarde."
                        )

                        .addFields(

                            {
                                name: "📅 Créée le",
                                value:
                                    `<t:${Math.floor(
                                        backup.createdAt / 1000
                                    )}:F>`
                            },

                            {
                                name: "🎭 Rôles",
                                value:
                                    `${backup.roles.length}`,
                                inline: true
                            },

                            {
                                name: "💬 Salons",
                                value:
                                    `${backup.channels.length}`,
                                inline: true
                            }

                        )

                        .setFooter({
                            text:
                                "Irisiabot • Security"
                        })

                ],

                ephemeral: true

            });

        }

    }

};
