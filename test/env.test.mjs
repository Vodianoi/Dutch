// The real site keeps its storage keys; the test version (/dev/) uses others
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HOT_SEAT, IS_DEV, IS_LOCAL, scoped} from '../src/ts/env.js';

test('outside of /dev/ the names are the ones the real site always used', () => {
    assert.equal(IS_DEV, false);
    assert.equal(scoped('setup'), 'dutch-setup');
    assert.equal(scoped('token-ABCDE'), 'dutch-token-ABCDE');
});

test('"Sur cet écran" is offered for testing (here: no page address, like a local file)', () => {
    assert.equal(IS_LOCAL, true);
    assert.equal(HOT_SEAT, true);
});

test('testing tools (shared screen, 3D table) only on the test version and on this computer', async () => {
    const {hasTestTools, TABLE_3D} = await import('../src/ts/env.js');
    assert.equal(hasTestTools('vodianoi.github.io', '/Dutch/'), false, 'never on the real site');
    assert.equal(hasTestTools('vodianoi.github.io', '/Dutch/index.html'), false);
    assert.equal(hasTestTools('vodianoi.github.io', '/Dutch/dev/'), true);
    assert.equal(hasTestTools('localhost', '/'), true);
    assert.equal(hasTestTools('127.0.0.1', '/Dutch/'), true);
    assert.equal(TABLE_3D, true, 'here: no page address, like a local file');
});
