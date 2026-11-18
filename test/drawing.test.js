const test = require("node:test");
const assert = require("node:assert");

const { Economy } = require("../utils/db");
const {
    SIZE,
    DRAWING,
    WORD_LIST,
    createCanvasState,
    serialize,
    isBlank,
    isValidPixels,
    applyAction,
    checkGuess,
    wordHint,
    letterIndexes,
    roundPoints,
    DUEL
} = require("../utils/drawing");
const { renderEditor, renderArtwork } = require("../utils/drawingRender");
const { syncTitles } = require("../utils/titles");

const at = (s, x, y) => s.pixels[y * SIZE + x];

test("peindre, crayon baissé, pas ×3 et bords de la toile", () => {
    const s = createCanvasState();
    assert.ok(isBlank(s));
    applyAction(s, "paint");
    assert.strictEqual(at(s, 8, 8), 1);

    applyAction(s, "color", "4");
    applyAction(s, "pen"); // baisser = peint la case courante
    applyAction(s, "step");
    applyAction(s, "right"); // 3 cases peintes en rouge
    assert.deepStrictEqual([at(s, 8, 8), at(s, 9, 8), at(s, 10, 8), at(s, 11, 8)], [4, 4, 4, 4]);
    assert.deepStrictEqual(s.cursor, { x: 11, y: 8 });

    for (let i = 0; i < 5; i++) applyAction(s, "right");
    assert.strictEqual(s.cursor.x, SIZE - 1); // bloqué au bord
    assert.strictEqual(applyAction(s, "right"), false);
    assert.strictEqual(applyAction(s, "color", "99"), false);
});

test("taille 3, remplissage, gomme, annuler et tout effacer", () => {
    const s = createCanvasState();
    applyAction(s, "brush");
    applyAction(s, "paint");
    let painted = s.pixels.filter((p) => p === 1).length;
    assert.strictEqual(painted, 9);

    applyAction(s, "undo");
    assert.ok(isBlank(s));

    applyAction(s, "color", "10");
    applyAction(s, "fill"); // toute la toile en bleu
    assert.ok(s.pixels.every((p) => p === 10));
    assert.strictEqual(applyAction(s, "fill"), false); // déjà de cette couleur

    applyAction(s, "eraser");
    applyAction(s, "brush"); // retour à 1
    applyAction(s, "paint");
    assert.strictEqual(at(s, 8, 8), 0);

    applyAction(s, "clear");
    assert.ok(isBlank(s));
    applyAction(s, "undo");
    assert.strictEqual(at(s, 0, 0), 10);
});

test("le remplissage s'arrête aux contours", () => {
    const s = createCanvasState();
    // ligne verticale noire en x = 8
    s.cursor = { x: 8, y: 0 };
    applyAction(s, "pen");
    for (let i = 0; i < SIZE; i++) applyAction(s, "down");
    applyAction(s, "pen");
    s.cursor = { x: 0, y: 0 };
    applyAction(s, "color", "6");
    applyAction(s, "fill");
    assert.strictEqual(at(s, 7, 5), 6);
    assert.strictEqual(at(s, 9, 5), 0); // de l'autre côté du trait
});

test("sérialisation : 256 caractères hexadécimaux, aller-retour", () => {
    const s = createCanvasState();
    applyAction(s, "color", "15");
    applyAction(s, "paint");
    const text = serialize(s);
    assert.ok(isValidPixels(text));
    assert.strictEqual(serialize(createCanvasState(text)), text);
    assert.ok(renderEditor(s).length > 1000);
    assert.ok(renderArtwork(text, { title: "Test", author: "par moi" }).length > 1000);
});

