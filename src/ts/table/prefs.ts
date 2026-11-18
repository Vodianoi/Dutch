import {scoped} from '../env.js';
import {BackColor, BACK_COLORS} from './art.js';

/**
 *  Preferences of this device (not rules of the game): sound, vibration, animation speed, card back
 */
export interface Prefs {
    sound: boolean;
    vibration: boolean;
    speed: 'normal' | 'fast';
    back: BackColor;
}

const KEY = scoped('prefs');
const DEFAULTS: Prefs = {sound: true, vibration: true, speed: 'normal', back: 'red'};

export function loadPrefs(): Prefs {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {};
        return {
            sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULTS.sound,
            vibration: typeof saved.vibration === 'boolean' ? saved.vibration : DEFAULTS.vibration,
            speed: saved.speed === 'fast' ? 'fast' : 'normal',
            back: saved.back in BACK_COLORS ? saved.back : DEFAULTS.back,
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
