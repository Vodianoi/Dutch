export const ALL_EFFECTS = ['JACK', 'QUEEN', 'ACE'];
export const DEFAULT_SETTINGS = {
    deckCount: 2,
    cardsPerPlayer: 4,
    targetScore: 100,
    dutchPenalty: 10,
    peekVariant: false,
    effects: ALL_EFFECTS.slice(),
};
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
    // Every hand, the first card of the discard pile, and some cards left to draw
    const needed = players * settings.cardsPerPlayer + 1 + players;
    if (needed > settings.deckCount * 52) {
        return `Pas assez de cartes pour ${players} joueurs à ${settings.cardsPerPlayer} cartes : prenez 2 paquets ou moins de cartes par joueur.`;
    }
    return null;
}
/**
 *  The rules in a few lines, for the players who didn't choose them
 */
export function describeSettings(settings) {
    const effects = settings.effects.length === ALL_EFFECTS.length
        ? 'Valet, Dame et As actifs'
        : settings.effects.length === 0
            ? 'Aucune carte spéciale'
            : `Cartes spéciales : ${settings.effects.map(e => EFFECT_LABELS[e].name).join(' et ')} seulement`;
    return [
        `${settings.cardsPerPlayer} cartes par joueur, ${settings.deckCount} paquet${settings.deckCount > 1 ? 's' : ''}`,
        `Fin de partie à ${settings.targetScore} points`,
        settings.dutchPenalty ? `Dutch raté : +${settings.dutchPenalty} points` : 'Dutch raté : pas de pénalité',
        effects,
        ...(settings.peekVariant ? ['Chacun regarde ses 2 dernières cartes en début de ronde'] : []),
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
    return PLAYER_COLORS.find(c => c.value === value)?.name ?? 'couleur';
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
