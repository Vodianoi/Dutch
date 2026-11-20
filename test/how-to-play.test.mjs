// How to play (menu): follows the rules of the game
import test from 'node:test';
import assert from 'node:assert/strict';
import {howToPlay} from '../src/ts/howToPlay.js';
import {cleanSettings} from '../src/ts/Settings.js';
import {setLang, lang} from '../src/ts/i18n.js';

const text = sections => sections.flatMap(s => [s.title, ...s.lines]).join('\n');

test('how to play follows the rules chosen for the game', () => {
    const defaults = text(howToPlay(cleanSettings(null)));
    assert.match(defaults, /atteint 50 points/);
    assert.match(defaults, /4 cartes, face cachée/);
    assert.match(defaults, /2 cartes du bas/, 'variant on by default');
    assert.match(defaults, /Valet :/);
    assert.match(defaults, /Dame :/);
    assert.match(defaults, /As :/);
    assert.match(defaults, /10 points de plus/);
    assert.match(defaults, /Roi rouge = 0/);

    const other = text(howToPlay(cleanSettings({targetScore: 150, cardsPerPlayer: 6, peekVariant: false, effects: ['QUEEN'], dutchPenalty: 0})));
    assert.match(other, /atteint 150 points/);
    assert.match(other, /6 cartes/);
    assert.doesNotMatch(other, /2 cartes du bas/);
    assert.doesNotMatch(other, /Valet :/);
    assert.match(other, /Dame :/);
    assert.doesNotMatch(other, /As :/);
    assert.match(other, /pas de pénalité/);

    const none = text(howToPlay(cleanSettings({effects: []})));
    assert.match(none, /Aucune carte spéciale/);
});

test('how to play in English', () => {
    const before = lang();
    try {
        setLang('en', false);
        const english = text(howToPlay(cleanSettings(null)));
        assert.match(english, /How|goal/i);
        assert.match(english, /reaches 50 points/);
        assert.match(english, /red King = 0/);
        assert.doesNotMatch(english, /[àéèç]/, 'nothing left in French');
    } finally {
        setLang(before, false);
    }
});
