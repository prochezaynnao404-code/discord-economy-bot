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

const canvas = createCanvas(1100, 650);
const ctx = canvas.getContext("2d");
const moneyIcon = await loadImage(
    path.join(__dirname, "../assets/icons/money.png")
);

const bankIcon = await loadImage(
    path.join(__dirname, "../assets/icons/bank.png")
);

const messageIcon = await loadImage(
    path.join(__dirname, "../assets/icons/message.png")
);

const micIcon = await loadImage(
    path.join(__dirname, "../assets/icons/mic.png")
);

const trophyIcon = await loadImage(
    path.join(__dirname, "../assets/icons/trophy.png")
);

const calendarIcon = await loadImage(
    path.join(__dirname, "../assets/icons/calendar.png")
);

const clockIcon = await loadImage(
    path.join(__dirname, "../assets/icons/clock.png")
);

function card(x, y) {

    ctx.beginPath();

    ctx.roundRect(
        x,
        y,
        430,
        60,
        15
    );

    ctx.fillStyle = "#232b39";

    ctx.fill();

}

// =====================
// FOND
// =====================

const gradient =
ctx.createLinearGradient(
0,
0,
1100,
650
);

gradient.addColorStop(
0,
"#111827"
);

gradient.addColorStop(
1,
"#1f2937"
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

25

);

ctx.fillStyle =
"#181f2b";

ctx.fill();

ctx.shadowColor =
"rgba(0,0,0,0.45)";

ctx.shadowBlur = 35;

ctx.fill();

ctx.shadowBlur = 0;

let accent = "#43b581";

if(data.level >= 10)
accent = "#3498db";

if(data.level >= 25)
accent = "#9b59b6";

if(data.level >= 50)
accent = "#f39c12";

if(data.level >= 75)
accent = "#e74c3c";

ctx.fillStyle = accent;

ctx.fillRect(

30,

30,

1040,

12

);

// =====================
// AVATAR
// =====================

// Avatar
const avatar = await loadImage(
    user.displayAvatarURL({
        extension: "png",
        forceStatic: true,
        size: 512
    })
);

// Cercle vert
ctx.beginPath();
ctx.arc(110, 110, 74, 0, Math.PI * 2);
ctx.fillStyle = accent;
ctx.fill();

// Découpe ronde
ctx.save();

ctx.beginPath();
ctx.arc(110, 110, 66, 0, Math.PI * 2);
ctx.closePath();
ctx.clip();

ctx.drawImage(
    avatar,
    44,
    44,
    132,
    132
);

ctx.restore();

// =====================
// NOM
// =====================

ctx.fillStyle = "#ffffff";
ctx.font = "bold 46px Poppins";

ctx.fillText(
    user.username,
    250,
    120
);

// =====================
// NIVEAU
// =====================

ctx.font = "28px Poppins";

ctx.fillStyle = "#bbbbbb";

ctx.fillText(
    "Niveau",
    252,
    170
);

ctx.fillStyle = accent;

ctx.font = "bold 34px Poppins";

ctx.fillText(
    String(data.level),
    360,
    170
);

const maxXP = data.level * 100;

const percent =
Math.min(
    data.xp / maxXP,
    1
);

// =====================
// BARRE XP
// =====================

// Fond

ctx.beginPath();

ctx.roundRect(
250,
200,
420,
30,
15
);

ctx.fillStyle = "#2d3748";
ctx.fill();

// Progression

ctx.beginPath();

ctx.roundRect(
250,
200,
420 * percent,
30,
15
);

ctx.fillStyle = accent;

ctx.fill();

// =====================
// COLONNE DE DROITE
// =====================

const days = Math.floor(
    (Date.now() - member.joinedTimestamp) / 86400000
);

ctx.drawImage(trophyIcon, 760, 78, 28, 28);
ctx.drawImage(calendarIcon, 760, 138, 28, 28);
ctx.drawImage(clockIcon, 760, 198, 28, 28);

ctx.fillStyle = "#cfd5df";
ctx.font = "22px Poppins";

ctx.fillText("Rang", 805, 100);
ctx.fillText("Daily", 805, 160);
ctx.fillText("Depuis", 805, 220);

ctx.fillStyle = "white";
ctx.font = "bold 26px Poppins";

ctx.fillText(`#${rank}`, 950, 100);
ctx.fillText(`${data.dailyStreak}/10`, 950, 160);
ctx.fillText(`${days} jours`, 950, 220);

ctx.strokeStyle = "#2c3444";
ctx.lineWidth = 2;

ctx.beginPath();
ctx.moveTo(70, 300);
ctx.lineTo(1030, 300);
ctx.stroke();

// =====================
// STATISTIQUES
// =====================

const voice = data.voiceTime || 0;

const hours = Math.floor(voice / 3600);

const minutes = Math.floor(
    (voice % 3600) / 60
);

ctx.fillStyle = "#cfd5df";
ctx.font = "22px Poppins";

ctx.drawImage(moneyIcon, 38, 338, 26, 26);
ctx.drawImage(bankIcon,38,405,26,26);

ctx.drawImage(messageIcon,38,472,26,26);

ctx.drawImage(micIcon,520,338,26,26);

ctx.drawImage(calendarIcon,520,405,26,26);

// Colonne gauche

ctx.fillText("Argent",80,360);
ctx.fillText("Banque",80,427);
ctx.fillText("Messages",80,494);

ctx.fillText("Vocal",560,360);
ctx.fillText("Arrivé",560,427);

ctx.fillStyle = "white";
ctx.font = "bold 24px Poppins";

ctx.fillText(`${data.money.toLocaleString()} $`, 250, 360);

ctx.fillText(`${data.bank.toLocaleString()} $`, 250, 430);

ctx.fillText(`${data.messages.toLocaleString()}`, 250, 500);

ctx.fillText(`${hours}h ${minutes}m`, 720, 360);

ctx.fillText(
    member.joinedAt.toLocaleDateString("fr-FR"),
    720,
    430
);

ctx.fillStyle = "white";

ctx.font = "20px Poppins";

ctx.fillText(
`${data.xp} / ${maxXP} XP`,
360,
222
);


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