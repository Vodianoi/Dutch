import { scoped } from '../env.js';
import { BACK_COLORS, TABLE_THEMES } from './cardArt.js';
const KEY = scoped('prefs');
const DEFAULTS = { sound: true, vibration: true, speed: 'normal', back: 'red', felt: 'green', table: '2d' };
export function loadPrefs() {
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
    }
    catch {
        return { ...DEFAULTS };
    }
}
export function savePrefs(prefs) {
    try {
        localStorage.setItem(KEY, JSON.stringify(prefs));
    }
    catch {
        // Storage refused: the preferences last until the page is closed
    }
}
/** Short vibration on phones that support it, if the player wants it */
export function buzz(prefs, pattern) {
    if (prefs.vibration)
        navigator.vibrate?.(pattern);
}
