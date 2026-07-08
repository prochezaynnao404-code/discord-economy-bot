const {
    SlashCommandBuilder,
    AttachmentBuilder
} = require("discord.js");

const {
    createCanvas,
    loadImage
} = require("@napi-rs/canvas");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("profil")

        .setDescription("Affiche ton profil")

        .addUserOption(option =>
            option
                .setName("joueur")
                .setDescription("Profil d'un joueur")
                .setRequired(false)
        ),

    async execute(interaction) {

        const user =
            interaction.options.getUser("joueur")
            || interaction.user;

        const member =
            await interaction.guild.members.fetch(user.id);

        const db =
            interaction.client.db;

        db.get(

            "SELECT * FROM users WHERE userId = ?",

            [user.id],

            async (err, data) => {

                if (err || !data) {

                    return interaction.reply({

                        content:
                            "❌ Profil introuvable.",

                        flags: 64

                    });

                }

                const canvas =
                    createCanvas(1000, 500);

                const ctx =
                    canvas.getContext("2d");

                // Fond
                ctx.fillStyle = "#15171c";
                ctx.fillRect(0, 0, 1000, 500);

                // Avatar
                const avatar =
                    await loadImage(
                        user.displayAvatarURL({
                            extension: "png",
                            size: 512
                        })
                    );

                ctx.save();

                ctx.beginPath();

                ctx.arc(
                    130,
                    130,
                    70,
                    0,
                    Math.PI * 2
                );

                ctx.closePath();

                ctx.clip();

                ctx.drawImage(
                    avatar,
                    60,
                    60,
                    140,
                    140
                );

                ctx.restore();

                ctx.fillStyle = "white";

                ctx.font = "bold 40px Arial";

                ctx.fillText(

                    user.username,

                    240,

                    110

                );

                ctx.font = "24px Arial";

                ctx.fillText(

                    `⭐ Niveau : ${data.level}`,

                    240,

                    160

                );

                ctx.fillText(

                    `💰 Argent : ${data.money}$`,

                    70,

                    280

                );

                ctx.fillText(

                    `🏦 Banque : ${data.bank}$`,

                    70,

                    330

                );

                ctx.fillText(

                    `💬 Messages : ${data.messages}`,

                    70,

                    380

                );

                const hours =
                    Math.floor(
                        data.voiceTime / 3600
                    );

                const minutes =
                    Math.floor(
                        (data.voiceTime % 3600) / 60
                    );

                ctx.fillText(

                    `🔊 Vocal : ${hours}h ${minutes}m`,

                    70,

                    430

                );

                ctx.fillText(

                    `📅 Arrivé : ${member.joinedAt.toLocaleDateString("fr-FR")}`,

                    520,

                    430

                );

                const attachment =
                    new AttachmentBuilder(

                        await canvas.encode("png"),

                        {
                            name: "profil.png"
                        }

                    );

                interaction.reply({

                    files: [

                        attachment

                    ]

                });

            }

        );

    }

};