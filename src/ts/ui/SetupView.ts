import {DutchOptions, EffectType} from '../Dutch.js';
import {MAX_NAME_LENGTH} from '../net/Protocol.js';
import {normalizeCode} from '../net/Transport.js';
import {
    ALL_EFFECTS, assignColors, checkSettings, CHOICES, cleanSettings, colorName, EFFECT_LABELS, GameSettings, PLAYER_COLORS,
} from '../Settings.js';
import {clear, el} from './dom.js';

const DEFAULT_NAMES = ['Eddy', 'Hugo', 'Axel', 'Léa', 'Joueur 5', 'Joueur 6', 'Joueur 7', 'Joueur 8', 'Joueur 9', 'Joueur 10'];
const STORAGE_KEY = 'dutch-setup';

interface SavedSetup {
    count: number;
    names: string[];
    /** Colour of each local player */
    colors: string[];
    settings: GameSettings;
    onlineName: string;
    onlineColor: string;
    mode: 'online' | 'local';
}

export function loadSetup(): SavedSetup {
    const fallback: SavedSetup = {
        count: 4, names: DEFAULT_NAMES.slice(), colors: assignColors(DEFAULT_NAMES.map(() => null)),
        settings: cleanSettings(null), onlineName: '', onlineColor: PLAYER_COLORS[0].value, mode: 'online',
    };
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
        if (saved && Array.isArray(saved.names)) {
            // Older saves kept deckCount and peekVariant at the top level
            const settings = cleanSettings(saved.settings ?? {deckCount: saved.deckCount, peekVariant: saved.peekVariant});
            const colors = assignColors(DEFAULT_NAMES.map((_, i) => Array.isArray(saved.colors) ? saved.colors[i] : null));
            const onlineColor = PLAYER_COLORS.some(c => c.value === saved.onlineColor) ? saved.onlineColor : fallback.onlineColor;
            return {...fallback, ...saved, settings, colors, onlineColor};
        }
    } catch {
        // storage unavailable: use defaults
    }
    return fallback;
}

export function saveSetup(setup: SavedSetup) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    } catch {
        // ignore
    }
}

export interface SetupHandlers {
    /** Everybody on this screen */
    onLocal(options: DutchOptions): void;
    /** Create an online game */
    onHost(name: string, color: string, settings: GameSettings): void;
    /** Join an online game */
    onJoin(code: string, name: string, color: string): void;
    /** Reopen the room this device was hosting */
    onResume?(): void;
    /** Forget the room this device was hosting */
    onForget?(): void;
}

export interface SetupInitial {
    code?: string;
    error?: string;
    busy?: string;
    /** Room this device was hosting and can reopen (the page was closed during the game) */
    resume?: { code: string; players: string[]; started: boolean };
}

/**
 *  Home screen: play online (create / join a room) or on this screen
 */
