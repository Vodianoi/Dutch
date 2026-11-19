// Card sounds: every variant the game asks for is in the sounds folder
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, statSync} from 'node:fs';
import {CARD_SOUNDS} from '../src/ts/table/sound.js';

test('every card sound file is there, and small', () => {
    for (const [name, count] of Object.entries(CARD_SOUNDS)) {
        assert.ok(count > 0);
        for (let i = 1; i <= count; i++) {
            const path = `sounds/card-${name}-${i}.mp3`;
            assert.ok(existsSync(path), `${path} is missing`);
            assert.ok(statSync(path).size < 20_000, `${path} is too big`);
        }
    }
});
