// Languages: every sentence shown to the players has its English version
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {EN} from '../src/ts/i18n-en.js';
import {cardLabel, joinNames, lang, msg, render, setLang, t} from '../src/ts/i18n.js';
import Dutch, {RuleError} from '../src/ts/Dutch.js';
import Card from '../src/ts/Card.js';
import {EFFECT_LABELS, PLAYER_COLORS} from '../src/ts/Settings.js';
import {BACK_COLORS} from '../src/ts/table/cardArt.js';

/** The old HTML game screen (?classic) stays in French */
const SKIP = /(GameView|moves|CardView|i18n|i18n-en)\.ts$/;

function sources(dir) {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return path.endsWith('.ts') && !SKIP.test(path) ? [path] : [];
    });
}

/** Arguments of a call, split at the top level (quotes, template strings and brackets skipped) */
function callArgs(src, open) {
    const args = [];
    let depth = 0, start = open + 1, quote = null;
    for (let i = open + 1; i < src.length; i++) {
        const c = src[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === '\'' || c === '"' || c === '`') quote = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) {
            if (depth === 0) {
                args.push(src.slice(start, i));
                return args;
            }
            depth--;
        } else if (c === ',' && depth === 0) {
            args.push(src.slice(start, i));
            start = i + 1;
        }
    }
    return args;
}

const literals = text => [...text.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map(m => JSON.parse(`"${m[1].replace(/\\'/g, '\'').replace(/"/g, '\\"')}"`));

/** French sentences given to t(), msg(), the engine log, rule errors, notices and network reasons */
function frenchSentences() {
    const found = new Map();
    for (const file of sources('src/ts')) {
        const src = readFileSync(file, 'utf8');
        for (const m of src.matchAll(/(?<![\w])(t|msg|addLog|RuleError|notice|refuse)\(/g)) {
            const args = callArgs(src, m.index + m[0].length - 1);
            // notice(kind, sentence); the others: the sentence first (both sides of a ternary)
            const arg = m[1] === 'notice' ? args[1] : args[0];
            if (!arg || /^\s*`/.test(arg)) continue;
            for (const text of literals(arg)) {
                if (/[A-Za-zÀ-ÿ]{2}/.test(text) && !/^(error|info|good|bad|effect|dutch|score)$/.test(text)) found.set(text, file);
            }
        }
        for (const m of src.matchAll(/reason: '((?:[^'\\]|\\.)*)'/g)) found.set(literals(`'${m[1]}'`)[0], file);
    }
    return found;
}

test('every French sentence of the game has its English version', () => {
    const missing = [...frenchSentences()].filter(([fr]) => !(fr in EN)).map(([fr, file]) => `${file}: ${fr}`);
    for (const label of [...Object.values(EFFECT_LABELS).flatMap(l => [l.name, l.effect]), ...PLAYER_COLORS.map(c => c.name), ...Object.values(BACK_COLORS).map(b => b.name)]) {
        if (!(label in EN)) missing.push(`label: ${label}`);
    }
    assert.deepEqual(missing, []);
});

test('every English sentence keeps the values of the French one', () => {
    const problems = [];
    for (const [fr, en] of Object.entries(EN)) {
        const names = s => new Set([...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]));
        const allowed = names(fr);
        // The Jack sentences give the bare names too ({a}, {b}) for the languages without « de / d' »
        if (allowed.has('deA')) allowed.add('a');
        if (allowed.has('deB')) allowed.add('b');
        for (const name of names(en)) if (!allowed.has(name)) problems.push(`${fr} → {${name}}`);
    }
    assert.deepEqual(problems, []);
});

test('the source sentences found are really used (the scan works)', () => {
    const found = frenchSentences();
    assert.ok(found.size > 200, `${found.size} sentences`);
    assert.ok(found.has('Finir mon tour'));
    assert.ok(found.has('{name} pioche une carte.'));
    assert.ok(found.has('Pas assez de cartes pour {players} joueurs à {cards} cartes : prenez 2 paquets ou moins de cartes par joueur.'));
});

test('the game log and rule errors are shown in the language of each device', () => {
    const before = lang();
    try {
        const game = new Dutch({players: ['Léa', 'Hugo'], peekVariant: false});
        game.startRound();
        const turn = game.log.find(e => e.message.startsWith('C\'est au tour'));
        assert.equal(turn.message, 'C\'est au tour de Léa.', 'older pages get French');
        assert.equal(render(turn.msg, 'en'), 'It\'s Léa\'s turn.');
        assert.equal(render(turn.msg, 'fr'), turn.message);
        // Through JSON, like an online game
        const copy = JSON.parse(JSON.stringify(turn));
        assert.equal(render(copy.msg, 'en'), 'It\'s Léa\'s turn.');
        const error = (() => {
            try {
                game.drawFromPile(1);
            } catch (e) {
                return e;
            }
        })();
        assert.ok(error instanceof RuleError);
        assert.equal(error.message, 'Ce n\'est pas le tour de Hugo.');
        assert.equal(render(error.msg, 'en'), 'It\'s not Hugo\'s turn.');
        setLang('en', false);
        assert.equal(t('Finir mon tour'), 'End my turn');
        assert.equal(t('Phrase sans traduction'), 'Phrase sans traduction', 'missing: stays in French');
    } finally {
        setLang(before, false);
    }
});

test('cards are written the way of each language', () => {
    const king = new Card('k', 'KING', 'SPADES');
    const queen = new Card('q', 'QUEEN', 'HEARTS');
    assert.equal(cardLabel(king.ref, 'fr'), 'R♠');
    assert.equal(cardLabel(king.ref, 'en'), 'K♠');
    assert.equal(cardLabel(queen.longRef, 'fr'), 'Dame de cœur');
    assert.equal(cardLabel(queen.longRef, 'en'), 'Queen of hearts');
    assert.equal(cardLabel(new Card('t', '10', 'CLUBS').ref, 'en'), '10♣');
    assert.equal(render(msg('{name} jette {card} sur {top} !', {name: 'Léa', card: queen.ref, top: queen.ref}), 'en'), 'Léa throws Q♥ on Q♥!');
    assert.equal(joinNames(['Léa', 'Hugo', 'Inès'], 'fr'), 'Léa, Hugo et Inès');
    assert.equal(joinNames(['Léa', 'Hugo'], 'en'), 'Léa and Hugo');
});
