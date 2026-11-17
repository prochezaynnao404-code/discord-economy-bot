const fs = require("fs");
const path = require("path");
const { AuditLogEvent, AttachmentBuilder, EmbedBuilder } = require("discord.js");

const config = require("../config");

/*
==================================================
RAPPORT D'INCIDENT (envoyé en MP au propriétaire du bot)
==================================================
*/

const ACTION_LABELS = {
    [AuditLogEvent.ChannelDelete]: "Salons supprimés",
    [AuditLogEvent.ChannelCreate]: "Salons créés",
    [AuditLogEvent.ChannelUpdate]: "Salons modifiés",
    [AuditLogEvent.ChannelOverwriteCreate]: "Permissions de salon ajoutées",
    [AuditLogEvent.ChannelOverwriteUpdate]: "Permissions de salon modifiées",
    [AuditLogEvent.ChannelOverwriteDelete]: "Permissions de salon retirées",
    [AuditLogEvent.RoleDelete]: "Rôles supprimés",
    [AuditLogEvent.RoleCreate]: "Rôles créés",
    [AuditLogEvent.RoleUpdate]: "Rôles modifiés",
    [AuditLogEvent.MemberRoleUpdate]: "Rôles de membres changés",
    [AuditLogEvent.MemberUpdate]: "Membres modifiés (pseudo, exclusion…)",
    [AuditLogEvent.MemberBanAdd]: "Membres bannis",
    [AuditLogEvent.MemberKick]: "Membres expulsés",
    [AuditLogEvent.MemberPrune]: "Purges de membres",
    [AuditLogEvent.WebhookCreate]: "Webhooks créés",
    [AuditLogEvent.EmojiDelete]: "Emojis supprimés",
    [AuditLogEvent.GuildUpdate]: "Paramètres du serveur modifiés",
    [AuditLogEvent.BotAdd]: "Bots ajoutés"
};

const CATEGORY_LABELS = {
    createdChannels: "🗑️ Salons créés par l'attaquant supprimés",
    createdRoles: "🗑️ Rôles créés par l'attaquant supprimés",
    webhooks: "🗑️ Webhooks supprimés",
    bots: "🤖 Bots ajoutés par l'attaquant bannis",
    unbans: "🔓 Membres débannis",
    roles: "🎭 Rôles recréés",
    channels: "💬 Salons recréés",
    updates: "↩️ Modifications annulées",
    guild: "⚙️ Serveur",
    emojis: "😀 Emojis recréés",
    invites: "✉️ Invitations renvoyées",
    irreversible: "⚠️ Impossible à annuler"
};

