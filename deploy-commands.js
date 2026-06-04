require("dotenv").config();

const fs = require("fs");

const {
    REST,
    Routes
} = require("discord.js");

const commands = [];

const commandFiles =
    fs.readdirSync("./slashCommands")
    .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {

    const command =
        require(`./slashCommands/${file}`);

        console.log(command.data.name);
    commands.push(
        command.data.toJSON()
    );
}

const rest = new REST({
    version: "10"
}).setToken(process.env.TOKEN);

(async () => {

    try {

        console.log(
            "⏳ Enregistrement..."
        );

        await rest.put(
            Routes.applicationCommands(
                process.env.CLIENT_ID
            ),
            {
                body: commands
            }
        );

        console.log(
            "✅ Slash commands enregistrées"
        );

    } catch (error) {

        console.log(error);
    }
})();