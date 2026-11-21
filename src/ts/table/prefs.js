import { scoped } from '../env.js';
import { BACK_COLORS, TABLE_THEMES } from './cardArt.js';
/** Multiplies the waiting times of the bots */
export const BOT_PACES = {
    slow: { name: 'Lente', factor: 1.5 },
    normal: { name: 'Normale', factor: 1 },
    fast: { name: 'Rapide', factor: .65 },
};
const KEY = scoped('prefs');
const DEFAULTS = { sound: true, vibration: true, speed: 'normal', back: 'red', felt: 'green', table: '2d', bots: 'normal' };
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
            bots: saved.bots in BOT_PACES ? saved.bots : DEFAULTS.bots,
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