export function renderSetup(root: HTMLElement, handlers: SetupHandlers, initial: SetupInitial = {}) {
    const setup = loadSetup();
    while (setup.names.length < 10) setup.names.push(DEFAULT_NAMES[setup.names.length]);
    if (initial.code) setup.mode = 'online';

    const draw = () => {
        clear(root);
        const tabs = el('div', {class: 'tabs', role: 'group', 'aria-label': 'Mode de jeu'},
            el('button', {class: setup.mode === 'online' ? 'tab active' : 'tab', id: 'tab-online',
                'aria-pressed': String(setup.mode === 'online'), onclick: () => switchMode('online')}, 'En ligne'),
            el('button', {class: setup.mode === 'local' ? 'tab active' : 'tab', id: 'tab-local',
                'aria-pressed': String(setup.mode === 'local'), onclick: () => switchMode('local')}, 'Sur cet écran'));

        root.appendChild(el('section', {class: 'setup panel'},
            tabs,
            setup.mode === 'online' ? online() : local()));
    };

    const switchMode = (mode: 'online' | 'local') => {
        setup.mode = mode;
        saveSetup(setup);
        initial = {code: initial.code, resume: initial.resume};
        draw();
    };

    // region Online
    const online = () => {
        const nameError = el('p', {class: 'field-error', id: 'online-name-error'});
        const codeError = el('p', {class: 'field-error', id: 'room-code-error'});
        const nameInput = el('input', {
            type: 'text', id: 'online-name', 'aria-describedby': 'online-name-error', maxlength: String(MAX_NAME_LENGTH), value: setup.onlineName,
            placeholder: 'Votre prénom', autocomplete: 'nickname',
        });
        const codeInput = el('input', {
            type: 'text', id: 'room-code', maxlength: '8', value: initial.code ?? '', placeholder: 'CODE',
            'aria-label': 'Code de la partie', 'aria-describedby': 'room-code-error', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', class: 'code-input',
        });
        const color = colorButton(setup.onlineColor, () => [], 'Votre couleur', value => {
            setup.onlineColor = value;
            saveSetup(setup);
        });
        const readName = (): string | null => {
            const name = nameInput.value.trim();
            if (!name) {
                invalid(nameInput, nameError, 'Entrez votre prénom pour que les autres vous reconnaissent.');
                return null;
            }
            invalid(nameInput, nameError, null);
            setup.onlineName = name;
            saveSetup(setup);
            return name;
        };
        const create = () => {
            const name = readName();
            if (name) handlers.onHost(name, setup.onlineColor, setup.settings);
        };
        const join = () => {
            const name = readName();
            const code = normalizeCode(codeInput.value);
            if (!name) return;
            if (code.length < 4) {
                invalid(codeInput, codeError, 'Le code de la partie fait au moins 4 caractères.');
                return;
            }
            invalid(codeInput, codeError, null);
            handlers.onJoin(code, name, setup.onlineColor);
        };
        codeInput.addEventListener('keydown', e => e.key === 'Enter' && join());

        const busy = !!initial.busy;
        const resume = initial.resume;
        return el('div', {class: 'setup-online'},
            resume && !busy ? el('section', {class: 'resume', 'aria-labelledby': 'resume-title'},
                el('h3', {id: 'resume-title'}, resume.started ? 'Votre partie est en cours' : 'Votre salle d\'attente est ouverte'),
                el('p', {class: 'hint'}, `Partie ${resume.code} avec ${resume.players.join(', ')}. `,
                    'Les autres joueurs se reconnectent tout seuls dès que vous la reprenez.'),
                el('div', {class: 'resume-actions'},
                    el('button', {class: 'primary', id: 'resume-room', onclick: () => handlers.onResume?.()}, 'Reprendre la partie'),
                    el('button', {class: 'secondary', id: 'forget-room', onclick: () => handlers.onForget?.()}, 'Abandonner'))) : null,
            el('div', {class: 'stack'},
                el('label', {for: 'online-name'}, 'Votre nom'),
                el('div', {class: 'name-row'}, color, nameInput),
                nameError),
            el('div', {class: 'online-choices'},
                el('div', {class: 'choice'},
                    el('h3', {}, 'Créer une partie'),
                    el('p', {class: 'hint'}, 'Vous recevez un code à partager, et vous choisissez les règles dans la salle d\'attente.'),
                    el('button', {id: 'create-room', class: 'primary', disabled: busy, onclick: create}, 'Créer')),
                el('div', {class: 'choice'},
                    el('h3', {}, 'Rejoindre'),
                    codeInput,
                    codeError,
                    el('button', {id: 'join-room', class: 'primary', disabled: busy, onclick: join}, 'Rejoindre'))),
            initial.busy ? el('p', {class: 'message info', role: 'status'}, initial.busy) : null,
            initial.error ? el('p', {class: 'message error', role: 'alert'}, initial.error) : null,
            el('p', {class: 'hint'},
                'Chacun joue sur son appareil et ne voit que ses cartes. ',
                'La partie tourne sur l\'appareil de celui qui la crée. S\'il quitte l\'application, elle reprend quand il revient.'));
    };
    // endregion

    // region Local
    const local = () => {
        const nameInputs: HTMLInputElement[] = [];
        const error = el('p', {class: 'message error', role: 'alert', id: 'setup-error', hidden: true});

        const countSelect = el('select', {id: 'player-count', onchange: (e: Event) => {
            setup.count = parseInt((e.target as HTMLSelectElement).value, 10);
            readNames();
            saveSetup(setup);
            draw();
        }}, ...Array.from({length: 9}, (_, i) => {
            const n = i + 2;
            return el('option', {value: n, selected: n === setup.count}, `${n} joueurs`);
        }));

        const names = el('div', {class: 'setup-names'});
        for (let i = 0; i < setup.count; i++) {
            const input = el('input', {type: 'text', id: `player-name-${i}`, maxlength: String(MAX_NAME_LENGTH), value: setup.names[i]});
            nameInputs.push(input);
            const others = () => setup.colors.filter((_, j) => j !== i && j < setup.count);
            const color = colorButton(setup.colors[i], others, `Couleur du joueur ${i + 1}`, value => {
                setup.colors[i] = value;
                saveSetup(setup);
            });
            names.appendChild(el('div', {class: 'name-field'},
                el('label', {for: `player-name-${i}`}, `Joueur ${i + 1}`),
                el('div', {class: 'name-row'}, color, input)));
        }

        const options = gameOptions(setup.settings, () => {
            setup.settings = options.read();
            saveSetup(setup);
            error.hidden = true;
        });

        function readNames() {
            nameInputs.forEach((input, i) => setup.names[i] = input.value.trim() || DEFAULT_NAMES[i]);
        }

        const start = () => {
            readNames();
            setup.settings = options.read();
            saveSetup(setup);
            const problem = checkSettings(setup.count, setup.settings);
            if (problem) {
                error.textContent = problem;
                error.hidden = false;
                return;
            }
            handlers.onLocal({
                ...setup.settings,
                players: setup.names.slice(0, setup.count),
                playerColors: setup.colors.slice(0, setup.count),
            });
        };

        return el('div', {class: 'setup-local'},
            el('label', {class: 'inline-field'}, 'Nombre de joueurs ', countSelect),
            names,
            options.element,
            el('p', {class: 'hint'},
                'Tout le monde joue sur le même écran. ',
                'Le but est d\'avoir le moins de points ; la partie s\'arrête quand un joueur atteint le score de fin.'),
            error,
            el('button', {id: 'start', class: 'primary', onclick: start}, 'Distribuer les cartes'));
    };
    // endregion

    draw();
}

