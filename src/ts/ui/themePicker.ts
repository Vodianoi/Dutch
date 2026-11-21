import {t} from '../i18n.js';
import {loadPrefs, Prefs, savePrefs} from '../table/prefs.js';
import {applyTheme, first, ThemeId, THEME_IDS, THEMES} from '../table/themes.js';

/**
 *  The themes to choose from, as radio buttons named « theme »: each one shows its room, its table, a card
 *  face down and the colour of its « Dutch » key (shared by the home screen and the menu of the game)
 */
export function themeChoices(chosen: ThemeId): string {
    return `<div class="themes" role="radiogroup" aria-label="${t('Thème')}">${THEME_IDS.map(id => {
        const look = THEMES[id];
        const table = look.tables[first(look.tables)];
        const back = look.backs[first(look.backs)];
        const swatch = `--swatch-room: ${table.room[0]}; --swatch-top: ${table.felt[1]}; --swatch-key: ${look.ui.keys.danger.face}; `
            + `--swatch-paper: ${look.cards.paper[0]}; --swatch-back: ${back.light}`;
        return `<label class="theme-choice"><input type="radio" name="theme" value="${id}" ${chosen === id ? 'checked' : ''}><span class="theme-swatch" style="${swatch}" aria-hidden="true"></span>${t(look.name)}</label>`;
    }).join('')}</div>`;
}

/**
 *  This device takes another theme: saved, and worn by the menus at once.
 *  The card backs and the tables are those of the theme: its first ones are taken.
 */
export function chooseTheme(prefs: Prefs, id: ThemeId) {
    prefs.theme = id;
    prefs.back = first(THEMES[id].backs);
    prefs.felt = first(THEMES[id].tables);
    savePrefs(prefs);
    applyTheme(id);
}

/**
 *  Choice of the theme under the home screen
 *  @param onChange what is drawn with the theme has to be drawn again
 */
export function themeSwitch(onChange: () => void): HTMLElement {
    const nav = document.createElement('nav');
    nav.className = 'theme-switch';
    nav.setAttribute('aria-label', t('Thème'));
    nav.innerHTML = themeChoices(loadPrefs().theme);
    nav.addEventListener('change', e => {
        const input = e.target as HTMLInputElement;
        if (input.name !== 'theme' || !(input.value in THEMES)) return;
        chooseTheme(loadPrefs(), input.value as ThemeId);
        onChange();
    });
    return nav;
}
