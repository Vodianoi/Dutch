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

test('anybody joins a public game from the list, before or during the game', async () => {
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
        assert.equal(started.open, true, 'a game in progress takes newcomers for the next round');
        assert.equal(started.late, true);
        const late = await Client.join(transport, started.code, 'Late', `token-late-${Math.random()}`);
        clients.push(late);
        await until(() => late.lobby?.players.at(-1)?.waiting === true);
        assert.equal(late.state, null);
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

test('a player whose public game went away is refused by the next game on the same code, not seated', async () => {
    const first = await publicHost('Eddy');
    const client = await Client.join(transport, first.code, 'Inès', `token-ines-${Math.random()}`, {retryDelaysMs: [50], giveUpMs: 5000});
    let closed = null;
    client.on(e => {
        if (e.type === 'closed') closed = e.reason;
    });
    await until(() => first.lobby.players.length === 2);
    assert.ok(client.room, 'the host gave its room id');
    // Phone of the host asleep: the code is free for a moment, another public game takes it
    first.suspend();
    const second = await publicHost('Zoé');
    try {
        assert.equal(second.code, first.code);
        await until(() => closed !== null);
        assert.match(closed, /terminée/);
        assert.equal(second.lobby.players.length, 1, 'nobody was seated by mistake');
    } finally {
        client.leave();
        second.close();
        first.close();
    }
});

test('a player coming back to his own public game gets his seat back', async () => {
    const host = await publicHost('Eddy');
    const token = `token-ines-${Math.random()}`;
    const client = await Client.join(transport, host.code, 'Inès', token);
    await until(() => host.lobby.players.length === 2);
    const room = client.room;
    host.start({deckCount: 1});
    await until(() => client.state);
    client.leave();
    try {
        const again = await Client.join(transport, host.code, 'Inès', token, {room});
        await until(() => again.state);
        assert.equal(again.seat, 1);
        again.leave();
    } finally {
        host.close();
    }
});

test('player tokens are long secure random values', async () => {
    const {randomToken} = await import('../src/ts/net/Protocol.js');
    const tokens = new Set(Array.from({length: 200}, randomToken));
    assert.equal(tokens.size, 200);
    for (const token of tokens) assert.match(token, /^[0-9a-f]{32}$/);
});

test('the host removes a stranger from the waiting room: he is told, and can\'t come back', async () => {
    const host = await publicHost('Eddy');
    const token = `token-troll-${Math.random()}`;
    const troll = await Client.join(transport, host.code, 'Troll', token);
    const friend = await Client.join(transport, host.code, 'Inès', `token-ines-${Math.random()}`);
    let reason = null;
    troll.on(e => {
        if (e.type === 'closed') reason = e.reason;
    });
    try {
        await until(() => host.lobby.players.length === 3);
        host.kick(1);
        await until(() => reason !== null);
        assert.match(reason, /retiré/);
        assert.deepEqual(host.lobby.players.map(p => p.name), ['Eddy', 'Inès']);
        await until(() => friend.lobby?.players.length === 2);
        await assert.rejects(Client.join(transport, host.code, 'Troll', token), /retiré/);
        // Once the cards are dealt nobody can be removed (every hand is in the game)
        host.start({deckCount: 1});
        host.kick(1);
        assert.equal(host.lobby.players.length, 2);
    } finally {
        troll.leave();
        friend.leave();
        host.close();
    }
});

test('public games: reactions only, no free text between strangers; private games keep the chat', async () => {
    const host = await publicHost('Eddy');
    const client = await Client.join(transport, host.code, 'Inès', `token-ines-${Math.random()}`);
    const privateHost = new Host(await transport.host(), 'Léa', {heartbeatMs: 100000});
    const friend = await Client.join(transport, privateHost.code, 'Hugo', `token-hugo-${Math.random()}`);
    try {
        await until(() => host.lobby.players.length === 2 && privateHost.lobby.players.length === 2);
        assert.equal(host.chat.text, false);
        assert.equal(client.chat.text, false);
        assert.equal(privateHost.chat.text, true);
        assert.equal(friend.chat.text, true);
        client.chat.send('hello stranger');
        host.chat.send('hi');
        client.chat.emote('👍');
        await until(() => host.chat.messages.length === 1 && client.chat.messages.length === 1);
        await wait(100);
        assert.deepEqual(host.chat.messages.map(m => m.emote ?? m.text), ['👍']);
        friend.chat.send('salut');
        await until(() => privateHost.chat.messages.some(m => m.text === 'salut'));
    } finally {
        client.leave();
        friend.leave();
        host.close();
        privateHost.close();
    }
});

test('a player cleans the rules a host sends (a stranger could send anything)', async () => {
    const room = await transport.host();
    room.onConnection(connection => connection.onMessage(message => {
        if (message.t !== 'hello') return;
        connection.send({t: 'welcome', seat: 1, room: 'r'});
        connection.send({
            t: 'lobby', you: 1, lobby: {
                code: room.code, started: false, players: [{name: 'Bad', color: '#000', connected: true}, {name: 'Me', color: '#fff', connected: true}],
                settings: {targetScore: '<img src=x onerror=alert(1)>', deckCount: 99, effects: ['NOPE', 'ACE'], peekVariant: 'yes'},
            },
        });
    }));
    const client = await Client.join(transport, room.code, 'Me', `token-me-${Math.random()}`);
    try {
        await until(() => client.lobby);
        assert.deepEqual(client.lobby.settings, {deckCount: 1, cardsPerPlayer: 4, targetScore: 50, dutchPenalty: 10, peekVariant: true, effects: ['ACE']});
    } finally {
        client.leave();
        room.close();
    }
});

test('a newcomer during the game is seated at the next round, with the average score', async () => {
    const host = await publicHost('Eddy', {deckCount: 1});
    const hugo = await Client.join(transport, host.code, 'Hugo', `token-hugo-${Math.random()}`);
    const notices = [];
    hugo.on(e => {
        if (e.type === 'notice') notices.push(e.notice.text);
    });
    try {
        await until(() => host.lobby.players.length === 2);
        host.start();
        await until(() => hugo.state);
        const zoe = await Client.join(transport, host.code, 'Zoé', `token-zoe-${Math.random()}`);
        try {
            await until(() => zoe.lobby?.players.length === 3);
            assert.equal(zoe.state, null, 'no cards during this round');
            assert.equal(host.state.players.length, 2, 'the round goes on with the same players');
            await until(() => notices.some(n => /Zoé jouera à partir de la prochaine manche/.test(n)));
            // End of the round (scores 10 and 21), the host starts the next one
            const game = host.game;
            game.players[0].score = 10;
            game.players[1].score = 21;
            game.phase = 'roundOver';
            host.dispatch({type: 'nextRound'});
            await until(() => zoe.state);
            assert.equal(zoe.state.viewerId, 2);
            assert.equal(zoe.state.players.length, 3);
            assert.equal(zoe.state.players[2].score, 16, 'rounded average of 10 and 21');
            await until(() => hugo.state.players.length === 3);
            assert.equal(host.lobby.players.some(p => p.waiting), false);
        } finally {
            zoe.leave();
        }
    } finally {
        hugo.leave();
        host.close();
    }
});

test('waiting for the next round: leaving frees the seat, the host can remove, the deck must have room', async () => {
    const host = await publicHost('Eddy', {deckCount: 1, cardsPerPlayer: 6});
    const clients = [];
    try {
        for (const name of ['B', 'C', 'D', 'E', 'F']) {
            clients.push(await Client.join(transport, host.code, name, `token-${name}-${Math.random()}`));
        }
        await until(() => host.lobby.players.length === 6);
        host.start();
        // 6 players × 6 cards + 7 = 43 ≤ 52: one more fits (7 × 6 + 8 = 50), two more don't
        const g = await Client.join(transport, host.code, 'G', `token-g-${Math.random()}`);
        await until(() => host.lobby.players.length === 7);
        await assert.rejects(Client.join(transport, host.code, 'H', `token-h-${Math.random()}`), /Plus assez de cartes/);
        // The host removes the one waiting (the players of the game can't be removed now)
        let reason = null;
        g.on(e => {
            if (e.type === 'closed') reason = e.reason;
        });
        host.kick(1);
        assert.equal(host.lobby.players.length, 7, 'a player of the game stays');
        host.kick(6);
        await until(() => reason !== null);
        assert.equal(host.lobby.players.length, 6);
        // Someone waiting who leaves frees his seat
        const h = await Client.join(transport, host.code, 'H', `token-h2-${Math.random()}`);
        await until(() => host.lobby.players.length === 7);
        h.leave();
        await until(() => host.lobby.players.length === 6);
    } finally {
        clients.forEach(c => c.leave());
        host.close();
    }
});
