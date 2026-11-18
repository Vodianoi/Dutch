// The real site keeps its storage keys; the test version (/dev/) uses others
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IS_DEV, scoped} from '../src/ts/env.js';

test('outside of /dev/ the names are the ones the real site always used', () => {
    assert.equal(IS_DEV, false);
    assert.equal(scoped('setup'), 'dutch-setup');
    assert.equal(scoped('token-ABCDE'), 'dutch-token-ABCDE');
});