/**
 *  Show (or clear with null) the error of a field, next to it, and focus the field
 */
function invalid(input: HTMLInputElement, error: HTMLElement, message: string | null) {
    input.classList.toggle('invalid', !!message);
    input.setAttribute('aria-invalid', String(!!message));
    error.textContent = message ?? '';
    if (message) input.focus();
}

/**
 *  Round colour swatch: each press takes the next colour not used by the other players
 */
function colorButton(initial: string, taken: () => string[], label: string, onPick: (color: string) => void): HTMLButtonElement {
    let current = initial;
    const button = el('button', {type: 'button', class: 'color-button'});
    const show = () => {
        button.style.background = current;
        button.setAttribute('aria-label', `${label} : ${colorName(current)}. Changer de couleur`);
        button.title = `${colorName(current)} : cliquer pour changer`;
    };
    button.addEventListener('click', () => {
        const used = taken();
        const start = PLAYER_COLORS.findIndex(c => c.value === current);
        for (let step = 1; step <= PLAYER_COLORS.length; step++) {
            const next = PLAYER_COLORS[(start + step) % PLAYER_COLORS.length].value;
            if (!used.includes(next)) {
                current = next;
                break;
            }
        }
        show();
        onPick(current);
    });
    show();
    return button;
}

/**
 *  Rules of the game, shared by the local setup and the online lobby (host)
 */
export function gameOptions(initial: GameSettings, onChange?: () => void) {
    const select = (id: string, values: number[], selected: number, label: (n: number) => string) =>
        el('select', {id, onchange: onChange}, ...values.map(n => el('option', {value: String(n), selected: n === selected}, label(n))));

    const deckSelect = select('deck-count', CHOICES.deckCount, initial.deckCount,
        n => n === 1 ? '1 paquet (52 cartes)' : '2 paquets (104 cartes)');
    const cardsSelect = select('cards-per-player', CHOICES.cardsPerPlayer, initial.cardsPerPlayer,
        n => `${n} cartes${n === 4 ? ' (classique)' : ''}`);
    const targetSelect = select('target-score', CHOICES.targetScore, initial.targetScore,
        n => `${n} points${n === 100 ? ' (classique)' : ''}`);
    const penaltySelect = select('dutch-penalty', CHOICES.dutchPenalty, initial.dutchPenalty,
        n => n === 0 ? 'Aucune' : `+${n} points${n === 10 ? ' (classique)' : ''}`);
    const effectInputs = new Map<EffectType, HTMLInputElement>(ALL_EFFECTS.map(effect =>
        [effect, el('input', {type: 'checkbox', id: `effect-${effect.toLowerCase()}`, checked: initial.effects.includes(effect), onchange: onChange})]));
    const peek = el('input', {type: 'checkbox', id: 'peek-variant', checked: initial.peekVariant, onchange: onChange});

    const field = (label: string, control: HTMLElement) => el('label', {class: 'option-field'}, el('span', {}, label), control);

    return {
        element: el('fieldset', {class: 'game-options'},
            el('legend', {}, 'Règles de la partie'),
            el('div', {class: 'option-grid'},
                field('Cartes par joueur', cardsSelect),
                field('Paquets', deckSelect),
                field('Fin de partie à', targetSelect),
                field('Pénalité si « Dutch » raté', penaltySelect)),
            el('fieldset', {class: 'effects'},
                el('legend', {}, 'Cartes spéciales'),
                ...ALL_EFFECTS.map(effect => el('label', {class: 'checkbox'}, effectInputs.get(effect)!,
                    el('span', {}, el('strong', {}, EFFECT_LABELS[effect].name), ` : ${EFFECT_LABELS[effect].effect}`)))),
            el('label', {class: 'checkbox'}, peek, ' Variante : chacun regarde ses 2 dernières cartes au début de la ronde')),
        read: (): GameSettings => cleanSettings({
            deckCount: parseInt(deckSelect.value, 10),
            cardsPerPlayer: parseInt(cardsSelect.value, 10),
            targetScore: parseInt(targetSelect.value, 10),
            dutchPenalty: parseInt(penaltySelect.value, 10),
            peekVariant: peek.checked,
            effects: ALL_EFFECTS.filter(effect => effectInputs.get(effect)!.checked),
        }),
    };
}
