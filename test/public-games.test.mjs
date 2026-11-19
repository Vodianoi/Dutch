// Public games: rooms with known codes, found by knocking on each one (no server)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BroadcastTransport} from '../src/ts/net/BroadcastTransport.js';
import {Host} from '../src/ts/net/Host.js';
import {Client} from '../src/ts/net/Client.js';
import {findPublicGames} from '../src/ts/net/PublicGames.js';
import {isPublicCode, PUBLIC_CODES, PUBLIC_SLOTS} from '../src/ts/net/Transport.js';

const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
const until = async (check, ms = 3000) => {
    const end = Date.now() + ms;
    while (!(await check())) {
        if (Date.now() > end) throw new Error('timeout');
        await wait(20);
    }
};
const transport = new BroadcastTransport(500);
const find = () => findPublicGames(transport, 800);
const publicHost = async (name, settings = {}) =>
    new Host(await transport.hostFirstFree(PUBLIC_CODES), name, {heartbeatMs: 100000, settings: {peekVariant: false, ...settings}});

test('public codes: 20 known slots, typed like any code', () => {
    assert.equal(PUBLIC_CODES.length, PUBLIC_SLOTS);
    assert.equal(PUBLIC_CODES[0], 'PUB01');
    assert.equal(PUBLIC_CODES[19], 'PUB20');
    assert.ok(isPublicCode('PUB07'));
    assert.ok(!isPublicCode('ABCDE'));
});

test('public hosts take the first free slots, the list finds them with their host, players and rules', async () => {
    const léa = await publicHost('Léa', {targetScore: 100});
    const hugo = await publicHost('Hugo');
    const private_ = new Host(await transport.host(), 'Secret', {heartbeatMs: 100000});
    try {
        assert.equal(léa.code, 'PUB01');
        assert.equal(hugo.code, 'PUB02');
        assert.ok(léa.isPublic && !private_.isPublic);
        const games = await find();
        assert.deepEqual(games.map(g => g.host).sort(), ['Hugo', 'Léa'], 'private rooms are not listed');
        const lea = games.find(g => g.host === 'Léa');
        assert.equal(lea.code, 'PUB01');
        assert.equal(lea.players, 1);
        assert.equal(lea.max, 10);
        assert.equal(lea.open, true);
        assert.equal(lea.settings.targetScore, 100);
        // Knocking doesn't take a seat
        assert.equal(léa.lobby.players.length, 1);
    } finally {
        léa.close();
        hugo.close();
        private_.close();
    }
});

test('anybody joins a public game from the list until it starts', async () => {
    const host = await publicHost('Eddy');
    const clients = [];
    try {
        const [game] = await find();
        clients.push(await Client.join(transport, game.code, 'Inès', `token-ines-${Math.random()}`));
        clients.push(await Client.join(transport, game.code, 'Malo', `token-malo-${Math.random()}`));
        await until(() => host.lobby.players.length === 3);
        await until(async () => (await find())[0]?.players === 3);
        // Fullest open games first
        const other = await publicHost('Zoé');
        try {
            const list = await find();
            assert.deepEqual(list.map(g => [g.host, g.players]), [['Eddy', 3], ['Zoé', 1]]);
        } finally {
            other.close();
        }
        host.start({deckCount: 1});
        await until(async () => (await find())[0]?.started === true);
        const [started] = await find();
        assert.equal(started.open, false, 'a game in progress can be seen, not joined');
        await assert.rejects(Client.join(transport, started.code, 'Late', `token-late-${Math.random()}`), /déjà commencé/);
    } finally {
        clients.forEach(c => c.leave());
        host.close();
    }
});

test('a public game that ends leaves the list and frees its slot', async () => {
    const host = await publicHost('Eddy');
    assert.equal(host.code, 'PUB01');
    assert.equal((await find()).length, 1);
    host.close();
    await until(async () => (await find()).length === 0);
    const again = await publicHost('Léa');
    try {
        assert.equal(again.code, 'PUB01', 'the slot is free again');
    } finally {
        again.close();
    }
});

test('an answer that is not a room, or from another version, is not joinable', async () => {
    const fake = {
        ask: async () => new Map([
            ['PUB01', {t: 'info', room: {v: 999, host: 'Old', players: 2, max: 10, started: false, settings: {}}}],
            ['PUB02', {t: 'hello'}],
            ['PUB03', {t: 'info', room: {v: 2, host: '  A very very long name indeed  ', players: 99, max: 10, started: false, settings: {targetScore: 7}}}],
        ]),
    };
    const games = await findPublicGames(fake, 100);
    assert.equal(games.length, 2);
    const old = games.find(g => g.code === 'PUB01');
    assert.equal(old.open, false);
    const big = games.find(g => g.code === 'PUB03');
    assert.equal(big.players, 10, 'never more than 10');
    assert.equal(big.open, false, 'full');
    assert.ok(big.host.length <= 16);
    assert.equal(big.settings.targetScore, 50, 'rules cleaned');
});
