import { msg, render, t } from './i18n.js';
export const ALL_EFFECTS = ['JACK', 'QUEEN', 'ACE'];
/**
 *  Rules proposed for a new game: a short game (50 points, one deck) where everybody
 *  looks at his 2 last cards at the start of a round
 */
export const DEFAULT_SETTINGS = {
    deckCount: 1,
    cardsPerPlayer: 4,
    targetScore: 50,
    dutchPenalty: 10,
    peekVariant: true,
    effects: ALL_EFFECTS.slice(),
};
/** The defaults before version 2 (saved setups that still have them get the new ones) */
const DEFAULTS_V1 = { deckCount: 2, targetScore: 100, peekVariant: false };
export const DEFAULTS_VERSION = 2;
/**
 *  Settings saved before the defaults changed: the rules left on the old defaults
 *  (never changed by the player, most likely) take the new ones; the other choices are kept
 */
export function upgradeDefaults(settings, savedVersion) {
    if (typeof savedVersion === 'number' && savedVersion >= DEFAULTS_VERSION)
        return settings;
    return {
        ...settings,
        deckCount: settings.deckCount === DEFAULTS_V1.deckCount ? DEFAULT_SETTINGS.deckCount : settings.deckCount,
        targetScore: settings.targetScore === DEFAULTS_V1.targetScore ? DEFAULT_SETTINGS.targetScore : settings.targetScore,
        peekVariant: settings.peekVariant === DEFAULTS_V1.peekVariant ? DEFAULT_SETTINGS.peekVariant : settings.peekVariant,
    };
}
export const CHOICES = {
    deckCount: [1, 2],
    cardsPerPlayer: [3, 4, 5, 6],
    targetScore: [50, 100, 150, 200],
    dutchPenalty: [0, 5, 10, 20],
};
export const EFFECT_LABELS = {
    JACK: { name: 'Valet', effect: 'échanger deux cartes' },
    QUEEN: { name: 'Dame', effect: 'regarder une de ses cartes' },
    ACE: { name: 'As', effect: 'donner une carte de la pioche' },
};
/**
 *  Settings received from storage or from the network: keep only known values
 */
export function cleanSettings(raw) {
    const pick = (key) => {
        const value = raw?.[key];
        return typeof value === 'number' && CHOICES[key].includes(value) ? value : DEFAULT_SETTINGS[key];
    };
    return {
        deckCount: pick('deckCount'),
        cardsPerPlayer: pick('cardsPerPlayer'),
        targetScore: pick('targetScore'),
        dutchPenalty: pick('dutchPenalty'),
        peekVariant: typeof raw?.peekVariant === 'boolean' ? raw.peekVariant : DEFAULT_SETTINGS.peekVariant,
        effects: Array.isArray(raw?.effects) ? ALL_EFFECTS.filter(e => raw.effects.includes(e)) : ALL_EFFECTS.slice(),
    };
}
/**
 *  Can these settings be played with this many players?
 *  @returns the problem, null if fine
 */
export function checkSettings(players, settings) {
    const problem = settingsProblem(players, settings);
    return problem ? render(problem) : null;
}
/** The same problem, to show on every device in its own language */
export function settingsProblem(players, settings) {
    // Every hand, the first card of the discard pile, and some cards left to draw
    const needed = players * settings.cardsPerPlayer + 1 + players;
    if (needed > settings.deckCount * 52) {
        return msg('Pas assez de cartes pour {players} joueurs à {cards} cartes : prenez 2 paquets ou moins de cartes par joueur.', { players, cards: settings.cardsPerPlayer });
    }
    return null;
}
/**
 *  The rules in a few lines, for the players who didn't choose them
 */
export function describeSettings(settings) {
    const effects = settings.effects.length === ALL_EFFECTS.length
        ? t('Valet, Dame et As actifs')
        : settings.effects.length === 0
            ? t('Aucune carte spéciale')
            : t('Cartes spéciales : {names} seulement', { names: settings.effects.map(e => t(EFFECT_LABELS[e].name)).join(` ${t('et')} `) });
    return [
        t(settings.deckCount > 1 ? '{cards} cartes par joueur, {decks} paquets' : '{cards} cartes par joueur, {decks} paquet', { cards: settings.cardsPerPlayer, decks: settings.deckCount }),
        t('Fin de partie à {score} points', { score: settings.targetScore }),
        settings.dutchPenalty ? t('Dutch raté : +{penalty} points', { penalty: settings.dutchPenalty }) : t('Dutch raté : pas de pénalité'),
        effects,
        ...(settings.peekVariant ? [t('Chacun regarde ses 2 dernières cartes en début de ronde')] : []),
    ];
}
/**
 *  Player colours: all dark enough for a white initial on them (contrast above 4.5:1)
 */
export const PLAYER_COLORS = [
    { value: '#2563a8', name: 'bleu' },
    { value: '#b42318', name: 'rouge' },
    { value: '#0f766e', name: 'turquoise' },
    { value: '#7c3aed', name: 'violet' },
    { value: '#b45309', name: 'ambre' },
    { value: '#be185d', name: 'rose' },
    { value: '#4d7c0f', name: 'vert' },
    { value: '#475569', name: 'ardoise' },
    { value: '#c2410c', name: 'orange' },
    { value: '#1e40af', name: 'indigo' },
];
export function isPlayerColor(value) {
    return typeof value === 'string' && PLAYER_COLORS.some(c => c.value === value);
}
export function colorName(value) {
    return t(PLAYER_COLORS.find(c => c.value === value)?.name ?? 'couleur');
}
/**
 *  Give each player a colour: his own choice when it is free, otherwise the first free one
 */
export function assignColors(wanted) {
    const used = new Set();
    const result = wanted.map(color => {
        if (isPlayerColor(color) && !used.has(color)) {
            used.add(color);
            return color;
        }
        return null;
    });
    return result.map(color => {
        if (color)
            return color;
        const free = PLAYER_COLORS.find(c => !used.has(c.value))?.value ?? PLAYER_COLORS[0].value;
        used.add(free);
        return free;
    });
}
