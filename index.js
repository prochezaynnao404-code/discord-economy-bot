require("dotenv").config();

const fs = require("fs");

const {
    Client,
    Collection,
    GatewayIntentBits,
    Events,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const sqlite3 =
    require("sqlite3").verbose();

const createUser =
    require("./utils/createUser");

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMessages,

        GatewayIntentBits.MessageContent,

        GatewayIntentBits.GuildVoiceStates,

        GatewayIntentBits.GuildMembers
    ]
});

client.commands =
    new Collection();

// =========================
// DATABASE
// =========================

const db =
    new sqlite3.Database(
        "./database.sqlite"
    );

client.db = db;

// =========================
// USERS TABLE
// =========================

db.run(`
CREATE TABLE IF NOT EXISTS users (

    userId TEXT PRIMARY KEY,

    money INTEGER DEFAULT 0,

    bank INTEGER DEFAULT 0,

    xp INTEGER DEFAULT 0,

    level INTEGER DEFAULT 1,

    streak INTEGER DEFAULT 0,

    multiplier INTEGER DEFAULT 1,

    lastDaily INTEGER DEFAULT 0,

    activeQuest TEXT DEFAULT 'none',

    questProgress INTEGER DEFAULT 0,

    questGoal INTEGER DEFAULT 0,

    questCompleted INTEGER DEFAULT 0
)
`);

// =========================
// LOAD COMMANDS
// =========================

const commandFiles =
    fs.readdirSync("./slashCommands")
    .filter(file =>
        file.endsWith(".js")
    );

for (const file of commandFiles) {

    const command =
        require(`./slashCommands/${file}`);

    client.commands.set(
        command.data.name,
        command
    );
}

// =========================
// READY
// =========================

client.once(
    Events.ClientReady,

    () => {

        console.log(
            `✅ Connecté : ${client.user.tag}`
        );
    }
);

// =========================
// INTERACTIONS
// =========================

client.on(
    Events.InteractionCreate,

    async interaction => {

        // =====================
        // BUTTONS
        // =====================

        if (interaction.isButton()) {

            const id =
                interaction.customId;

            // =====================
            // BLACKJACK HIT
            // =====================

            if (
                id.startsWith("hit_")
            ) {

                const data =
                    id.split("_");

                let player =
                    Number(data[1]);

                let dealer =
                    Number(data[2]);

                const bet =
                    Number(data[3]);

                const card =
                    Math.floor(
                        Math.random() * 10
                    ) + 1;

                player += card;

                // BUST

                if (player > 21) {

                    return interaction.update({

                        content:
`🃏 BLACKJACK

👤 Total : ${player}
🤖 Dealer : ${dealer}

❌ BUST

💸 -${bet}$`,

                        embeds: [],

                        components: []
                    });
                }

                // BLACKJACK

                if (player === 21) {

                    db.run(
                        `UPDATE users
                        SET money = money + ?
                        WHERE userId = ?`,
                        [
                            bet * 2,
                            interaction.user.id
                        ]
                    );

                    return interaction.update({

                        content:
`🃏 BLACKJACK

👤 Total : 21
🤖 Dealer : ${dealer}

🎉 BLACKJACK

💰 +${bet * 2}$

📈 Profit :
+${bet}$`,

                        embeds: [],

                        components: []
                    });
                }

                // CONTINUE

                const buttons =
                    new ActionRowBuilder()

                    .addComponents(

                        new ButtonBuilder()

                        .setCustomId(
                            `hit_${player}_${dealer}_${bet}`
                        )

                        .setLabel("HIT")

                        .setStyle(
                            ButtonStyle.Primary
                        ),

                        new ButtonBuilder()

                        .setCustomId(
                            `stand_${player}_${dealer}_${bet}`
                        )

                        .setLabel("STAND")

                        .setStyle(
                            ButtonStyle.Success
                        )
                    );

                return interaction.update({

                    content:
`🃏 BLACKJACK

👤 Total : ${player}
🤖 Dealer : ${dealer}

🆕 Carte :
${card}

💰 Mise :
${bet}$`,

                    embeds: [],

                    components: [
                        buttons
                    ]
                });
            }

            // =====================
            // BLACKJACK STAND
            // =====================

            if (
                id.startsWith("stand_")
            ) {

                const data =
                    id.split("_");

                const player =
                    Number(data[1]);

                let dealer =
                    Number(data[2]);

                const bet =
                    Number(data[3]);

                // DEALER PLAY

                while (dealer < 17) {

                    dealer +=
                        Math.floor(
                            Math.random() * 10
                        ) + 1;
                }

                // WIN

                if (
                    dealer > 21
                    || player > dealer
                ) {

                    db.run(
                        `UPDATE users
                        SET money = money + ?
                        WHERE userId = ?`,
                        [
                            bet * 2,
                            interaction.user.id
                        ]
                    );

                    return interaction.update({

                        content:
`🃏 BLACKJACK

👤 Toi : ${player}
🤖 Dealer : ${dealer}

✅ VICTOIRE

💰 +${bet * 2}$

📈 Profit :
+${bet}$`,

                        embeds: [],

                        components: []
                    });
                }

                // EQUALITY

                if (
                    player === dealer
                ) {

                    db.run(
                        `UPDATE users
                        SET money = money + ?
                        WHERE userId = ?`,
                        [
                            bet,
                            interaction.user.id
                        ]
                    );

                    return interaction.update({

                        content:
`🃏 BLACKJACK

👤 Toi : ${player}
🤖 Dealer : ${dealer}

🤝 ÉGALITÉ

💰 Mise remboursée :
+${bet}$`,

                        embeds: [],

                        components: []
                    });
                }

                // LOSE

                return interaction.update({

                    content:
`🃏 BLACKJACK

👤 Toi : ${player}
🤖 Dealer : ${dealer}

❌ DÉFAITE

💸 -${bet}$`,

                    embeds: [],

                    components: []
                });
            }
        }

        // =====================
        // SLASH COMMANDS
        // =====================

        if (
            !interaction.isChatInputCommand()
        ) return;

        const command =
            client.commands.get(
                interaction.commandName
            );

        if (!command) return;

        try {

            await command.execute(
                interaction
            );

        } catch (error) {

            console.log(error);

            if (
                interaction.replied
                || interaction.deferred
            ) {

                interaction.followUp({

                    content:
                        "❌ Erreur commande.",

                    ephemeral: true
                });

            } else {

                interaction.reply({

                    content:
                        "❌ Erreur commande.",

                    ephemeral: true
                });
            }
        }
    }
);

