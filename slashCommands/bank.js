const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { EPHEMERAL, money } = require("../utils/helpers");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("bank")
        .setDescription("Gérer ton compte en banque (l'argent en banque ne peut pas être perdu en amende)")
        .addSubcommand((sub) =>
            sub
                .setName("deposer")
                .setDescription("Déposer de l'argent")
                .addIntegerOption((o) => o.setName("montant").setDescription("Montant (vide = tout)").setMinValue(1))
        )
        .addSubcommand((sub) =>
            sub
                .setName("retirer")
                .setDescription("Retirer de l'argent")
                .addIntegerOption((o) => o.setName("montant").setDescription("Montant (vide = tout)").setMinValue(1))
        ),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const userId = interaction.user.id;
        const sub = interaction.options.getSubcommand();
        const user = economy.getUser(userId);

        const deposit = sub === "deposer";
        const amount = interaction.options.getInteger("montant") ?? (deposit ? user.money : user.bank);

        if (amount <= 0) {
            return interaction.reply({ content: "❌ Rien à transférer.", flags: EPHEMERAL });
        }

        const ok = deposit ? economy.deposit(userId, amount) : economy.withdraw(userId, amount);
        if (!ok) {
            return interaction.reply({
                content: deposit
                    ? "❌ Tu n'as pas assez d'argent en poche."
                    : "❌ Tu n'as pas assez d'argent en banque.",
                flags: EPHEMERAL
            });
        }

        const after = economy.getUser(userId);
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor("Green")
                    .setTitle(deposit ? "🏦 Dépôt effectué" : "🏦 Retrait effectué")
                    .setDescription(
                        `${deposit ? "Déposé" : "Retiré"} : **${money(amount)}**\n\n💵 Poche : ${money(after.money)}\n🏦 Banque : ${money(after.bank)}`
                    )
            ],
            flags: EPHEMERAL
        });
    }
};
