// Themes: each one dresses the whole game, and every device can choose its own
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyTheme, DEFAULT_THEME, first, hex, theme, THEME_IDS, themeId, THEMES} from '../src/ts/table/themes.js';

const HEX = /^#[0-9a-f]{6}$/;

/** Every colour of what PixiJS draws: `#rrggbb` (hex() reads nothing else) */
function colours(value, path, found = []) {
    if (typeof value === 'string') found.push([path, value]);
    else if (Array.isArray(value)) value.forEach((v, i) => colours(v, `${path}[${i}]`, found));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => colours(v, `${path}.${k}`, found));
    return found;
}

test('every theme has what the table draws with', () => {
    assert.ok(THEME_IDS.length >= 5);
    assert.ok(THEME_IDS.includes(DEFAULT_THEME));
    for (const id of THEME_IDS) {
        const look = THEMES[id];
        assert.ok(look.name, id);
        assert.ok(Object.keys(look.backs).length >= 1, `${id}: a card back`);
        assert.ok(Object.keys(look.tables).length >= 1, `${id}: a table`);
        for (const [path, value] of colours(look.ui, `${id}.ui`)) {
            // Lights are given as "r, g, b"; the style and weight of the « DUTCH ! » are not colours
            if (/\.light$|\.call\.(style|weight)$/.test(path)) continue;
            assert.match(value, HEX, path);
        }
        assert.match(look.ui.light, /^\d+, \d+, \d+$/, `${id}.ui.light`);
        for (const [key, back] of Object.entries(look.backs)) {
            for (const part of ['light', 'dark', 'paint']) assert.match(back[part], HEX, `${id}.backs.${key}.${part}`);
        }
        for (const [key, table] of Object.entries(look.tables)) {
            for (const colour of [...table.room, ...table.rail, ...table.felt]) assert.match(colour, HEX, `${id}.tables.${key}`);
            for (const part of ['inlay', 'ink']) assert.match(table[part], /^\d+, \d+, \d+$/, `${id}.tables.${key}.${part}`);
        }
    }
});

test('a theme is applied by its name; an unknown one gives the first theme', () => {
    try {
        applyTheme('saloon');
        assert.equal(themeId(), 'saloon');
        assert.equal(theme(), THEMES.saloon);
        applyTheme('nope');
        assert.equal(themeId(), DEFAULT_THEME);
    } finally {
        applyTheme(DEFAULT_THEME);
    }
});

test('colours and first choices are read the way the table needs them', () => {
    assert.equal(hex('#ff8000'), 0xff8000);
    assert.equal(first(THEMES.delft.backs), 'delft');
    assert.equal(first(THEMES.modern.tables), 'mist');
});

test('the menus have the tokens of every theme, and the page finds the saved theme before drawing', () => {
    const css = readFileSync('src/css/styles.css', 'utf8');
    for (const id of THEME_IDS) {
        if (id === DEFAULT_THEME) continue;
        assert.ok(css.includes(`[data-theme="${id}"] {`), `styles.css: [data-theme="${id}"]`);
        // The room of the menus is the browser bar colour of the theme
        const block = css.slice(css.indexOf(`[data-theme="${id}"] {`));
        assert.ok(block.slice(0, block.indexOf('}')).includes(`--room: ${THEMES[id].chrome};`), `${id}: --room is ${THEMES[id].chrome}`);
    }
    // The page reads the theme from the same storage name as scoped('prefs') (src/ts/env.ts)
    const page = readFileSync('index.html', 'utf8');
    const env = readFileSync('src/ts/env.ts', 'utf8');
    const versions = /\/\\\/\((.+?)\)\\\/\//.exec(env)?.[1];
    assert.ok(versions, 'env.ts names the test versions');
    assert.ok(page.includes(`/\\/(${versions})\\//`), 'index.html names the same test versions');
    assert.ok(page.includes(`'dutch-' + (version ? version[1] + '-' : '') + 'prefs'`));
});