// =========================
// MESSAGE MONEY + QUESTS
// =========================

const messageCooldown =
    new Set();

client.on(
    "messageCreate",

    message => {

        if (
            message.author.bot
        ) return;

        const userId =
            message.author.id;

        createUser(
            db,
            userId
        );

        // ANTI SPAM

        if (
            messageCooldown.has(userId)
        ) return;

        messageCooldown.add(
            userId
        );

        setTimeout(() => {

            messageCooldown.delete(
                userId
            );

        }, 30000);

        const gain =
            Math.floor(
                Math.random() * 50
            ) + 10;

        db.get(
            "SELECT * FROM users WHERE userId = ?",
            [userId],

            (err, row) => {

                if (!row) return;

                let xp =
                    row.xp + 5;

                let level =
                    row.level;

                // LEVEL UP

                if (
                    xp >= level * 100
                ) {

                    xp = 0;

                    level++;

                    message.channel.send(
`⭐ ${message.author.username}
est passé niveau ${level}`
                    );
                }

                // QUEST PROGRESS

                let progress =
                    row.questProgress;

                let completed =
                    row.questCompleted;

                if (
                    row.activeQuest
                    === "messages"
                ) {

                    progress++;

                    if (
                        progress >= row.questGoal
                    ) {

                        progress =
                            row.questGoal;

                        completed = 1;

                        message.channel.send(
`🎯 ${message.author}
a terminé sa quête messages`
                        );
                    }
                }

                db.run(
                    `UPDATE users

                    SET money = money + ?,
                    xp = ?,
                    level = ?,
                    questProgress = ?,
                    questCompleted = ?

                    WHERE userId = ?`,
                    [
                        gain,
                        xp,
                        level,
                        progress,
                        completed,
                        userId
                    ]
                );
            }
        );
    }
);

// =========================
// VOCAL MONEY + QUESTS
// =========================

setInterval(() => {

    client.guilds.cache.forEach(
        guild => {

            guild.members.cache.forEach(
                member => {

                    if (
                        member.user.bot
                    ) return;

                    if (
                        !member.voice.channel
                    ) return;

                    createUser(
                        db,
                        member.id
                    );

                    db.get(
                        "SELECT * FROM users WHERE userId = ?",
                        [member.id],

                        (err, row) => {

                            if (!row)
                                return;

                            const gain =
                                Math.floor(
                                    Math.random() * 100
                                ) + 50;

                            let progress =
                                row.questProgress;

                            let completed =
                                row.questCompleted;

                            // VOCAL QUEST

                            if (
                                row.activeQuest
                                === "vocal"
                            ) {

                                progress += 10;

                                if (
                                    progress >= row.questGoal
                                ) {

                                    progress =
                                        row.questGoal;

                                    completed = 1;
                                }
                            }

                            db.run(
                                `UPDATE users

                                SET money = money + ?,
                                xp = xp + 10,
                                questProgress = ?,
                                questCompleted = ?

                                WHERE userId = ?`,
                                [
                                    gain,
                                    progress,
                                    completed,
                                    member.id
                                ]
                            );
                        }
                    );
                }
            );
        }
    );

}, 600000);

// =========================
// LOGIN
// =========================

client.login(
    process.env.TOKEN
);