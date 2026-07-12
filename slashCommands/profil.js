const fs = require("fs");
const path = require("path");

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
                .setDescription("Le joueur")
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

                        const canvas =
                            createCanvas(
                                1100,
                                650
                            );

                        const ctx =
                            canvas.getContext("2d");

                        const moneyIcon =
                            await loadImage(
                                fs.readFileSync(
                                    path.join(
                                        __dirname,
                                        "../assets/icons/money.png"
                                    )
                                )
                            );

                        const bankIcon =
                            await loadImage(
                                fs.readFileSync(
                                    path.join(
                                        __dirname,
                                        "../assets/icons/bank.png"
                                    )
                                )
                            );

                        const messageIcon =
                            await loadImage(
                                fs.readFileSync(
                                    path.join(
                                        __dirname,
                                        "../assets/icons/message.png"
                                    )
                                )
                            );

                        const micIcon =
                            await loadImage(
                                fs.readFileSync(
                                    path.join(
                                        __dirname,
                                        "../assets/icons/mic.png"
                                    )
                                )
                            );

                        const trophyIcon =
                            await loadImage(
                                fs.readFileSync(
                                    path.join(
                                        __dirname,
                                        "../assets/icons/trophy.png"
                                    )
                                )
                            );

                        const calendarIcon =
                            await loadImage(
                                fs.readFileSync(
                                    path.join(
                                        __dirname,
                                        "../assets/icons/calendar.png"
                                    )
                                )
                            );
                                                    // ==========================
                        // FOND
                        // ==========================

                        const gradient =
                            ctx.createLinearGradient(
                                0,
                                0,
                                1100,
                                650
                            );

                        gradient.addColorStop(
                            0,
                            "#0f172a"
                        );

                        gradient.addColorStop(
                            1,
                            "#1e293b"
                        );

                        ctx.fillStyle = gradient;

                        ctx.fillRect(
                            0,
                            0,
                            1100,
                            650
                        );

                        ctx.beginPath();

                        ctx.roundRect(
                            30,
                            30,
                            1040,
                            590,
                            30
                        );

                        ctx.fillStyle =
                            "#161d29";

                        ctx.fill();

                        // ==========================
                        // COULEUR DU NIVEAU
                        // ==========================

                        let accent =
                            "#43b581";

                        if (data.level >= 10)
                            accent = "#3498db";

                        if (data.level >= 25)
                            accent = "#9b59b6";

                        if (data.level >= 50)
                            accent = "#f39c12";

                        if (data.level >= 75)
                            accent = "#e74c3c";

                        ctx.fillStyle =
                            accent;

                        ctx.fillRect(
                            30,
                            30,
                            1040,
                            10
                        );

                        // ==========================
                        // AVATAR
                        // ==========================

                        const avatar =
                            await loadImage(

                                user.displayAvatarURL({

                                    extension: "png",

                                    forceStatic: true,

                                    size: 512

                                })

                            );

                        // Contour

                        ctx.beginPath();

                        ctx.arc(
                            120,
                            120,
                            78,
                            0,
                            Math.PI * 2
                        );

                        ctx.fillStyle =
                            accent;

                        ctx.fill();

                        // Avatar rond

                        ctx.save();

                        ctx.beginPath();

                        ctx.arc(
                            120,
                            120,
                            70,
                            0,
                            Math.PI * 2
                        );

                        ctx.closePath();

                        ctx.clip();

                        ctx.drawImage(
                            avatar,
                            50,
                            50,
                            140,
                            140
                        );

                        ctx.restore();

                        // ==========================
                        // NOM
                        // ==========================

                        ctx.fillStyle =
                            "white";

                        ctx.font =
                            "bold 42px Poppins";

                        ctx.fillText(
                            user.username,
                            240,
                            110
                        );

                        // ==========================
                        // NIVEAU
                        // ==========================

                        ctx.font =
                            "24px Poppins";

                        ctx.fillStyle =
                            "#b8c1cc";

                        ctx.fillText(
                            "Niveau",
                            240,
                            160
                        );

                        ctx.font =
                            "bold 30px Poppins";

                        ctx.fillStyle =
                            accent;

                        ctx.fillText(
                            String(data.level),
                            350,
                            160
                        );

                        // ==========================
                        // BARRE XP
                        // ==========================

                        const maxXP =
                            data.level * 100;

                        const percent =
                            Math.min(
                                data.xp / maxXP,
                                1
                            );

                        ctx.beginPath();

                        ctx.roundRect(
                            240,
                            190,
                            420,
                            28,
                            14
                        );

                        ctx.fillStyle =
                            "#2c3444";

                        ctx.fill();

                        ctx.beginPath();

                        ctx.roundRect(
                            240,
                            190,
                            420 * percent,
                            28,
                            14
                        );

                        ctx.fillStyle =
                            accent;

                        ctx.fill();

                        ctx.fillStyle =
                            "white";

                        ctx.font =
                            "18px Poppins";

                        ctx.fillText(
                            `${data.xp} / ${maxXP} XP`,
                            360,
                            210
                        );
 // ==========================
