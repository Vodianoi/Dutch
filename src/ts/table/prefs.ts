import {scoped} from '../env.js';
import {BACK_COLORS, BackColor, TABLE_THEMES, TableTheme} from './cardArt.js';

/**
 *  Preferences of this device (not rules of the game): sound, vibration, animation speed, card back, table
 */
export interface Prefs {
    sound: boolean;
    vibration: boolean;
    speed: 'normal' | 'fast';
    back: BackColor;
    /** Looks of the flat table (felt, rail, room) */
    felt: TableTheme;
    /** Game table: drawn flat (2D) or the 3D table (prototype) */
    table: '2d' | '3d';
}

const KEY = scoped('prefs');
const DEFAULTS: Prefs = {sound: true, vibration: true, speed: 'normal', back: 'red', felt: 'green', table: '2d'};

export function loadPrefs(): Prefs {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {};
        return {
            sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULTS.sound,
            vibration: typeof saved.vibration === 'boolean' ? saved.vibration : DEFAULTS.vibration,
            speed: saved.speed === 'fast' ? 'fast' : 'normal',
            back: saved.back in BACK_COLORS ? saved.back : DEFAULTS.back,
            felt: saved.felt in TABLE_THEMES ? saved.felt : DEFAULTS.felt,
            table: saved.table === '3d' ? '3d' : '2d',
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
