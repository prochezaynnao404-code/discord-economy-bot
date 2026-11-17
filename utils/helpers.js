const { MessageFlags } = require("discord.js");

const EPHEMERAL = MessageFlags.Ephemeral;

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function money(amount) {
    return `${Number(amount).toLocaleString("fr-FR")} $`;
}

function duration(ms) {
    const totalMinutes = Math.ceil(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} min`;
    return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

// Empêche un joueur de lancer deux mini-jeux à saisie de texte en même temps
const busyUsers = new Set();

function lockUser(userId) {
    if (busyUsers.has(userId)) return false;
    busyUsers.add(userId);
    return true;
}

function unlockUser(userId) {
    busyUsers.delete(userId);
}

module.exports = { EPHEMERAL, randInt, pick, shuffle, money, duration, lockUser, unlockUser };
