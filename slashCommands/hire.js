const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

const { EPHEMERAL } = require("../utils/helpers");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("hire")
        .setDescription("Proposer un emploi à un joueur")
        .addUserOption((option) => option.setName("joueur").setDescription("Utilisateur").setRequired(true)),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const target = interaction.options.getUser("joueur");
        const business = economy.getBusinessByOwner(interaction.user.id);

        if (!business) {
            return interaction.reply({ content: "❌ Tu n'as pas d'entreprise.", flags: EPHEMERAL });
        }
        if (target.bot || target.id === interaction.user.id) {
            return interaction.reply({ content: "❌ Tu ne peux pas recruter ce joueur.", flags: EPHEMERAL });
        }
        const current = economy.getEmployment(target.id);
        if (current) {
            return interaction.reply({
                content: `❌ ${target.username} travaille déjà chez **${current.name}**.`,
                flags: EPHEMERAL,
                allowedMentions: { parse: [] }
            });
        }

        // Le joueur doit accepter l'offre
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("hire_yes").setLabel("Accepter").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("hire_no").setLabel("Refuser").setStyle(ButtonStyle.Danger)
        );

        const response = await interaction.reply({
            content: `💼 ${target}, **${business.name}** te propose un emploi. Tu acceptes ?`,
            components: [row],
            allowedMentions: { users: [target.id] },
            withResponse: true
        });

        const click = await response.resource.message
            .awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: (b) => {
                    if (b.user.id === target.id) return true;
                    b.reply({ content: "❌ Cette offre ne t'est pas destinée.", flags: EPHEMERAL }).catch(() => {});
                    return false;
                },
                time: 60000
            })
            .catch(() => null);

        if (!click) {
            return interaction.editReply({ content: `⌛ L'offre de **${business.name}** a expiré.`, components: [] });
        }
        if (click.customId === "hire_no") {
            return click.update({ content: `❌ ${target.username} a refusé l'offre.`, components: [] });
        }
        if (!economy.hire(business.id, target.id)) {
            return click.update({ content: "❌ Tu as déjà un emploi.", components: [] });
        }
        return click.update({ content: `✅ ${target} a rejoint **${business.name}** !`, components: [] });
    }
};
