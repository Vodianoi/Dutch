import { clear, el } from './dom.js';
const DEFAULT_NAMES = ['Eddy', 'Hugo', 'Axel', 'Léa', 'Joueur 5', 'Joueur 6', 'Joueur 7', 'Joueur 8', 'Joueur 9', 'Joueur 10'];
const STORAGE_KEY = 'dutch-setup';
function load() {
    const fallback = { count: 4, names: DEFAULT_NAMES.slice(), deckCount: 2, peekVariant: false };
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
        if (saved && Array.isArray(saved.names))
            return { ...fallback, ...saved };
    }
    catch {
        // storage unavailable: use defaults
    }
    return fallback;
}
function save(setup) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    }
    catch {
        // ignore
    }
}
/**
 *  Setup screen: number of players (2 to 10), names, number of decks and variant
 */
export function renderSetup(root, onStart) {
    const setup = load();
    while (setup.names.length < 10)
        setup.names.push(DEFAULT_NAMES[setup.names.length]);
    const draw = () => {
        clear(root);
        const nameInputs = [];
        const countSelect = el('select', { id: 'player-count', onchange: (e) => {
                setup.count = parseInt(e.target.value, 10);
                readNames();
                draw();
            } }, ...Array.from({ length: 9 }, (_, i) => {
            const n = i + 2;
            return el('option', { value: n, selected: n === setup.count }, `${n} joueurs`);
        }));
        const names = el('div', { class: 'setup-names' });
        for (let i = 0; i < setup.count; i++) {
            const input = el('input', { type: 'text', maxlength: '16', value: setup.names[i], 'aria-label': `Nom du joueur ${i + 1}` });
            nameInputs.push(input);
            names.appendChild(input);
        }
        const deckSelect = el('select', { id: 'deck-count' }, el('option', { value: '1', selected: setup.deckCount === 1 }, '1 paquet (52 cartes)'), el('option', { value: '2', selected: setup.deckCount === 2 }, '2 paquets (104 cartes, recommandé)'));
        const peek = el('input', { type: 'checkbox', id: 'peek-variant', checked: setup.peekVariant });
        function readNames() {
            nameInputs.forEach((input, i) => setup.names[i] = input.value.trim() || DEFAULT_NAMES[i]);
        }
        const start = () => {
            readNames();
            setup.deckCount = parseInt(deckSelect.value, 10);
            setup.peekVariant = peek.checked;
            save(setup);
            onStart({
                players: setup.names.slice(0, setup.count),
                deckCount: setup.deckCount,
                peekVariant: setup.peekVariant,
            });
        };
        root.appendChild(el('section', { class: 'setup panel' }, el('h2', {}, 'Nouvelle partie'), el('label', {}, 'Nombre de joueurs ', countSelect), names, el('label', {}, 'Cartes ', deckSelect), el('label', { class: 'checkbox' }, peek, ' Variante : chacun regarde ses 2 dernières cartes au début de la ronde'), el('p', { class: 'hint' }, 'Jeu en « hot-seat » : tout le monde joue sur le même écran. ', 'Le but est d\'avoir le moins de points ; la partie s\'arrête quand un joueur atteint 100 points.'), el('button', { id: 'start', class: 'primary', onclick: start }, 'Distribuer les cartes')));
    };
    draw();
}
