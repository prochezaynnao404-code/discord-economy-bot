const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");

const { ECONOMY } = require("../config");
const { EPHEMERAL } = require("../utils/helpers");
const lv = require("../utils/levels");
const { rankCard } = require("../utils/levelRender");

const nf = (n) => n.toLocaleString("fr-FR");
const BAREME_LEVELS = [2, 5, 10, 15, 20, 25, 30, 40, 51];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("niveaux")
        .setDescription("Système de niveaux")
        .addSubcommand((s) =>
            s
                .setName("voir")
                .setDescription("Carte de niveau d'un membre")
                .addUserOption((o) => o.setName("membre").setDescription("Le membre (toi par défaut)"))
        )
        .addSubcommand((s) => s.setName("bareme").setDescription("XP nécessaire et bonus de chaque niveau"))
        .addSubcommand((s) =>
            s
                .setName("salon")
                .setDescription("(Admin) Salon des annonces de niveau")
                .addChannelOption((o) =>
                    o
                        .setName("salon")
                        .setDescription("Vide = dans le salon où la personne a parlé")
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("annonces")
                .setDescription("(Admin) Activer ou couper les annonces de niveau")
                .addBooleanOption((o) => o.setName("actif").setDescription("Annonces activées ?").setRequired(true))
        ),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const sub = interaction.options.getSubcommand();

        if (sub === "voir") {
            const user = interaction.options.getUser("membre") || interaction.user;
            if (user.bot) return interaction.reply({ content: "❌ Les bots n'ont pas de niveau.", flags: EPHEMERAL });
            await interaction.deferReply();
            const data = economy.getUser(user.id);
            const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
            const card = await rankCard({
                name: member?.displayName || user.username,
                avatarURL: user.displayAvatarURL({ extension: "png", forceStatic: true, size: 256 }),
                level: data.level,
                xp: data.xp,
                rank: economy.levelRank(user.id),
                totalXp: lv.totalXpForLevel(data.level) + data.xp
            });
            return interaction.editReply({ files: [card] });
        }

        if (sub === "bareme") {
            const { BONUS_PER_LEVEL, BONUS_MAX } = ECONOMY.LEVELS;
            const rows = BAREME_LEVELS.map(
                (l) =>
                    `**Niv. ${l}** · ${nf(lv.totalXpForLevel(l))} XP au total · ` +
                    `${nf(lv.xpForLevel(l))} XP pour le suivant · bonus **${lv.formatBonus(l)}**`
            );
            const [msgMin, msgMax] = ECONOMY.MESSAGE_XP;
            const [vMin, vMax] = ECONOMY.VOICE_XP;
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("⭐ Barème des niveaux")
                        .setColor("Gold")
                        .setDescription(
                            "**Gagner de l'XP**\n" +
                                `💬 Message : ${msgMin}–${msgMax} XP (au plus une fois par minute)\n` +
                                `🎙️ Vocal actif : ${vMin}–${vMax} XP toutes les 10 minutes\n\n` +
                                "**Bonus de gains**\n" +
                                `+${Math.round(BONUS_PER_LEVEL * 100)} % par niveau, jusqu'à +${Math.round(BONUS_MAX * 100)} %, ` +
                                "sur les messages, le vocal, `/daily` et `/work`.\n\n" +
                                rows.join("\n")
                        )
                ]
            });
        }

        // ----- Réglages réservés aux admins -----
        if (!interaction.guild) {
            return interaction.reply({ content: "❌ À utiliser sur un serveur.", flags: EPHEMERAL });
        }
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: "❌ Il faut la permission **Gérer le serveur**.", flags: EPHEMERAL });
        }
        const guildId = interaction.guild.id;

        if (sub === "salon") {
            const channel = interaction.options.getChannel("salon");
            if (!channel) {
                economy.setSetting(lv.channelKey(guildId), "");
                return interaction.reply({
                    content: "✅ Les annonces seront faites dans le salon où la personne a parlé.",
                    flags: EPHEMERAL
                });
            }
            const me = interaction.guild.members.me;
            if (me && !channel.permissionsFor(me)?.has(["ViewChannel", "SendMessages", "AttachFiles"])) {
                return interaction.reply({
                    content: `❌ Je ne peux pas envoyer d'images dans ${channel}.`,
                    flags: EPHEMERAL
                });
            }
            economy.setSetting(lv.channelKey(guildId), channel.id);
            return interaction.reply({ content: `✅ Les annonces de niveau iront dans ${channel}.`, flags: EPHEMERAL });
        }

        // annonces
        const on = interaction.options.getBoolean("actif");
        economy.setSetting(lv.enabledKey(guildId), on ? "1" : "0");
        return interaction.reply({
            content: on ? "✅ Annonces de niveau activées." : "🔕 Annonces de niveau coupées.",
            flags: EPHEMERAL
        });
    }
};
