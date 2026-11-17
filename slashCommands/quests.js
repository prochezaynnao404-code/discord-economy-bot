const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { EPHEMERAL, money } = require("../utils/helpers");

module.exports = {
    data: new SlashCommandBuilder().setName("quests").setDescription("Voir ta quête ou récupérer la récompense"),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const userId = interaction.user.id;

        if (economy.claimQuest(userId, ECONOMY.QUEST_REWARD)) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🎯 Quête terminée")
                        .setColor("Green")
                        .setDescription(
                            `💰 Récompense : **+${money(ECONOMY.QUEST_REWARD)}**\n\nChoisis-en une autre avec \`/choosequest\`.`
                        )
                ]
            });
        }

        const user = economy.getUser(userId);
        if (user.activeQuest === "none") {
            return interaction.reply({
                content: "❌ Aucune quête en cours. Utilise `/choosequest`.",
                flags: EPHEMERAL
            });
        }

        return interaction.reply({
            content: `⏳ Quête **${user.activeQuest}** en cours\n📈 Progression : ${user.questProgress}/${user.questGoal}`,
            flags: EPHEMERAL
        });
    }
};
