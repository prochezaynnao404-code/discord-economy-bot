const { SlashCommandBuilder } = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { OWNER_ID } = require("../config");
const { EPHEMERAL } = require("../utils/helpers");
const { createBackup, loadBackup, restoreBackup } = require("../security/backup");
const { lockdown, unlock, isLocked } = require("../security/antiNuke");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("security")
        .setDescription("Gestion de la sécurité du serveur")
        .setDefaultMemberPermissions(0)
        .setDMPermission(false)
        .addSubcommand((s) => s.setName("backup").setDescription("Créer une sauvegarde des rôles et salons"))
        .addSubcommand((s) => s.setName("status").setDescription("Voir l'état de la sauvegarde et du lockdown"))
        .addSubcommand((s) =>
            s.setName("restore").setDescription("Recréer les rôles et salons supprimés depuis la sauvegarde")
        )
        .addSubcommand((s) => s.setName("lockdown").setDescription("Verrouiller tous les salons"))
        .addSubcommand((s) => s.setName("unlock").setDescription("Lever le verrouillage des salons")),

    async execute(interaction) {
        if (interaction.user.id !== OWNER_ID && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({
                content: "❌ Tu n'as pas accès aux commandes de sécurité d'Irisiabot.",
                flags: EPHEMERAL
            });
        }

        const guild = interaction.guild;
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply({ flags: EPHEMERAL });

        if (sub === "backup") {
            const backup = await createBackup(guild);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("#43b581")
                        .setTitle("🛡️ Sauvegarde créée")
                        .addFields(
                            { name: "🎭 Rôles", value: `${backup.roles.length}`, inline: true },
                            { name: "💬 Salons", value: `${backup.channels.length}`, inline: true }
                        )
                        .setTimestamp()
                ]
            });
        }

        if (sub === "status") {
            const backup = loadBackup(guild.id);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("#3498db")
                        .setTitle("🛡️ Sécurité Irisiabot")
                        .addFields(
                            {
                                name: "💾 Dernière sauvegarde",
                                value: backup
                                    ? `<t:${Math.floor(backup.createdAt / 1000)}:F>\n${backup.roles.length} rôles, ${backup.channels.length} salons`
                                    : "Aucune (`/security backup`)"
                            },
                            {
                                name: "🔒 Lockdown",
                                value: isLocked(guild.id) ? "Actif (`/security unlock`)" : "Inactif"
                            }
                        )
                        .setFooter({ text: "Irisiabot • Security" })
                ]
            });
        }

        if (sub === "restore") {
            const report = await restoreBackup(guild);
            if (!report) return interaction.editReply("❌ Aucune sauvegarde trouvée.");
            return interaction.editReply(
                `♻️ Restauration terminée : ${report.roles} rôle(s) et ${report.channels} salon(s) recréés` +
                    (report.errors ? `, ${report.errors} erreur(s) (voir les logs).` : ".")
            );
        }

        if (sub === "lockdown") {
            if (isLocked(guild.id)) return interaction.editReply("🔒 Le serveur est déjà verrouillé.");
            const count = await lockdown(guild, `Manuel par ${interaction.user.tag}`);
            return interaction.editReply(`🔒 ${count} salons verrouillés. Utilise \`/security unlock\` pour lever.`);
        }

        if (sub === "unlock") {
            const count = await unlock(guild);
            if (count === null) return interaction.editReply("ℹ️ Aucun lockdown actif.");
            return interaction.editReply(`🔓 Lockdown levé : ${count} salons restaurés.`);
        }
    }
};