test("devinettes : accents, pluriel, presque et indice", () => {
    assert.strictEqual(checkGuess("Gateau", "gâteau"), "exact");
    assert.strictEqual(checkGuess("  CHATS ", "chat"), "exact");
    assert.strictEqual(checkGuess("bonhomme de neige", "bonhomme de neige"), "exact");
    assert.strictEqual(checkGuess("papilon", "papillon"), "close");
    assert.strictEqual(checkGuess("chien", "chat"), "wrong");
    assert.strictEqual(checkGuess("", "chat"), "wrong");
    assert.strictEqual(checkGuess("c'est une fleur !", "fleur"), "exact");
    assert.strictEqual(checkGuess("c'est pirate", "pirate"), "exact");
    assert.strictEqual(checkGuess("un bonhomme de neige ?", "bonhomme de neige"), "exact");
    assert.strictEqual(checkGuess("arc en ciel", "arc-en-ciel"), "exact");
    assert.strictEqual(checkGuess("pile", "île"), "wrong");
    assert.strictEqual(checkGuess("chatte", "chat"), "wrong");
    assert.strictEqual(wordHint("arc-en-ciel"), "_ _ _ - _ _ - _ _ _ _");
    assert.strictEqual(wordHint("chat", new Set([0])), "C _ _ _");
    assert.deepStrictEqual(letterIndexes("arc-en"), [0, 1, 2, 4, 5]);
    assert.strictEqual(new Set(WORD_LIST.map((w) => w.word)).size, WORD_LIST.length);
    assert.ok(WORD_LIST.length >= DUEL.ROUNDS * 10);
    assert.strictEqual(roundPoints(30_500), DUEL.BASE_POINTS + 30);
});

test("galerie : limite d'œuvres, modification, j'aime et titres", () => {
    const eco = new Economy(":memory:");
    const pixels = "1".repeat(SIZE * SIZE);
    const first = eco.saveDrawing("a", "Soleil", pixels, null, 1);
    assert.strictEqual(first.status, "ok");
    for (let i = 1; i < DRAWING.MAX_PER_USER; i++) eco.saveDrawing("a", `n${i}`, pixels, null, 1 + i);
    assert.strictEqual(eco.saveDrawing("a", "trop", pixels).status, "full");

    // Modifier n'en crée pas une nouvelle ; impossible sur l'œuvre d'un autre
    assert.strictEqual(eco.saveDrawing("a", "Soleil 2", pixels, first.id, 100).status, "ok");
    assert.strictEqual(eco.getDrawing(first.id).name, "Soleil 2");
    assert.strictEqual(eco.saveDrawing("b", "vol", pixels, first.id).status, "notfound");

    assert.strictEqual(eco.toggleLike(first.id, "a"), null); // sa propre œuvre
    assert.deepStrictEqual(eco.toggleLike(first.id, "b"), { liked: true, likes: 1 });
    assert.deepStrictEqual(eco.toggleLike(first.id, "c"), { liked: true, likes: 2 });
    assert.deepStrictEqual(eco.toggleLike(first.id, "c"), { liked: false, likes: 1 });
    assert.strictEqual(eco.likesReceived("a"), 1);
    assert.strictEqual(eco.topArtists()[0].userId, "a");

    assert.ok(syncTitles(eco, "a").some((t) => t.id === "artiste"));

    assert.strictEqual(eco.deleteDrawing("b", first.id), false);
    assert.ok(eco.deleteDrawing("a", first.id));
    assert.strictEqual(eco.likesReceived("a"), 0); // j'aime supprimés avec l'œuvre
    assert.strictEqual(eco.getDrawings("a").length, DRAWING.MAX_PER_USER - 1);
});

test("parties : statistiques et meilleur score", () => {
    const eco = new Economy(":memory:");
    eco.recordDrawGame(
        [
            { userId: "a", guesses: 2 },
            { userId: "b", guesses: 1 }
        ],
        300
    );
    eco.recordDrawGame(
        [
            { userId: "a", guesses: 1 },
            { userId: "b", guesses: 0 }
        ],
        120
    );
    const a = eco.getUser("a");
    assert.strictEqual(a.drawGames, 2);
    assert.strictEqual(a.drawGuesses, 3);
    assert.strictEqual(a.drawBest, 300);
    assert.strictEqual(eco.topDrawScores()[0].drawBest, 300);
});
