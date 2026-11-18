const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const { ECONOMY } = require("../config");
const { EPHEMERAL, money } = require("../utils/helpers");
const c = require("../utils/casino");
const { crashImage } = require("../utils/casinoRender");

const TICK = 1000;

function render({ bet, multiplier, auto, state, crash = null, payout = 0 }) {
    // Temps écoulé correspondant au multiplicateur affiché (pour dessiner la courbe)
    const elapsed = c.crashTimeFor(Math.max(1, multiplier));
    const gain = Math.floor(bet * multiplier);
    const embed = new EmbedBuilder().setTitle("🚀 Crash");
    let description = `📈 **x${multiplier.toFixed(2)}**\n💰 Mise : **${money(bet)}**`;
    if (auto) description += `\n🤖 Encaissement auto à **x${auto.toFixed(2)}**`;

    if (state === "running") {
        description += `\n\n📈 Gain actuel : **${money(gain)}**\nEncaisse avant le crash !`;
        embed.setColor("Blue");
    } else if (state === "cashed") {
        description += `\n\n✅ Encaissé à **x${multiplier.toFixed(2)}** → **${money(payout)}** (+${money(payout - bet)})`;
        description += `\n💥 La fusée a crashé à x${crash.toFixed(2)}`;
        embed.setColor("Green");
    } else {
        description = `💥 **CRASH à x${crash.toFixed(2)}**\n💰 Mise : **${money(bet)}**\n\n❌ Perdu : −${money(bet)}`;
        embed.setColor("Red");
    }
    embed.setDescription(description);

    const components =
        state === "running"
            ? [
                  new ActionRowBuilder().addComponents(
                      new ButtonBuilder()
                          .setCustomId("crash_cashout")
                          .setLabel(`Encaisser ${money(gain)}`)
                          .setEmoji("💸")
                          .setStyle(ButtonStyle.Success)
                  )
              ]
            : [];

    // Image de la courbe et de la fusée, redessinée à chaque mise à jour
    const image = crashImage({
        multiplier,
        elapsed,
        state,
        cashout: state === "cashed" ? `Encaissé · la fusée a crashé à x${crash.toFixed(2)}` : null
    });
    embed.setImage(`attachment://${image.name}`);
    return { embeds: [embed], files: [image.attachment], attachments: [], components };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("crash")
        .setDescription("Le multiplicateur monte… encaisse avant qu'il ne crashe !")
        .addIntegerOption((o) =>
            o
                .setName("mise")
                .setDescription("Montant de la mise")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(ECONOMY.MAX_BET)
        )
        .addNumberOption((o) =>
            o
                .setName("auto")
                .setDescription("Encaisser automatiquement à ce multiplicateur (ex : 2)")
                .setMinValue(1.01)
                .setMaxValue(c.CRASH_MAX)
        ),

    async execute(interaction) {
        const economy = interaction.client.economy;
        const userId = interaction.user.id;
        const bet = interaction.options.getInteger("mise");
        const auto = interaction.options.getNumber("auto");
        if (!(await c.placeBet(interaction, bet))) return;

        const crash = c.crashPoint();
        let finished = false;

        const response = await interaction.reply({
            ...render({ bet, multiplier: 1, auto, state: "running" }),
            withResponse: true
        });
        const message = response.resource.message;
        const start = Date.now();

        const finish = async (cashoutAt, component = null) => {
            if (finished) return;
            finished = true;
            collector.stop();
            clearTimeout(timer);
            let payload;
            if (cashoutAt !== null) {
                const payout = Math.floor(bet * cashoutAt);
                c.settle(economy, userId, payout);
                payload = render({ bet, multiplier: cashoutAt, auto, state: "cashed", crash, payout });
            } else {
                c.settle(economy, userId, 0);
                payload = render({ bet, multiplier: crash, auto, state: "crashed", crash });
            }
            if (component) await component.update(payload).catch(() => {});
            else await interaction.editReply(payload).catch(() => {});
        };

        // Bouton "Encaisser"
        const collector = message.createMessageComponentCollector({ time: 2 * 60 * 1000 });
        collector.on("collect", async (button) => {
            if (button.user.id !== userId) {
                return button.reply({ content: "❌ Ce n'est pas ta fusée.", flags: EPHEMERAL });
            }
            if (finished) return button.deferUpdate();
            const now = c.crashMultiplierAt(Date.now() - start);
            // Le crash a eu lieu avant le clic : perdu
            await finish(now < crash ? now : null, button);
        });

        // Montée du multiplicateur
        const crashTime = c.crashTimeFor(crash);
        const autoTime = auto && auto <= crash ? c.crashTimeFor(auto) : Infinity;
        let timer;
        const tick = async () => {
            if (finished) return;
            const elapsed = Date.now() - start;
            if (elapsed >= autoTime) return finish(auto);
            if (elapsed >= crashTime) {
                // Plafond atteint sans crash : encaissement automatique au maximum
                return finish(crash >= c.CRASH_MAX ? c.CRASH_MAX : null);
            }
            await interaction
                .editReply(render({ bet, multiplier: c.crashMultiplierAt(elapsed), auto, state: "running" }))
                .catch(() => {});
            const next = Math.min(TICK, autoTime - (Date.now() - start), crashTime - (Date.now() - start));
            timer = setTimeout(tick, Math.max(50, next));
        };
        timer = setTimeout(tick, Math.min(TICK, crashTime, autoTime));
    }
};
