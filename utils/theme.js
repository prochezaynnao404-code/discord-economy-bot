const { EmbedBuilder: BaseEmbedBuilder } = require("discord.js");

/*
==================================================
THÈME COMMUN À TOUT LE BOT
- Une palette harmonisée : les anciens noms de couleurs
  ("Blue", "Gold", …) sont traduits automatiquement
- Chaque embed reçoit une couleur par défaut, la signature
  du bot en pied de page et l'heure
Les commandes importent EmbedBuilder depuis ce fichier au
lieu de discord.js : aucun autre changement n'est nécessaire.
==================================================
*/

const COLORS = {
    brand: 0x7c83fd,
    info: 0x5b8def,
    success: 0x43c59e,
    danger: 0xf2545b,
    warning: 0xf79a4b,
    gold: 0xf7c948,
    amber: 0xd9a441,
    purple: 0xa77bf3,
    teal: 0x2ec4b6,
    navy: 0x3b5ba9,
    neutral: 0x8a94a6
};

// Noms de couleurs Discord (et quelques anciens hex) → palette du thème
const ALIASES = {
    Blue: COLORS.info,
    Blurple: COLORS.brand,
    Green: COLORS.success,
    DarkGreen: 0x2fa37a,
    Red: COLORS.danger,
    DarkRed: 0xc23b44,
    Gold: COLORS.gold,
    DarkGold: COLORS.amber,
    Orange: COLORS.warning,
    DarkOrange: 0xe27d3a,
    Purple: COLORS.purple,
    DarkAqua: COLORS.teal,
    Aqua: COLORS.teal,
    Navy: COLORS.navy,
    Grey: COLORS.neutral,
    "#43b581": COLORS.success,
    "#00ff99": COLORS.success,
    "#3498db": COLORS.info,
    [0xe74c3c]: COLORS.danger
};

const brand = { name: "Économie", iconURL: null };

// Appelé une fois connecté : le pied de page prend le nom et l'avatar du bot
function setBrand(user) {
    brand.name = user.username;
    brand.iconURL = user.displayAvatarURL({ extension: "png", size: 64 });
}

function resolve(color) {
    if (color === null || color === undefined) return color;
    const key = typeof color === "string" ? color.toLowerCase() : color;
    return ALIASES[color] ?? ALIASES[key] ?? color;
}

class EmbedBuilder extends BaseEmbedBuilder {
    setColor(color) {
        return super.setColor(resolve(color));
    }

    toJSON() {
        const json = super.toJSON();
        if (json.color === undefined) json.color = COLORS.brand;
        if (!json.footer) {
            json.footer = { text: brand.name, ...(brand.iconURL && { icon_url: brand.iconURL }) };
        } else if (!json.footer.icon_url && brand.iconURL) {
            json.footer = { ...json.footer, icon_url: brand.iconURL };
        }
        if (!json.timestamp) json.timestamp = new Date().toISOString();
        return json;
    }
}

module.exports = { EmbedBuilder, COLORS, setBrand, resolveColor: resolve };