function duration(ms) {
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m} min ${String(s).padStart(2, "0")} s`;
}

const ts = (ms, style = "f") => (ms ? `<t:${Math.floor(ms / 1000)}:${style}>` : "inconnu");

function clip(lines, max = 1000) {
    let out = "";
    for (let i = 0; i < lines.length; i++) {
        const next = (out ? "\n" : "") + lines[i];
        if (out.length + next.length > max - 20) return `${out}\n… (+${lines.length - i})`;
        out += next;
    }
    return out || "—";
}

function buildReport(incident) {
    const { guild, executor, inviter, entries, results } = incident;

    // ---------- Dégâts ----------
    const damage = new Map();
    for (const e of entries) damage.set(e.action, (damage.get(e.action) || 0) + 1);
    const damageLines = [...damage.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([action, n]) => `**${n}** × ${ACTION_LABELS[action] ?? `Action ${action}`}`);

    // ---------- Restauration ----------
    const byCategory = new Map();
    for (const r of results) {
        if (!byCategory.has(r.category)) byCategory.set(r.category, []);
        byCategory.get(r.category).push(r);
    }
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok && r.category !== "irreversible").length;

    const restoreLines = [...byCategory.entries()].map(([category, list]) => {
        const ok = list.filter((r) => r.ok).length;
        const status = category === "irreversible" ? "" : ` (${ok}/${list.length})`;
        return `${CATEGORY_LABELS[category] ?? category}${status}`;
    });

    // ---------- Auteur ----------
    const inviterText = inviter
        ? inviter.code === "bot"
            ? `ajouté par <@${inviter.inviterId}> (${inviter.inviterTag ?? inviter.inviterId})`
            : inviter.inviterId
              ? `<@${inviter.inviterId}> (${inviter.inviterTag ?? inviter.inviterId})${inviter.code ? ` via \`${inviter.code}\`` : ""}`
              : `lien \`${inviter.code ?? "?"}\` (créateur inconnu)`
        : "inconnu (arrivé avant l'installation du suivi des invitations)";

    const color = failCount === 0 ? 0x2ecc71 : 0xe67e22;

    const main = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`🚨 Attaque neutralisée sur ${guild.name}`)
        .setDescription(`**Déclencheur :** ${incident.trigger}`)
        .addFields(
            {
                name: "👤 Auteur",
                value: `<@${executor.id}>\n\`${executor.tag}\`\nID : \`${executor.id}\`${executor.bot ? "\n🤖 **C'est un bot**" : ""}`,
                inline: true
            },
            { name: "✉️ Invité par", value: inviterText, inline: true },
            {
                name: "📅 Compte",
                value: `Créé ${ts(executor.createdAt, "R")}\nArrivé ${ts(executor.joinedAt, "R")}`,
                inline: true
            },
            {
                name: "🎭 Ses rôles",
                value: clip(executor.roles.length ? executor.roles.map((r) => `@${r}`) : ["aucun"], 500)
            },
            {
                name: "🔨 Sanction",
                value: incident.sanction.ok ? `✅ ${incident.sanction.method}` : `❌ ${incident.sanction.detail}`
            },
            {
                name: "⏱️ Chronologie",
                value:
                    `Première action : ${ts(incident.startedAt, "T")}\n` +
                    `Dernière action : ${ts(incident.lastActionAt, "T")}\n` +
                    `**Durée de l'attaque : ${duration(incident.lastActionAt - incident.startedAt)}**\n` +
                    `Détection : +${duration(incident.detectedAt - incident.startedAt)}\n` +
                    `Sanction : +${duration(incident.sanctionedAt - incident.startedAt)}\n` +
                    `**Restauration : ${duration(incident.finishedAt - incident.restoreStartedAt)}**`
            },
            { name: `💥 Dégâts (${entries.length} actions)`, value: clip(damageLines) }
        )
        .setTimestamp(incident.finishedAt);

    const restore = new EmbedBuilder()
        .setColor(color)
        .setTitle(failCount === 0 ? "✅ Serveur restauré" : `⚠️ Serveur restauré avec ${failCount} échec(s)`)
        .setDescription(clip(restoreLines))
        .setFooter({ text: `${okCount} opération(s) réussie(s) • détail complet dans le fichier joint` });

    // Détails par catégorie (les plus importantes)
    for (const category of ["channels", "createdChannels", "roles", "unbans", "invites", "irreversible"]) {
        const list = byCategory.get(category);
        if (!list) continue;
        restore.addFields({
            name: CATEGORY_LABELS[category],
            value: clip(
                list.map((r) => `${r.ok ? "✅" : "❌"} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`),
                900
            )
        });
    }
    const failures = results.filter((r) => !r.ok && r.category !== "irreversible");
    if (failures.length) {
        restore.addFields({
            name: "❌ Échecs",
            value: clip(
                failures.map((r) => `${r.label} : ${r.detail}`),
                900
            )
        });
    }

    // ---------- Fichier texte complet ----------
    const date = (ms) => (ms ? new Date(ms).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "?");
    const lines = [
        `RAPPORT D'INCIDENT — ${guild.name} (${guild.id})`,
        `Généré le ${date(incident.finishedAt)}`,
        "",
        `Déclencheur : ${incident.trigger}`,
        `Auteur : ${executor.tag} (${executor.id})${executor.bot ? " [BOT]" : ""}`,
        `Compte créé le : ${date(executor.createdAt)}`,
        `Arrivé sur le serveur le : ${date(executor.joinedAt)}`,
        `Invité par : ${inviterText.replace(/<@|>|`/g, "")}`,
        `Rôles : ${executor.roles.join(", ") || "aucun"}`,
        `Sanction : ${incident.sanction.ok ? incident.sanction.method : `ÉCHEC — ${incident.sanction.detail}`}`,
        "",
        "CHRONOLOGIE",
        `  Première action  : ${date(incident.startedAt)}`,
        `  Dernière action  : ${date(incident.lastActionAt)}`,
        `  Durée de l'attaque : ${duration(incident.lastActionAt - incident.startedAt)}`,
        `  Détection        : +${duration(incident.detectedAt - incident.startedAt)}`,
        `  Restauration     : ${duration(incident.finishedAt - incident.restoreStartedAt)}`,
        "",
        `ACTIONS DE L'ATTAQUANT (${entries.length})`,
        ...entries.map(
            (e) =>
                `  [${new Date(e.at).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris" })}] ` +
                `${ACTION_LABELS[e.action] ?? e.action} — ${e.targetName ?? e.targetId ?? ""}`
        ),
        "",
        `RESTAURATION (${okCount} réussie(s), ${failCount} échec(s))`,
        ...results.map(
            (r) =>
                `  ${r.ok ? "OK   " : "ÉCHEC"} [${CATEGORY_LABELS[r.category]?.replace(/^\S+ /, "") ?? r.category}] ` +
                `${r.label}${r.detail ? ` — ${r.detail}` : ""}`
        ),
        "",
        "Note : les messages des salons supprimés ne peuvent pas être récupérés (limite de Discord)."
    ];
    const text = lines.join("\n");

    return { embeds: [main, restore], text };
}

async function sendReport(client, incident) {
    const { embeds, text } = buildReport(incident);
    const fileName = `incident-${incident.guild.id}-${new Date(incident.finishedAt).toISOString().replace(/[:.]/g, "-")}.txt`;

    // Copie sur le disque, au cas où le MP n'arrive pas
    const dir = path.join(config.BACKUP_DIR, "incidents");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), text);

    try {
        const owner = await client.users.fetch(config.OWNER_ID);
        await owner.send({
            content: "🛡️ **Rapport Anti-Nuke**",
            embeds,
            files: [new AttachmentBuilder(Buffer.from(text, "utf8"), { name: fileName })]
        });
        return true;
    } catch (error) {
        console.error(`❌ Impossible d'envoyer le rapport en MP (MP fermés ?) : ${error.message}. Copie : ${fileName}`);
        return false;
    }
}

module.exports = { sendReport, buildReport, duration };
