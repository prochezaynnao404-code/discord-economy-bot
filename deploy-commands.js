require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const commands = fs
    .readdirSync(path.join(__dirname, "slashCommands"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => require(`./slashCommands/${file}`).data.toJSON());

console.log("Commandes :", commands.map((c) => c.name).join(", "));

const clientId = process.env.CLIENT_ID;
const guildIds = (process.env.GUILD_ID || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
    try {
        if (guildIds.length === 0) {
            // Sans GUILD_ID : déploiement global (jusqu'à ~1 h pour apparaître)
            await rest.put(Routes.applicationCommands(clientId), { body: commands });
            console.log(`✅ ${commands.length} commandes enregistrées en global`);
            return;
        }

        // Avec GUILD_ID : déploiement instantané sur chaque serveur listé
        for (const guildId of guildIds) {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
            console.log(`✅ ${commands.length} commandes enregistrées sur le serveur ${guildId}`);
        }

        // Et on retire les commandes globales pour éviter les doublons
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        console.log("🧹 Commandes globales supprimées (pas de doublons)");
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
})();
