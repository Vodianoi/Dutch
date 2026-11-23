import {scoped, TEST_VERSION} from '../env.js';
import {BackColor, TableTheme} from './cardArt.js';
import {DEFAULT_THEME, first, ThemeId, THEMES} from './themes.js';

/**
 *  Preferences of this device (not rules of the game): sound, vibration, animation speed, theme, card back, table
 */
export interface Prefs {
    sound: boolean;
    vibration: boolean;
    speed: 'normal' | 'fast';
    /** Look of the whole game: menus, cards, table */
    theme: ThemeId;
    /** Card back, among those of the theme */
    back: BackColor;
    /** Look of the flat table (top, rim, room), among those of the theme */
    felt: TableTheme;
    /** Game table: drawn flat (2D) or the 3D table (prototype) */
    table: '2d' | '3d';
    /** How fast the computer players play */
    bots: BotPace;
}

export type BotPace = 'slow' | 'normal' | 'fast';
/** Multiplies the waiting times of the bots */
export const BOT_PACES: Record<BotPace, { name: string; factor: number }> = {
    slow: {name: 'Lente', factor: 1.5},
    normal: {name: 'Normale', factor: 1},
    fast: {name: 'Rapide', factor: .65},
};

const KEY = scoped('prefs');
const DEFAULTS: Prefs = {
    sound: true, vibration: true, speed: 'normal', theme: DEFAULT_THEME,
    back: first(THEMES[DEFAULT_THEME].backs), felt: first(THEMES[DEFAULT_THEME].tables),
    // The preview of the 3D table (/3d/) opens on it
    table: TEST_VERSION === '3d' ? '3d' : '2d', bots: 'normal',
};

export function loadPrefs(): Prefs {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {};
        const theme: ThemeId = saved.theme in THEMES ? saved.theme : DEFAULTS.theme;
        // A back or a table of another theme (or of an older version): the first ones of this theme
        const {backs, tables} = THEMES[theme];
        return {
            sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULTS.sound,
            vibration: typeof saved.vibration === 'boolean' ? saved.vibration : DEFAULTS.vibration,
            speed: saved.speed === 'fast' ? 'fast' : 'normal',
            theme,
            back: saved.back in backs ? saved.back : first(backs),
            felt: saved.felt in tables ? saved.felt : first(tables),
            table: saved.table === '3d' || saved.table === '2d' ? saved.table : DEFAULTS.table,
            bots: saved.bots in BOT_PACES ? saved.bots : DEFAULTS.bots,
        };
    } catch {
        return {...DEFAULTS};
    }
}

export function savePrefs(prefs: Prefs) {
    try {
        localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
        // Storage refused: the preferences last until the page is closed
    }
}

/** Short vibration on phones that support it, if the player wants it */
export function buzz(prefs: Prefs, pattern: number | number[]) {
    if (prefs.vibration) navigator.vibrate?.(pattern);
}
