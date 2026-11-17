import { MAX_NAME_LENGTH } from '../net/Protocol.js';
import { normalizeCode } from '../net/Transport.js';
import { clear, el } from './dom.js';
const DEFAULT_NAMES = ['Eddy', 'Hugo', 'Axel', 'Léa', 'Joueur 5', 'Joueur 6', 'Joueur 7', 'Joueur 8', 'Joueur 9', 'Joueur 10'];
const STORAGE_KEY = 'dutch-setup';
export function loadSetup() {
    const fallback = { count: 4, names: DEFAULT_NAMES.slice(), deckCount: 2, peekVariant: false, onlineName: '', mode: 'online' };
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
export function saveSetup(setup) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    }
    catch {
        // ignore
    }
}
/**
 *  Home screen: play online (create / join a room) or on this screen
 */
export function renderSetup(root, handlers, initial = {}) {
    const setup = loadSetup();
    while (setup.names.length < 10)
        setup.names.push(DEFAULT_NAMES[setup.names.length]);
    if (initial.code)
        setup.mode = 'online';
    const draw = () => {
        clear(root);
        const tabs = el('div', { class: 'tabs', role: 'tablist' }, el('button', { role: 'tab', class: setup.mode === 'online' ? 'tab active' : 'tab', id: 'tab-online',
            'aria-selected': String(setup.mode === 'online'), onclick: () => switchMode('online') }, 'En ligne'), el('button', { role: 'tab', class: setup.mode === 'local' ? 'tab active' : 'tab', id: 'tab-local',
            'aria-selected': String(setup.mode === 'local'), onclick: () => switchMode('local') }, 'Sur cet écran'));
        root.appendChild(el('section', { class: 'setup panel' }, tabs, setup.mode === 'online' ? online() : local()));
    };
    const switchMode = (mode) => {
        setup.mode = mode;
        saveSetup(setup);
        initial = { code: initial.code };
        draw();
    };
    // region Online
    const online = () => {
        const nameInput = el('input', {
            type: 'text', id: 'online-name', maxlength: String(MAX_NAME_LENGTH), value: setup.onlineName,
            placeholder: 'Votre prénom', autocomplete: 'nickname',
        });
        const codeInput = el('input', {
            type: 'text', id: 'room-code', maxlength: '8', value: initial.code ?? '', placeholder: 'CODE',
            autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', class: 'code-input',
        });
        const readName = () => {
            const name = nameInput.value.trim();
            if (!name) {
                nameInput.focus();
                nameInput.classList.add('invalid');
                return null;
            }
            setup.onlineName = name;
            saveSetup(setup);
            return name;
        };
        const create = () => {
            const name = readName();
            if (name)
                handlers.onHost(name);
        };
        const join = () => {
            const name = readName();
            const code = normalizeCode(codeInput.value);
            if (!name)
                return;
            if (code.length < 4) {
                codeInput.focus();
                codeInput.classList.add('invalid');
                return;
            }
            handlers.onJoin(code, name);
        };
        codeInput.addEventListener('keydown', e => e.key === 'Enter' && join());
        const busy = !!initial.busy;
        return el('div', { class: 'setup-online' }, el('label', { class: 'stack' }, 'Votre nom', nameInput), el('div', { class: 'online-choices' }, el('div', { class: 'choice' }, el('h3', {}, 'Créer une partie'), el('p', { class: 'hint' }, 'Vous recevez un code à partager avec les autres joueurs.'), el('button', { id: 'create-room', class: 'primary', disabled: busy, onclick: create }, 'Créer')), el('div', { class: 'choice' }, el('h3', {}, 'Rejoindre'), codeInput, el('button', { id: 'join-room', class: 'primary', disabled: busy, onclick: join }, 'Rejoindre'))), initial.busy ? el('p', { class: 'message info', role: 'status' }, initial.busy) : null, initial.error ? el('p', { class: 'message error', role: 'alert' }, initial.error) : null, el('p', { class: 'hint' }, 'Chacun joue sur son appareil et ne voit que ses cartes. ', 'La partie tourne sur l\'appareil de celui qui la crée : il doit garder la page ouverte.'));
    };
    // endregion
    // region Local
    const local = () => {
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
            const input = el('input', { type: 'text', maxlength: String(MAX_NAME_LENGTH), value: setup.names[i], 'aria-label': `Nom du joueur ${i + 1}` });
            nameInputs.push(input);
            names.appendChild(input);
        }
        const options = gameOptions(setup);
        function readNames() {
            nameInputs.forEach((input, i) => setup.names[i] = input.value.trim() || DEFAULT_NAMES[i]);
        }
        const start = () => {
            readNames();
            const chosen = options.read();
            setup.deckCount = chosen.deckCount;
            setup.peekVariant = chosen.peekVariant;
            saveSetup(setup);
            handlers.onLocal({ players: setup.names.slice(0, setup.count), ...chosen });
        };
        return el('div', { class: 'setup-local' }, el('label', {}, 'Nombre de joueurs ', countSelect), names, options.element, el('p', { class: 'hint' }, 'Tout le monde joue sur le même écran. ', 'Le but est d\'avoir le moins de points ; la partie s\'arrête quand un joueur atteint 100 points.'), el('button', { id: 'start', class: 'primary', onclick: start }, 'Distribuer les cartes'));
    };
    // endregion
    draw();
}
/**
 *  Decks and variant inputs, shared by the local setup and the online lobby
 */
export function gameOptions(initial, onChange) {
    const deckSelect = el('select', { id: 'deck-count', onchange: onChange }, el('option', { value: '1', selected: initial.deckCount === 1 }, '1 paquet (52 cartes)'), el('option', { value: '2', selected: initial.deckCount === 2 }, '2 paquets (104 cartes, recommandé)'));
    const peek = el('input', { type: 'checkbox', id: 'peek-variant', checked: initial.peekVariant, onchange: onChange });
    return {
        element: el('div', { class: 'game-options' }, el('label', {}, 'Cartes ', deckSelect), el('label', { class: 'checkbox' }, peek, ' Variante : chacun regarde ses 2 dernières cartes au début de la ronde')),
        read: () => ({ deckCount: parseInt(deckSelect.value, 10), peekVariant: peek.checked }),
    };
}