// COLONNE DE DROITE
// ==========================

const days = Math.floor(
    (Date.now() - member.joinedTimestamp) / 86400000
);

// Rang
ctx.drawImage(trophyIcon, 720, 75, 30, 30);

ctx.fillStyle = "#aab4c3";
ctx.font = "22px Poppins";
ctx.fillText("Rang", 765, 98);

ctx.fillStyle = "white";
ctx.font = "bold 28px Poppins";
ctx.fillText(`#${rank}`, 930, 98);

// Daily
ctx.drawImage(calendarIcon, 720, 145, 30, 30);

ctx.fillStyle = "#aab4c3";
ctx.font = "22px Poppins";
ctx.fillText("Daily", 765, 168);

ctx.fillStyle = "white";
ctx.font = "bold 28px Poppins";
ctx.fillText(`${data.dailyStreak}/10`, 930, 168);

// Depuis
ctx.drawImage(micIcon, 720, 215, 30, 30);

ctx.fillStyle = "#aab4c3";
ctx.font = "22px Poppins";
ctx.fillText("Depuis", 765, 238);

ctx.fillStyle = "white";
ctx.font = "bold 28px Poppins";
ctx.fillText(`${days} jours`, 930, 238);

// Ligne de séparation

ctx.strokeStyle = "#2d3748";
ctx.lineWidth = 2;

ctx.beginPath();
ctx.moveTo(60, 290);
ctx.lineTo(1040, 290);
ctx.stroke();
// ==========================
// STATISTIQUES
// ==========================

const voice = data.voiceTime || 0;

const hours = Math.floor(voice / 3600);

const minutes = Math.floor(
    (voice % 3600) / 60
);

// Argent

ctx.drawImage(
    moneyIcon,
    60,
    340,
    30,
    30
);

ctx.fillStyle = "#aab4c3";
ctx.font = "22px Poppins";
ctx.fillText("Argent", 105, 364);

ctx.fillStyle = "white";
ctx.font = "bold 24px Poppins";
ctx.fillText(
    `${data.money.toLocaleString()} $`,
    250,
    364
);

// Banque

ctx.drawImage(
    bankIcon,
    60,
    410,
    30,
    30
);

ctx.fillStyle = "#aab4c3";
ctx.font = "22px Poppins";
ctx.fillText("Banque", 105, 434);

ctx.fillStyle = "white";
ctx.font = "bold 24px Poppins";
ctx.fillText(
    `${(data.bank || 0).toLocaleString()} $`,
    250,
    434
);

// Messages

ctx.drawImage(
    messageIcon,
    60,
    480,
    30,
    30
);

ctx.fillStyle = "#aab4c3";
ctx.font = "22px Poppins";
ctx.fillText("Messages", 105, 504);

ctx.fillStyle = "white";
ctx.font = "bold 24px Poppins";
ctx.fillText(
    `${data.messages.toLocaleString()}`,
    250,
    504
);

// Vocal

ctx.drawImage(
    micIcon,
    560,
    340,
    30,
    30
);

ctx.fillStyle = "#aab4c3";
ctx.font = "22px Poppins";
ctx.fillText("Vocal", 605, 364);

ctx.fillStyle = "white";
ctx.font = "bold 24px Poppins";
ctx.fillText(
    `${hours}h ${minutes}m`,
    760,
    364
);

// Arrivée

ctx.drawImage(
    calendarIcon,
    560,
    410,
    30,
    30
);

ctx.fillStyle = "#aab4c3";
ctx.font = "22px Poppins";
ctx.fillText("Arrivé", 605, 434);

ctx.fillStyle = "white";
ctx.font = "bold 24px Poppins";
ctx.fillText(
    member.joinedAt.toLocaleDateString("fr-FR"),
    760,
    434
);

// ==========================
// ENVOI
// ==========================

const attachment =
    new AttachmentBuilder(
        await canvas.encode("png"),
        {
            name: "profil.png"
        }
    );

await interaction.reply({

    files: [
        attachment
    ]

});

                    });

            });

    }

};