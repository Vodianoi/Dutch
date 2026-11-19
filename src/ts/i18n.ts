import {scoped} from './env.js';
import {EN} from './i18n-en.js';

/**
 *  Languages of the game. French is the source: the code is written with the French sentences,
 *  `t()` gives them in the language of this device (a missing translation stays in French).
 *
 *  What travels between devices (log of the game, rule errors) is a `Msg`: the French template
 *  and its values, so that each device shows it in its own language.
 */
export type Lang = 'fr' | 'en';
export const LANGS: { value: Lang; name: string }[] = [
    {value: 'fr', name: 'Français'},
    {value: 'en', name: 'English'},
];

/** A card in a message: its rank and suit, written the way of each language (R♠ / K♠, Roi de pique / King of spades) */
export interface CardRef {
    card: string;
    suit: string;
    /** Full name instead of the short label */
    long?: boolean;
}

export type Param = string | number | Msg | CardRef;
export type Params = Record<string, Param>;

/** A sentence to show on every device in its own language */
export interface Msg {
    /** French template, with {name} for the values */
    t: string;
    p?: Params;
}

const KEY = scoped('lang');

function detect(): Lang {
    // Tests and tools without a page (Node has a navigator): French, the language of the source
    if (typeof document === 'undefined') return 'fr';
    try {
        const saved = localStorage.getItem(KEY);
        if (saved === 'fr' || saved === 'en') return saved;
    } catch {
        // storage unavailable
    }
    const wanted = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of wanted) {
        const code = (tag ?? '').toLowerCase().slice(0, 2);
        if (code === 'fr') return 'fr';
        if (code === 'en') return 'en';
    }
    return 'en';
}

let current: Lang = detect();

export function lang(): Lang {
    return current;
}

/** Change the language of this device (kept for the next visits) */
export function setLang(value: Lang, save = true) {
    current = value;
    if (save) {
        try {
            localStorage.setItem(KEY, value);
        } catch {
            // ignore
        }
    }
    if (typeof document !== 'undefined') document.documentElement.lang = value;
}

if (typeof document !== 'undefined') document.documentElement.lang = current;

/**
 *  The French sentence in the language of this device, with its values
 *  @example t('Au tour de {name}.', {name: 'Léa'})
 */
export function t(fr: string, params?: Params, language: Lang = current): string {
    const template = language === 'fr' ? fr : (EN[fr] ?? fr);
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (all, key: string) => key in params ? param(params[key], language) : all);
}

/** A sentence to translate on each device */
export function msg(fr: string, params?: Params): Msg {
    return params ? {t: fr, p: params} : {t: fr};
}

/** Show a message from the game or the network (a plain text from an older page stays as it is) */
export function render(message: Msg | string | undefined | null, language: Lang = current): string {
    if (!message) return '';
    if (typeof message === 'string') return message;
    return t(message.t, message.p, language);
}

export function isMsg(value: unknown): value is Msg {
    return !!value && typeof value === 'object' && typeof (value as Msg).t === 'string';
}

function param(value: Param, language: Lang): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if ('card' in value) return cardText(value, language);
    return t(value.t, value.p, language);
}

// region Cards
const RANKS: Record<Lang, Record<string, string>> = {
    fr: {ACE: 'A', JACK: 'V', QUEEN: 'D', KING: 'R'},
    en: {ACE: 'A', JACK: 'J', QUEEN: 'Q', KING: 'K'},
};
const VALUE_NAMES: Record<Lang, Record<string, string>> = {
    fr: {ACE: 'As', JACK: 'Valet', QUEEN: 'Dame', KING: 'Roi'},
    en: {ACE: 'Ace', JACK: 'Jack', QUEEN: 'Queen', KING: 'King'},
};
const SUIT_SYMBOLS: Record<string, string> = {HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣', SPADES: '♠'};
const SUIT_NAMES: Record<Lang, Record<string, string>> = {
    fr: {HEARTS: 'cœur', DIAMONDS: 'carreau', CLUBS: 'trèfle', SPADES: 'pique'},
    en: {HEARTS: 'hearts', DIAMONDS: 'diamonds', CLUBS: 'clubs', SPADES: 'spades'},
};

/** Letter of a rank on the cards: R for Roi in French, K for King in English */
export function rankLabel(value: string, language: Lang = current): string {
    return RANKS[language][value] ?? value;
}

/** Name of a value: Valet / Jack, numbers as they are */
export function valueName(value: string, language: Lang = current): string {
    return VALUE_NAMES[language][value] ?? value;
}

/** A card written for the players: R♠ / K♠, or its full name with `long` */
export function cardLabel(ref: CardRef, language: Lang = current): string {
    return cardText(ref, language);
}

/** « 3 pts » / « 1 pt » */
export function points(n: number): string {
    return `${n} pt${Math.abs(n) > 1 ? 's' : ''}`;
}

/** « Léa, Hugo et Inès » / « Léa, Hugo and Inès » */
export function joinNames(names: string[], language: Lang = current): string {
    if (names.length < 2) return names.join('');
    return `${names.slice(0, -1).join(', ')} ${language === 'fr' ? 'et' : 'and'} ${names[names.length - 1]}`;
}

function cardText(ref: CardRef, language: Lang): string {
    if (ref.long) {
        const value = valueName(ref.card, language), suit = SUIT_NAMES[language][ref.suit] ?? ref.suit;
        return language === 'fr' ? `${value} de ${suit}` : `${value} of ${suit}`;
    }
    return `${rankLabel(ref.card, language)}${SUIT_SYMBOLS[ref.suit] ?? ''}`;
}
// endregion
