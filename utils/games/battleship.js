/*
==================================================
BATAILLE NAVALE (grille 10x10, colonnes A-J, rangées 1-10)
Les bateaux sont placés au hasard et ne se touchent pas.
==================================================
*/

const SIZE = 10;
const LETTERS = "ABCDEFGHIJ";
const SHIPS = [
    { name: "Porte-avions", size: 5 },
    { name: "Croiseur", size: 4 },
    { name: "Contre-torpilleur", size: 3 },
    { name: "Sous-marin", size: 3 },
    { name: "Torpilleur", size: 2 }
];

function randomFleet() {
    for (;;) {
        const grid = Array.from({ length: SIZE }, () => new Array(SIZE).fill(-1)); // index du bateau
        const ships = [];
        let ok = true;

        for (const [index, model] of SHIPS.entries()) {
            let placed = false;
            for (let attempt = 0; attempt < 200 && !placed; attempt++) {
                const horizontal = Math.random() < 0.5;
                const r = Math.floor(Math.random() * (horizontal ? SIZE : SIZE - model.size + 1));
                const c = Math.floor(Math.random() * (horizontal ? SIZE - model.size + 1 : SIZE));
                const cells = Array.from({ length: model.size }, (_, k) => (horizontal ? [r, c + k] : [r + k, c]));

                // Aucune case du bateau ni de ses voisines ne doit être occupée
                const free = cells.every(([cr, cc]) => {
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const rr = cr + dr;
                            const ccc = cc + dc;
                            if (rr >= 0 && rr < SIZE && ccc >= 0 && ccc < SIZE && grid[rr][ccc] !== -1) return false;
                        }
                    }
                    return true;
                });
                if (!free) continue;

                for (const [cr, cc] of cells) grid[cr][cc] = index;
                ships.push({ ...model, cells, hits: 0 });
                placed = true;
            }
            if (!placed) {
                ok = false;
                break;
            }
        }
        if (ok) return { grid, ships, shots: Array.from({ length: SIZE }, () => new Array(SIZE).fill(null)) };
    }
}

// "B7" -> [6, 1]  (rangée, colonne)
function parseCoord(text) {
    const match = String(text)
        .trim()
        .toUpperCase()
        .match(/^([A-J])\s*(10|[1-9])$|^(10|[1-9])\s*([A-J])$/);
    if (!match) return null;
    const letter = match[1] || match[4];
    const number = Number(match[2] || match[3]);
    return [number - 1, LETTERS.indexOf(letter)];
}

const coordName = (r, c) => `${LETTERS[c]}${r + 1}`;

// Tir sur une flotte. Renvoie "miss" | "hit" | "sunk" | "already"
function fire(fleet, r, c) {
    if (fleet.shots[r][c]) return { result: "already" };
    const index = fleet.grid[r][c];
    if (index === -1) {
        fleet.shots[r][c] = "miss";
        return { result: "miss" };
    }
    const ship = fleet.ships[index];
    ship.hits++;
    fleet.shots[r][c] = "hit";
    if (ship.hits === ship.size) {
        for (const [sr, sc] of ship.cells) fleet.shots[sr][sc] = "sunk";
        return { result: "sunk", ship };
    }
    return { result: "hit", ship };
}

const allSunk = (fleet) => fleet.ships.every((s) => s.hits === s.size);
const shipsLeft = (fleet) => fleet.ships.filter((s) => s.hits < s.size).length;

/*
==================================================
IA : chasse / cible
level 0 = au hasard, 1 = chasse-cible, 2 = chasse-cible + damier
==================================================
*/

function botShot(fleet, level) {
    const untried = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!fleet.shots[r][c]) untried.push([r, c]);
    const random = (list) => list[Math.floor(Math.random() * list.length)];
    if (level === 0) return random(untried);

    // Cases touchées d'un bateau pas encore coulé
    const hits = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (fleet.shots[r][c] === "hit") hits.push([r, c]);

    if (hits.length > 0) {
        const candidates = [];
        const inGrid = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE && !fleet.shots[r][c];
        if (hits.length >= 2) {
            // On suit l'alignement des touches
            const horizontal = hits.every(([r]) => r === hits[0][0]);
            const vertical = hits.every(([, c]) => c === hits[0][1]);
            if (horizontal || vertical) {
                const sorted = [...hits].sort((a, b) => (horizontal ? a[1] - b[1] : a[0] - b[0]));
                const [first, last] = [sorted[0], sorted.at(-1)];
                const ends = horizontal
                    ? [
                          [first[0], first[1] - 1],
                          [last[0], last[1] + 1]
                      ]
                    : [
                          [first[0] - 1, first[1]],
                          [last[0] + 1, last[1]]
                      ];
                for (const [r, c] of ends) if (inGrid(r, c)) candidates.push([r, c]);
            }
        }
        if (candidates.length === 0) {
            for (const [r, c] of hits) {
                for (const [dr, dc] of [
                    [0, 1],
                    [0, -1],
                    [1, 0],
                    [-1, 0]
                ]) {
                    if (inGrid(r + dr, c + dc)) candidates.push([r + dr, c + dc]);
                }
            }
        }
        if (candidates.length > 0) return random(candidates);
    }

    // Les bateaux ne se touchent pas : inutile de tirer à côté d'un bateau coulé
    const nearSunk = (r, c) => {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (fleet.shots[r + dr]?.[c + dc] === "sunk") return true;
            }
        }
        return false;
    };
    let pool = untried.filter(([r, c]) => !nearSunk(r, c));
    if (level >= 2) {
        const parity = pool.filter(([r, c]) => (r + c) % 2 === 0);
        if (parity.length) pool = parity;
    }
    return random(pool.length ? pool : untried);
}

module.exports = { SIZE, LETTERS, SHIPS, randomFleet, parseCoord, coordName, fire, allSunk, shipsLeft, botShot };
