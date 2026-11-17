const { SlashCommandBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { EPHEMERAL, money } = require("../utils/helpers");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("createbusiness")
        .setDescription(`Créer une entreprise (${ECONOMY.BUSINESS_PRICE.toLocaleString("fr-FR")} $)`)
        .addStringOption((option) =>
            option
                .setName("nom")
                .setDescription("Nom de l'entreprise")
                .setRequired(true)
                .setMinLength(2)
                .setMaxLength(40)
        ),

    async execute(interaction) {
        const name = interaction.options.getString("nom").trim();
        const status = interaction.client.economy.createBusiness(interaction.user.id, name, ECONOMY.BUSINESS_PRICE);

        if (status === "exists") {
            return interaction.reply({ content: "❌ Tu possèdes déjà une entreprise.", flags: EPHEMERAL });
        }
        if (status === "money") {
            return interaction.reply({
                content: `❌ Il te faut ${money(ECONOMY.BUSINESS_PRICE)} en poche.`,
                flags: EPHEMERAL
            });
        }

        return interaction.reply({
            content: `🏢 Entreprise **${name}** créée !\nRecrute avec \`/hire\` : tes employés gagnent +20 % avec \`/work\`.`,
            allowedMentions: { parse: [] }
        });
    }
};
