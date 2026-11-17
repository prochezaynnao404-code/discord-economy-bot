require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const commands = fs
    .readdirSync(path.join(__dirname, "slashCommands"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => require(`./slashCommands/${file}`).data.toJSON());

console.log("Commandes :", commands.map((c) => c.name).join(", "));

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
    try {
        // Avec GUILD_ID : déploiement instantané sur un serveur. Sinon : global.
        const route = process.env.GUILD_ID
            ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
            : Routes.applicationCommands(process.env.CLIENT_ID);

        await rest.put(route, { body: commands });
        console.log(`✅ ${commands.length} slash commands enregistrées`);
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
})();
