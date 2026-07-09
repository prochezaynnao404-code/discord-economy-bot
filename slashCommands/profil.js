const {
    SlashCommandBuilder,
    AttachmentBuilder
} = require("discord.js");

const {
    createCanvas,
    loadImage,
    GlobalFonts
} = require("@napi-rs/canvas");

GlobalFonts.registerFromPath(
    "./assets/fonts/Poppins-Bold.ttf",
    "Poppins"
);

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
                
                db.all(
                   "SELECT userId FROM users ORDER BY level DESC, xp DESC",
                    async (err, rows) => {

                        const rank =
                            rows.findIndex(
                                u => u.userId === user.id
                            ) + 1;

                const canvas = createCanvas(1000, 600);
                const ctx = canvas.getContext("2d");

                // Fond extérieur
                ctx.fillStyle = "#2ecc71";
                ctx.fillRect(0, 0, 1000, 600);

               // Carte
               ctx.beginPath();
               ctx.roundRect(20, 20, 960, 560, 25);
               ctx.fillStyle = "#101317";
               ctx.fill();

               // Dégradé
               const gradient = ctx.createLinearGradient(0, 0, 1000, 600);
                gradient.addColorStop(0, "rgba(255,255,255,0.03)");
                gradient.addColorStop(1, "rgba(0,0,0,0)");

               ctx.fillStyle = gradient;
               ctx.fill();

               ctx.strokeStyle = "#2b2f36";
               ctx.lineWidth = 3;

               // séparation horizontale
               ctx.beginPath();
               ctx.moveTo(70, 260);
               ctx.lineTo(930, 260);
               ctx.stroke();

              // séparation verticale
              ctx.beginPath();
              ctx.moveTo(560, 40);
              ctx.lineTo(560, 220);
              ctx.stroke();

              // séparation verticale
              ctx.beginPath();
              ctx.moveTo(500, 285);
              ctx.lineTo(500, 540);
              ctx.stroke();


                // Avatar
                const avatar = await loadImage(
                    user.displayAvatarURL({
                        extension: "png",
                        forceStatic: true,
                        size: 512
                    })
                );
                
                ctx.beginPath();

                ctx.arc(
                    130,
                    130,
                    78,
                    0,
                Math.PI * 2
                );

                ctx.fillStyle = color;
                ctx.fill();

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

                ctx.font = "40px Poppins";

                ctx.fillText(

                    user.username,

                    240,

                    110

                );

                ctx.font = "24px Poppins";

                ctx.fillText(

                    `Niveau : ${data.level}`,

                    240,

                    160

                );
                
                const maxXP = data.level * 100;

                const percent =
                      Math.min(
                          data.xp / maxXP,
                          1
                      );

                ctx.fillStyle = "#444";

                ctx.fillRect(
                    240,
                    180,
                    500,
                    24
                );

                ctx.fillStyle = color;

                ctx.fillRect(
                    240,
                    180,
                    500 * percent,
                    24
                );

                ctx.fillStyle = "white";

                ctx.font = "18px Arial";

                ctx.fillText(
                   `${data.xp}/${maxXP} XP`,
                   250,
                   198
                );

                ctx.fillText(

                    `$Argent : ${data.money}$`,

                    70,

                    280

                );

                ctx.fillText(

                    `$Banque : ${data.bank}$`,

                    70,

                    330

                );

                ctx.fillText(

                    `Messages : ${data.messages}`,

                    70,

                    380

                );

                const voice =
                    data.voiceTime || 0;

                const hours =
                    Math.floor(
                        voice / 3600
                    );

                const minutes =
                    Math.floor(
                        (voice % 3600) / 60
                    );

                ctx.fillText(

                    `Vocal : ${hours}h ${minutes}m`,

                    70,

                    430

                );

                ctx.fillText(

                    `Arrivé : ${member.joinedAt.toLocaleDateString("fr-FR")}`,

                    520,

                    430

                );
                
                ctx.font = "28px Arial";

                ctx.fillStyle = "white";

                const rightX = 740;
                let y = 110;
                const spacing = 65;

                ctx.font = "bold 26px Arial";
                ctx.fillStyle = "white";

                ctx.fillText(`Rang : #${rank}`, rightX, y);

                y += spacing;

                ctx.fillText(`Daily : ${data.dailyStreak}/10`, rightX, y);

                y += spacing;
                
                const days = Math.floor(
                    (Date.now() - member.joinedTimestamp) / 86400000
                );

                ctx.fillText(`Depuis ${days} jours`, rightX, y);

                const attachment = new AttachmentBuilder(
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

        );

    }

};