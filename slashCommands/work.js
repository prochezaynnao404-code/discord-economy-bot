const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { ECONOMY } = require("../config");
const { EPHEMERAL, money, duration, randInt, pick, lockUser, unlockUser } = require("../utils/helpers");
const { applyBonus, levelBonus, formatBonus } = require("../utils/levels");
const { BUSINESS } = require("../utils/business");
const { ivresseState } = require("../utils/bar");

const JOBS = [
    { name: "🚕 Chauffeur", word: "LIVRAISON" },
    { name: "💻 Développeur", word: "JAVASCRIPT" },
    { name: "👮 Policier", word: "ARRESTATION" },
    { name: "👨‍🍳 Cuisinier", word: "CUISINE" },
    { name: "🧑‍⚕️ Médecin", word: "ORDONNANCE" },
    { name: "🧑‍🏫 Professeur", word: "TABLEAU" }
];

module.exports = {
    data: new SlashCommandBuilder().setName("work").setDescription("Travailler (1 fois par heure)"),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const userId = interaction.user.id;

        if (!interaction.channel) {
            return interaction.reply({ content: "❌ Commande indisponible ici.", flags: EPHEMERAL });
        }
        if (!lockUser(userId)) {
            return interaction.reply({ content: "❌ Tu es déjà dans un mini-jeu.", flags: EPHEMERAL });
        }

        try {
            // Cooldown stocké en base : il survit aux redémarrages
            const remaining = economy.tryCooldown(userId, "lastWork", ECONOMY.WORK_COOLDOWN);
            if (remaining > 0) {
                return interaction.reply({
                    content: `⏳ Tu dois attendre **${duration(remaining)}**.`,
                    flags: EPHEMERAL
                });
            }

            // Employé d'une entreprise : bonus de 20 %
            const job = economy.getEmployment(userId);
            const task = pick(JOBS);

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("💼 Travail")
                        .setColor("Blue")
                        .setDescription(
                            `${task.name}${job ? ` chez **${job.name}**` : ""}\n\nTape rapidement :\n\`${task.word}\`\n\n⏳ 10 secondes`
                        )
                ]
            });

            const collected = await interaction.channel
                .awaitMessages({ filter: (m) => m.author.id === userId, max: 1, time: 10000, errors: ["time"] })
                .catch(() => null);

            if (!collected) {
                return interaction.followUp("⏰ Trop lent, pas de salaire cette fois.");
            }
            const msg = collected.first();
            if (msg.content.trim().toUpperCase() !== task.word) {
                return msg.reply("❌ Mauvaise réponse, pas de salaire cette fois.");
            }

            // Trop bu au bar : on peut rater son service
            const drunk = ivresseState(economy.getIvresse(userId));
            if (drunk.workFail > 0 && Math.random() < drunk.workFail) {
                return msg.reply(
                    `${drunk.emoji} Tu es **${drunk.label.toLowerCase()}** : tu t'es endormi au travail. Pas de salaire cette fois.\n` +
                        "_Un ☕ café au `/bar` aide à dessoûler._"
                );
            }

            const { level } = economy.getUser(userId);
            let gain = randInt(...ECONOMY.WORK_GAIN);
            if (job) gain = Math.floor(gain * (1 + BUSINESS.WORK_BONUS));
            gain = applyBonus(gain, level);
            const beforeDrink = gain;
            gain = economy.drinkBoost(userId, "gains", gain);
            economy.addMoney(userId, gain);

            // Une part en plus (non retirée à l'employé) va au coffre de l'entreprise
            const share = job ? Math.floor(gain * BUSINESS.WORK_SHARE) : 0;
            if (share > 0) economy.recordEmployeeWork(userId, share);

            const bonuses = [
                ...(job ? [`entreprise +${Math.round(BUSINESS.WORK_BONUS * 100)} %`] : []),
                ...(levelBonus(level) > 0 ? [`niveau ${formatBonus(level)}`] : []),
                ...(gain > beforeDrink ? [`bar +${money(gain - beforeDrink)}`] : [])
            ];
            return msg.reply({
                content:
                    `✅ Travail réussi\n💰 +${money(gain)}${bonuses.length ? ` (bonus ${bonuses.join(", ")})` : ""}` +
                    (share > 0 ? `\n🏢 +${money(share)} versés à **${job.name}** pour le titre d'employé du mois` : ""),
                allowedMentions: { parse: [] }
            });
        } finally {
            unlockUser(userId);
        }
    }
};
