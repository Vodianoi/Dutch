import { HOT_SEAT, scoped } from '../env.js';
import { MAX_NAME_LENGTH } from '../net/Protocol.js';
import { normalizeCode } from '../net/Transport.js';
import { ALL_EFFECTS, assignColors, checkSettings, CHOICES, cleanSettings, colorName, DEFAULTS_VERSION, describeSettings, EFFECT_LABELS, PLAYER_COLORS, upgradeDefaults, } from '../Settings.js';
import { lang, LANGS, setLang, t } from '../i18n.js';
import { clear, el } from './dom.js';
import { renderHero } from './hero.js';
import { themeSwitch } from './themePicker.js';
import { BOT_PACES, loadPrefs, savePrefs } from '../table/prefs.js';
const DEFAULT_NAMES = ['Eddy', 'Hugo', 'Axel', 'Léa', ...[5, 6, 7, 8, 9, 10].map(n => t('Joueur {n}', { n }))];
const STORAGE_KEY = scoped('setup');
/** Names of the computer players */
export const BOT_NAMES = ['Léa', 'Hugo', 'Inès', 'Malo', 'Zoé', 'Nino', 'Jade', 'Sacha', 'Lina'];
export function loadSetup() {
    const fallback = {
        count: 4, names: DEFAULT_NAMES.slice(), colors: assignColors(DEFAULT_NAMES.map(() => null)),
        settings: cleanSettings(null), onlineName: '', onlineColor: PLAYER_COLORS[0].value, mode: 'solo', botCount: 3,
        defaultsVersion: DEFAULTS_VERSION,
    };
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
        if (saved && Array.isArray(saved.names)) {
            // Older saves kept deckCount and peekVariant at the top level
            const settings = upgradeDefaults(cleanSettings(saved.settings ?? { deckCount: saved.deckCount, peekVariant: saved.peekVariant }), saved.defaultsVersion);
            const colors = assignColors(DEFAULT_NAMES.map((_, i) => Array.isArray(saved.colors) ? saved.colors[i] : null));
            const onlineColor = PLAYER_COLORS.some(c => c.value === saved.onlineColor) ? saved.onlineColor : fallback.onlineColor;
            const botCount = Number.isInteger(saved.botCount) && saved.botCount >= 1 && saved.botCount <= 9 ? saved.botCount : 3;
            const mode = ['solo', 'online', 'local'].includes(saved.mode) ? saved.mode : 'solo';
            return { ...fallback, ...saved, settings, colors, onlineColor, botCount, mode, defaultsVersion: DEFAULTS_VERSION };
        }
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
    // A room code in the link: join it. "Sur cet écran" is only for testing (not on the real site)
    if (initial.code || initial.resume)
        setup.mode = 'online';
    else if (setup.mode === 'local' && !HOT_SEAT)
        setup.mode = 'solo';
    const draw = () => {
        clear(root);
        const tab = (mode, label) => el('button', {
            class: setup.mode === mode ? 'tab active' : 'tab', id: `tab-${mode}`,
            'aria-pressed': String(setup.mode === mode), onclick: () => switchMode(mode),
        }, label);
        const tabs = el('div', { class: 'tabs', role: 'group', 'aria-label': t('Mode de jeu') }, tab('solo', t('Contre l\'ordinateur')), tab('online', t('En ligne')), HOT_SEAT ? tab('local', t('Sur cet écran')) : null);
        root.appendChild(el('section', { class: 'setup panel' }, tabs, setup.mode === 'online' ? online() : setup.mode === 'solo' ? solo() : local()));
        root.appendChild(languageSwitch());
        // The cards of the header are drawn again in the theme chosen
        root.appendChild(themeSwitch(renderHero));
    };
    const switchMode = (mode) => {
        setup.mode = mode;
        saveSetup(setup);
        initial = { code: initial.code, resume: initial.resume, soloResume: initial.soloResume };
        draw();
    };
    // region Online
    const online = () => {
        const nameError = el('p', { class: 'field-error', id: 'online-name-error' });
        const codeError = el('p', { class: 'field-error', id: 'room-code-error' });
        const nameInput = el('input', {
            type: 'text', id: 'online-name', 'aria-describedby': 'online-name-error', maxlength: String(MAX_NAME_LENGTH), value: setup.onlineName,
            placeholder: t('Votre prénom'), autocomplete: 'nickname',
        });
        const codeInput = el('input', {
            type: 'text', id: 'room-code', maxlength: '8', value: initial.code ?? '', placeholder: 'CODE',
            'aria-label': t('Code de la partie'), 'aria-describedby': 'room-code-error', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', class: 'code-input',
        });
        const color = colorButton(setup.onlineColor, () => [], t('Votre couleur'), value => {
            setup.onlineColor = value;
            saveSetup(setup);
        });
        const readName = () => {
            const name = nameInput.value.trim();
            if (!name) {
                invalid(nameInput, nameError, t('Entrez votre prénom pour que les autres vous reconnaissent.'));
                return null;
            }
            invalid(nameInput, nameError, null);
            setup.onlineName = name;
            saveSetup(setup);
            return name;
        };
        const publicBox = el('input', { type: 'checkbox', id: 'public-room' });
        const create = () => {
            const name = readName();
            if (name)
                handlers.onHost(name, setup.onlineColor, setup.settings, publicBox.checked);
        };
        const join = () => {
            const name = readName();
            const code = normalizeCode(codeInput.value);
            if (!name)
                return;
            if (code.length < 4) {
                invalid(codeInput, codeError, t('Le code de la partie fait au moins 4 caractères.'));
                return;
            }
            invalid(codeInput, codeError, null);
            handlers.onJoin(code, name, setup.onlineColor);
        };
        codeInput.addEventListener('keydown', e => e.key === 'Enter' && join());
        const busy = !!initial.busy;
        const resume = initial.resume;
        return el('div', { class: 'setup-online' }, resume && !busy ? el('section', { class: 'resume', 'aria-labelledby': 'resume-title' }, el('h3', { id: 'resume-title' }, resume.started ? t('Votre partie est en cours') : t('Votre salle d\'attente est ouverte')), el('p', { class: 'hint' }, t('Partie {code} avec {players}. ', { code: resume.code, players: resume.players.join(', ') }), t('Les autres joueurs se reconnectent tout seuls dès que vous la reprenez.')), el('div', { class: 'resume-actions' }, el('button', { class: 'primary', id: 'resume-room', onclick: () => handlers.onResume?.() }, t('Reprendre')), el('button', { class: 'secondary', id: 'forget-room', onclick: () => handlers.onForget?.() }, t('Abandonner')))) : null, el('div', { class: 'stack' }, el('label', { for: 'online-name' }, t('Votre nom')), el('div', { class: 'name-row' }, color, nameInput), nameError), el('div', { class: 'online-choices' }, el('div', { class: 'choice' }, el('h3', {}, t('Créer une partie')), el('p', { class: 'hint' }, t('Vous recevez un code à partager, et vous choisissez les règles dans la salle d\'attente.')), el('label', { class: 'switch public-switch', for: 'public-room' }, publicBox, el('span', {}, el('strong', {}, t('Partie publique')), ' ', t('· visible dans la liste, ouverte à tous jusqu\'à 10 joueurs'))), el('p', { class: 'hint public-warning', id: 'public-warning' }, PRIVACY_NOTE()), el('button', { id: 'create-room', class: 'primary', disabled: busy, onclick: create }, t('Créer'))), el('div', { class: 'choice' }, el('h3', {}, t('Rejoindre')), codeInput, codeError, el('button', { id: 'join-room', class: 'primary', disabled: busy, onclick: join }, t('Rejoindre')))), initial.busy ? el('p', { class: 'message info', role: 'status' }, initial.busy) : null, initial.error ? el('p', { class: 'message error', role: 'alert' }, initial.error) : null, handlers.onFindPublic && !busy ? publicGames(handlers.onFindPublic, game => {
            const name = readName();
            if (name)
                handlers.onJoin(game.code, name, setup.onlineColor);
        }) : null, el('p', { class: 'hint' }, t('Chacun joue sur son appareil et ne voit que ses cartes. '), t('La partie tourne sur l\'appareil de celui qui la crée. S\'il quitte l\'application, elle reprend quand il revient.')));
    };
    // endregion
    // region Solo
    const solo = () => {
        const nameError = el('p', { class: 'field-error', id: 'solo-name-error' });
        const error = el('p', { class: 'message error', role: 'alert', id: 'solo-error', hidden: true });
        const nameInput = el('input', {
            type: 'text', id: 'solo-name', 'aria-describedby': 'solo-name-error', maxlength: String(MAX_NAME_LENGTH),
            value: setup.onlineName, placeholder: t('Votre prénom'), autocomplete: 'nickname',
        });
        const color = colorButton(setup.onlineColor, () => [], t('Votre couleur'), value => {
            setup.onlineColor = value;
            saveSetup(setup);
        });
        const bots = el('select', { id: 'bot-count', onchange: () => {
                setup.botCount = parseInt(bots.value, 10);
                saveSetup(setup);
                error.hidden = true;
            } }, ...Array.from({ length: 9 }, (_, i) => el('option', { value: String(i + 1), selected: i + 1 === setup.botCount }, t(i ? '{n} adversaires' : '{n} adversaire', { n: i + 1 }))));
        const pace = el('select', { id: 'bot-pace', onchange: () => {
                const prefs = loadPrefs();
                prefs.bots = pace.value;
                savePrefs(prefs);
            } }, ...Object.keys(BOT_PACES).map(key => el('option', { value: key, selected: key === loadPrefs().bots }, t(BOT_PACES[key].name))));
        const options = gameOptions(setup.settings, () => {
            setup.settings = options.read();
            saveSetup(setup);
            error.hidden = true;
        });
        const start = () => {
            const name = nameInput.value.trim() || t('Vous');
            setup.onlineName = nameInput.value.trim() || setup.onlineName;
            setup.settings = options.read();
            saveSetup(setup);
            const problem = checkSettings(setup.botCount + 1, setup.settings);
            if (problem) {
                error.textContent = problem;
                error.hidden = false;
                return;
            }
            handlers.onSolo({
                ...setup.settings,
                players: [name, ...BOT_NAMES.slice(0, setup.botCount)],
                playerColors: [setup.onlineColor],
            });
        };
        const resume = initial.soloResume;
        return el('div', { class: 'setup-solo' }, resume ? el('section', { class: 'resume', 'aria-labelledby': 'solo-resume-title' }, el('h3', { id: 'solo-resume-title' }, t('Votre partie est en cours')), el('p', { class: 'hint' }, t('Manche {round} contre {players}.', { round: resume.round, players: resume.players.slice(1).join(', ') })), el('div', { class: 'resume-actions' }, el('button', { class: 'primary', id: 'resume-solo', onclick: () => handlers.onResumeSolo?.() }, t('Reprendre')), el('button', { class: 'secondary', id: 'forget-solo', onclick: () => handlers.onForgetSolo?.() }, t('Abandonner')))) : null, el('div', { class: 'stack' }, el('label', { for: 'solo-name' }, t('Votre nom')), el('div', { class: 'name-row' }, color, nameInput), nameError), el('label', { class: 'inline-field' }, t('Contre '), bots), el('label', { class: 'inline-field' }, t('Vitesse des ordinateurs '), pace), folded(options), el('p', { class: 'hint' }, t('Entraînez-vous contre l\'ordinateur : il ne voit pas vos cartes, il retient seulement les siennes.')), error, el('button', { id: 'start-solo', class: 'primary', onclick: start }, resume ? t('Nouvelle partie') : t('Jouer')));
    };
    // endregion
    // region Local
    const local = () => {
        const nameInputs = [];
        const error = el('p', { class: 'message error', role: 'alert', id: 'setup-error', hidden: true });
        const countSelect = el('select', { id: 'player-count', onchange: (e) => {
                setup.count = parseInt(e.target.value, 10);
                readNames();
                saveSetup(setup);
                draw();
            } }, ...Array.from({ length: 9 }, (_, i) => {
            const n = i + 2;
            return el('option', { value: n, selected: n === setup.count }, `${n} joueurs`);
        }));
        const names = el('div', { class: 'setup-names' });
        for (let i = 0; i < setup.count; i++) {
            const input = el('input', { type: 'text', id: `player-name-${i}`, maxlength: String(MAX_NAME_LENGTH), value: setup.names[i] });
            nameInputs.push(input);
            const others = () => setup.colors.filter((_, j) => j !== i && j < setup.count);
            const color = colorButton(setup.colors[i], others, t('Couleur du joueur {n}', { n: i + 1 }), value => {
                setup.colors[i] = value;
                saveSetup(setup);
            });
            names.appendChild(el('div', { class: 'name-field' }, el('label', { for: `player-name-${i}` }, t('Joueur {n}', { n: i + 1 })), el('div', { class: 'name-row' }, color, input)));
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
        return el('div', { class: 'setup-local' }, el('label', { class: 'inline-field' }, t('Nombre de joueurs '), countSelect), names, folded(options), el('p', { class: 'hint' }, t('Tout le monde joue sur le même écran. '), t('Le but est d\'avoir le moins de points ; la partie s\'arrête quand un joueur atteint le score de fin.')), error, el('button', { id: 'start', class: 'primary', onclick: start }, t('Distribuer les cartes')));
    };
    // endregion
    draw();
}
/**
 *  Show (or clear with null) the error of a field, next to it, and focus the field
 */
function invalid(input, error, message) {
    input.classList.toggle('invalid', !!message);
    input.setAttribute('aria-invalid', String(!!message));
    error.textContent = message ?? '';
    if (message)
        input.focus();
}
/**
 *  Round colour swatch: each press takes the next colour not used by the other players
 */
function colorButton(initial, taken, label, onPick) {
    let current = initial;
    const button = el('button', { type: 'button', class: 'color-button' });
    const show = () => {
        button.style.background = current;
        button.setAttribute('aria-label', t('{label} : {color}. Changer de couleur', { label, color: colorName(current) }));
        button.title = t('{color} : cliquer pour changer', { color: colorName(current) });
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
 *  The devices talk directly to each other: the others see the address (IP) of your connection.
 *  Said where strangers come in.
 */
const PRIVACY_NOTE = () => t('Les autres joueurs voient votre adresse IP.');
/** The public games are looked for again this often while the list is on screen */
const PUBLIC_REFRESH_MS = 10000;
/** Last list found: shown at once when the home screen is drawn again */
let lastPublic = null;
/**
 *  « Parties publiques »: the games anybody can join, found by knocking on every public room
 */
function publicGames(find, onJoin) {
    const list = el('ul', { class: 'public-list' });
    const status = el('p', { class: 'hint public-status', role: 'status' });
    const refresh = el('button', { type: 'button', class: 'secondary small', id: 'refresh-public' }, t('Actualiser'));
    const section = el('section', { class: 'public-games', 'aria-labelledby': 'public-title', 'aria-busy': 'false' }, el('div', { class: 'public-head' }, el('h3', { id: 'public-title' }, t('Parties publiques')), refresh), status, list, el('p', { class: 'hint public-warning' }, t('Les hôtes de la liste voient votre adresse IP.')));
    const show = (games) => {
        clear(list);
        if (!games) {
            status.textContent = t('Recherche des parties publiques…');
            return;
        }
        status.textContent = games.length ? '' : t('Aucune partie publique pour l\'instant : créez-en une !');
        for (const game of games) {
            const why = game.players >= game.max ? t('Complète') : !game.open ? (game.started ? t('En cours') : t('Autre version')) : null;
            const rules = describeSettings(game.settings).slice(0, 2).join(' · ');
            list.appendChild(el('li', { class: `public-game${game.open ? '' : ' closed'}` }, el('div', { class: 'public-info' }, el('strong', {}, t('Partie de {name}', { name: game.host })), el('span', { class: 'public-players' }, t('{n}/{max} joueurs', { n: game.players, max: game.max }), game.started && game.open ? el('span', { class: 'public-late' }, ' · ', t('en cours : vous jouerez à la prochaine manche')) : null), el('span', { class: 'hint' }, rules)), el('button', {
                type: 'button', class: game.open ? 'primary small' : 'secondary small', disabled: !game.open,
                'aria-label': game.open ? t('Rejoindre la partie de {name}', { name: game.host }) : `${t('Partie de {name}', { name: game.host })} : ${why}`,
                onclick: () => onJoin(game),
            }, why ?? t('Rejoindre'))));
        }
    };
    let scanning = false;
    let timer;
    const scan = async () => {
        clearTimeout(timer);
        // Home screen left or drawn again: this list is no longer shown
        if (scanning || !section.isConnected)
            return;
        scanning = true;
        section.setAttribute('aria-busy', 'true');
        refresh.disabled = true;
        try {
            lastPublic = await find();
            show(lastPublic);
        }
        catch {
            status.textContent = t('Impossible de chercher les parties publiques : vérifiez votre connexion.');
        }
        finally {
            scanning = false;
            section.setAttribute('aria-busy', 'false');
            refresh.disabled = false;
            if (section.isConnected)
                timer = setTimeout(scan, PUBLIC_REFRESH_MS);
        }
    };
    refresh.addEventListener('click', () => void scan());
    show(lastPublic);
    // Started once the section is on the page
    queueMicrotask(() => void scan());
    return section;
}
/**
 *  Français / English: the page is loaded again in the other language (nothing is lost: everything is saved)
 */
function languageSwitch() {
    return el('nav', { class: 'lang-switch', 'aria-label': 'Langue / Language' }, ...LANGS.map(l => el('button', {
        type: 'button', lang: l.value, class: l.value === lang() ? 'active' : '', 'aria-pressed': String(l.value === lang()),
        onclick: () => {
            if (l.value === lang())
                return;
            setLang(l.value);
            location.reload();
        },
    }, l.name)));
}
/**
 *  Rules folded under a one-line summary (progressive disclosure): the main action stays in view
 */
function folded(options) {
    const summary = el('span', { class: 'rules-summary' });
    const update = () => summary.textContent = describeSettings(options.read()).slice(0, 3).join(' · ');
    options.element.addEventListener('change', update);
    update();
    return el('details', { class: 'rules-details' }, el('summary', {}, el('strong', {}, t('Règles')), summary), options.element);
}
/**
 *  Rules of the game, shared by the local setup and the online lobby (host)
 */
export function gameOptions(initial, onChange) {
    const select = (id, values, selected, label) => el('select', { id, onchange: onChange }, ...values.map(n => el('option', { value: String(n), selected: n === selected }, label(n))));
    const deckSelect = select('deck-count', CHOICES.deckCount, initial.deckCount, n => n === 1 ? t('1 paquet (52 cartes)') : t('2 paquets (104 cartes)'));
    const cardsSelect = select('cards-per-player', CHOICES.cardsPerPlayer, initial.cardsPerPlayer, n => t(n === 4 ? '{n} cartes (classique)' : '{n} cartes', { n }));
    const targetSelect = select('target-score', CHOICES.targetScore, initial.targetScore, n => t(n === 100 ? '{n} points (classique)' : '{n} points', { n }));
    const penaltySelect = select('dutch-penalty', CHOICES.dutchPenalty, initial.dutchPenalty, n => n === 0 ? t('Aucune') : t(n === 10 ? '+{n} points (classique)' : '+{n} points', { n }));
    const effectInputs = new Map(ALL_EFFECTS.map(effect => [effect, el('input', { type: 'checkbox', id: `effect-${effect.toLowerCase()}`, checked: initial.effects.includes(effect), onchange: onChange })]));
    const peek = el('input', { type: 'checkbox', id: 'peek-variant', checked: initial.peekVariant, onchange: onChange });
    const queenAny = el('input', { type: 'checkbox', id: 'queen-any', checked: initial.queenAny, onchange: onChange });
    const protectJack = el('input', { type: 'checkbox', id: 'protect-jack', checked: initial.protectFromJack, onchange: onChange });
    const protectAce = el('input', { type: 'checkbox', id: 'protect-ace', checked: initial.protectFromAce, onchange: onChange });
    const check = (input, text) => el('label', { class: 'checkbox' }, input, el('span', {}, text));
    const field = (label, control) => el('label', { class: 'option-field' }, el('span', {}, label), control);
    return {
        element: el('fieldset', { class: 'game-options' }, el('legend', {}, t('Règles de la partie')), el('div', { class: 'option-grid' }, field(t('Cartes par joueur'), cardsSelect), field(t('Paquets'), deckSelect), field(t('Fin de partie à'), targetSelect), field(t('Pénalité si « Dutch » raté'), penaltySelect)), el('fieldset', { class: 'effects' }, el('legend', {}, t('Cartes spéciales')), ...ALL_EFFECTS.map(effect => el('label', { class: 'checkbox' }, effectInputs.get(effect), el('span', {}, el('strong', {}, t(EFFECT_LABELS[effect].name)), t(' : {effect}', { effect: t(EFFECT_LABELS[effect].effect) })))), check(queenAny, t('La Dame peut regarder n\'importe quelle carte, pas seulement les siennes'))), el('fieldset', { class: 'effects' }, el('legend', {}, t('Après « Dutch », le joueur est protégé')), check(protectJack, t('du Valet : on ne peut pas échanger ses cartes')), check(protectAce, t('de l\'As : on ne peut pas lui donner de carte'))), el('label', { class: 'checkbox' }, peek, t(' Variante : chacun regarde ses 2 dernières cartes au début de la ronde'))),
        read: () => cleanSettings({
            deckCount: parseInt(deckSelect.value, 10),
            cardsPerPlayer: parseInt(cardsSelect.value, 10),
            targetScore: parseInt(targetSelect.value, 10),
            dutchPenalty: parseInt(penaltySelect.value, 10),
            peekVariant: peek.checked,
            effects: ALL_EFFECTS.filter(effect => effectInputs.get(effect).checked),
            protectFromJack: protectJack.checked,
            protectFromAce: protectAce.checked,
            queenAny: queenAny.checked,
        }),
    };
}
