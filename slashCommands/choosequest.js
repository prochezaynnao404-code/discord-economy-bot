const { SlashCommandBuilder } = require("discord.js");
const { EmbedBuilder } = require("../utils/theme");

const { ECONOMY } = require("../config");
const { EPHEMERAL } = require("../utils/helpers");

const LABELS = {
    messages: `Envoyer ${ECONOMY.QUEST_GOALS.messages} messages (1 compté toutes les 30 s)`,
    vocal: `Passer ${ECONOMY.QUEST_GOALS.vocal} minutes actives en vocal`,
    casino: `Jouer ${ECONOMY.QUEST_GOALS.casino} parties de casino (blackjack / roulette)`
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("choosequest")
        .setDescription("Choisir une quête")
        .addStringOption((option) =>
            option
                .setName("quete")
                .setDescription("Type de quête")
                .setRequired(true)
                .addChoices(
                    { name: "Messages", value: "messages" },
                    { name: "Vocal", value: "vocal" },
                    { name: "Casino", value: "casino" }
                )
        ),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const userId = interaction.user.id;
        const quest = interaction.options.getString("quete");
        const user = economy.getUser(userId);

        if (user.questCompleted) {
            return interaction.reply({
                content: "🎯 Ta quête actuelle est terminée : récupère d'abord ta récompense avec `/quests`.",
                flags: EPHEMERAL
            });
        }

        const goal = ECONOMY.QUEST_GOALS[quest];
        economy.startQuest(userId, quest, goal);

        const replaced =
            user.activeQuest !== "none" ? `\n\n⚠️ Ta quête **${user.activeQuest}** en cours a été remplacée.` : "";

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎯 Nouvelle quête")
                    .setColor("Blue")
                    .setDescription(
                        `📌 ${LABELS[quest]}\n💰 Récompense : ${ECONOMY.QUEST_REWARD.toLocaleString("fr-FR")} $${replaced}`
                    )
            ]
        });
    }
};
