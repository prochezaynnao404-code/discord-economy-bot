const test = require("node:test");
const assert = require("node:assert");
const { AuditLogEvent, Collection, PermissionFlagsBits } = require("discord.js");

const { detectTrigger, CONFIG } = require("../security/antiNuke");
const { buildReport, duration } = require("../security/report");

const guild = {
    id: "g",
    name: "Test",
    roles: {
        cache: new Collection([
            ["admin", { id: "admin", permissions: { bitfield: PermissionFlagsBits.Administrator } }],
            ["fun", { id: "fun", permissions: { bitfield: 0n } }]
        ])
    }
};

const rec = (action, at, changes = [], extra = {}) => ({
    id: String(at),
    action,
    at,
    changes,
    targetId: "t",
    ...extra
});

test("seuil : 3 suppressions de salons en 10 s déclenchent l'incident", () => {
    const journal = { entries: [] };
    for (const at of [0, 1000]) {
        const r = rec(AuditLogEvent.ChannelDelete, at);
        journal.entries.push(r);
        assert.strictEqual(detectTrigger(r, journal, guild), null);
    }
    const third = rec(AuditLogEvent.ChannelDelete, 2000);
    journal.entries.push(third);
    assert.match(detectTrigger(third, journal, guild), /3 actions/);
});

test("seuil : des suppressions espacées ne déclenchent rien", () => {
    const journal = { entries: [] };
    for (const at of [0, CONFIG.WINDOW + 1, 2 * CONFIG.WINDOW + 2]) {
        const r = rec(AuditLogEvent.ChannelDelete, at);
        journal.entries.push(r);
        assert.strictEqual(detectTrigger(r, journal, guild), null);
    }
});

test("instantané : ajout de bot, permissions et rôles dangereux, URL", () => {
    const journal = { entries: [] };
    assert.match(detectTrigger(rec(AuditLogEvent.BotAdd, 0, [], { targetName: "Nuker" }), journal, guild), /Nuker/);

    const perms = [{ key: "permissions", old: "0", new: String(PermissionFlagsBits.Administrator) }];
    assert.match(detectTrigger(rec(AuditLogEvent.RoleUpdate, 0, perms), journal, guild), /dangereuses/);
    const harmless = [{ key: "permissions", old: "0", new: String(PermissionFlagsBits.SendMessages) }];
    assert.strictEqual(detectTrigger(rec(AuditLogEvent.RoleUpdate, 0, harmless), journal, guild), null);

    const giveAdmin = [{ key: "$add", new: [{ id: "admin", name: "Admin" }] }];
    assert.match(detectTrigger(rec(AuditLogEvent.MemberRoleUpdate, 0, giveAdmin), journal, guild), /@Admin/);
    const giveFun = [{ key: "$add", new: [{ id: "fun", name: "Fun" }] }];
    assert.strictEqual(detectTrigger(rec(AuditLogEvent.MemberRoleUpdate, 0, giveFun), journal, guild), null);

    const vanity = [{ key: "vanity_url_code", old: "abc", new: "xyz" }];
    assert.match(detectTrigger(rec(AuditLogEvent.GuildUpdate, 0, vanity), journal, guild), /URL/);
});

test("rapport : contenu et durées", () => {
    assert.strictEqual(duration(450), "450 ms");
    assert.strictEqual(duration(3400), "3,4 s");
    assert.strictEqual(duration(125000), "2 min 05 s");

    const { embeds, text } = buildReport({
        guild: { id: "g", name: "Test" },
        trigger: "3 actions",
        executor: { id: "e", tag: "evil", bot: true, createdAt: 1, joinedAt: 2, roles: ["Admin"] },
        inviter: { inviterId: "a", inviterTag: "alice", code: "bot" },
        sanction: { ok: true, method: "banni du serveur" },
        startedAt: 1000,
        lastActionAt: 3000,
        detectedAt: 2000,
        sanctionedAt: 2100,
        restoreStartedAt: 6000,
        finishedAt: 9000,
        entries: [{ action: AuditLogEvent.ChannelDelete, at: 1000, targetName: "général" }],
        results: [
            { category: "channels", label: "#général", ok: true },
            { category: "roles", label: "@Modo", ok: false, detail: "Missing Permissions" }
        ]
    });
    const main = embeds[0].data;
    assert.ok(main.fields.find((f) => f.name.includes("Invité")).value.includes("ajouté par"));
    assert.ok(main.fields.find((f) => f.name.includes("Chronologie")).value.includes("2,0 s"));
    assert.match(embeds[1].data.title, /1 échec/);
    assert.ok(text.includes("[BOT]") && text.includes("ÉCHEC") && text.includes("Missing Permissions"));
});
