// Online play: host + clients over BroadcastChannel (same API as the WebRTC transport)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BroadcastTransport} from '../src/ts/net/BroadcastTransport.js';
import {Host} from '../src/ts/net/Host.js';
import {Client} from '../src/ts/net/Client.js';
import Card from '../src/ts/Card.js';

const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
const until = async (check, ms = 2000) => {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) throw new Error('timeout');
        await wait(10);
    }
};
const transport = new BroadcastTransport(500);

async function setup(names = ['Hugo', 'Axel']) {
    const host = new Host(await transport.host(), 'Eddy', {heartbeatMs: 100000});
    const clients = [];
    for (const name of names) clients.push(await Client.join(transport, host.code, name, `token-${name}-${Math.random()}`));
    await until(() => host.lobby.players.length === names.length + 1);
    const events = clients.map(client => {
        const list = [];
        client.on(e => list.push(e));
        return list;
    });
    const close = () => {
        clients.forEach(c => c.leave());
        host.close();
    };
    return {host, clients, events, close};
}

test('players join a lobby and get their seat', async () => {
    const {host, clients, close} = await setup(['Hugo', 'Hugo']);
    try {
        await until(() => clients[1].lobby?.players.length === 3);
        assert.deepEqual(host.lobby.players.map(p => p.name), ['Eddy', 'Hugo', 'Hugo 2']);
        assert.deepEqual(clients.map(c => c.seat), [1, 2]);
    } finally {
        close();
    }
});

test('each device only sees its own point of view', async () => {
    const {host, clients, events, close} = await setup();
    try {
        host.start({deckCount: 1});
        await until(() => clients.every(c => c.state));
        assert.equal(host.state.viewerId, 0);
        assert.deepEqual(clients.map(c => c.state.viewerId), [1, 2]);
        // nobody receives the value of a card in a hand
        for (const c of clients) {
            for (const p of c.state.players) for (const card of p.hand) assert.deepEqual(Object.keys(card), ['id']);
        }

        // Eddy (host, seat 0) draws: only he sees the card
        host.dispatch({type: 'drawFromPile', playerId: 0});
        await until(() => clients[0].state.phase === 'drawn');
        assert.ok(host.state.drawn.card.value);
        assert.equal(clients[0].state.drawn.card.value, undefined);
        assert.equal(clients[1].state.drawn.card.value, undefined);

        // He swaps: the new card is revealed to him only
        const hostReveals = [];
        host.on(e => e.type === 'reveal' && hostReveals.push(e));
        host.dispatch({type: 'swapDrawn', playerId: 0, cardId: host.state.players[0].hand[0].id});
        await until(() => clients[0].state.phase === 'played');
        await wait();
        assert.equal(hostReveals.length, 1);
        assert.ok(events.every(list => !list.some(e => e.type === 'reveal')));
    } finally {
        close();
    }
});

test('a device can only play for its own seat', async () => {
    const {host, clients, events, close} = await setup();
    try {
        host.start({deckCount: 1});
        await until(() => clients.every(c => c.state));
        // Hugo pretends to be Eddy (seat 0) to draw
        clients[0].dispatch({type: 'drawFromPile', playerId: 0});
        await until(() => events[0].some(e => e.type === 'notice'));
        assert.match(events[0].find(e => e.type === 'notice').notice.text, /Ce n'est pas le tour de Hugo/);
        assert.equal(host.state.phase, 'draw');
        // and can't start the next round
        clients[0].dispatch({type: 'nextRound', playerId: 0});
        await until(() => events[0].filter(e => e.type === 'notice').length === 2);
    } finally {
        close();
    }
});

test('private reveals reach only their owner, wrong throws reach everybody', async () => {
    const {host, clients, events, close} = await setup();
    try {
        host.start({deckCount: 1, peekVariant: true});
        await until(() => clients.every(c => c.state?.phase === 'peek'));
        clients[0].dispatch({type: 'peek', playerId: 1});
        await until(() => events[0].filter(e => e.type === 'reveal').length === 2);
        const hugoCards = clients[0].state.players[1].hand.slice(-2).map(c => c.id);
        assert.deepEqual(events[0].filter(e => e.type === 'reveal').map(e => e.card.id), hugoCards);
        assert.ok(events[0].filter(e => e.type === 'reveal').every(e => e.card.value));
        assert.equal(events[1].filter(e => e.type === 'reveal').length, 0);

        host.dispatch({type: 'peek', playerId: 0});
        clients[1].dispatch({type: 'peek', playerId: 2});
        await until(() => clients[1].state.phase === 'draw');

        // Axel throws a card that doesn't match (forced through the host's engine)
        const game = host['game'];
        game.deck.discardPile.push(new Card('zz-top', '5', 'HEARTS'));
        game.players[2].hand[0] = new Card('zz-bad', '9', 'CLUBS');
        clients[1].dispatch({type: 'throwCard', playerId: 2, cardId: 'zz-bad'});
        await until(() => events[0].some(e => e.type === 'reveal' && e.card.id === 'zz-bad'));
        assert.ok(events[1].some(e => e.type === 'reveal' && e.card.id === 'zz-bad'));
        await until(() => events[1].some(e => e.type === 'notice'));
    } finally {
        close();
    }
});

test('a player who reconnects with his token gets his seat back', async () => {
    const host = new Host(await transport.host(), 'Eddy', {heartbeatMs: 100000});
    const a = await Client.join(transport, host.code, 'Hugo', 'token-hugo-123');
    try {
        host.start({deckCount: 1});
        await until(() => a.state);
        a.leave();
        await until(() => host.state.players[1].connected === false);
        await assert.rejects(Client.join(transport, host.code, 'Intrus', 'token-other-123'), /déjà commencé/);
        const back = await Client.join(transport, host.code, 'Hugo', 'token-hugo-123');
        await until(() => back.state);
        assert.equal(back.state.viewerId, 1);
        assert.equal(host.state.players[1].connected, true);
        back.leave();
    } finally {
        host.close();
    }
});

test('joining an unknown room fails cleanly', async () => {
    await assert.rejects(Client.join(transport, 'NOPE9', 'Hugo', 'token-xyz-123'), /introuvable/);
});

test('a full online round can be played to the scores', async () => {
    const {host, clients, close} = await setup(['Hugo']);
    try {
        host.start({deckCount: 1});
        await until(() => clients[0].state);
        const hugo = clients[0];
        const skip = async (session, seat) => {
            while (host.state.activeEffect) {
                (host.state.activeEffect.playerId === 0 ? host : session).dispatch({type: 'skipEffect', playerId: host.state.activeEffect.playerId});
                await wait();
            }
        };
        host.dispatch({type: 'drawFromPile', playerId: 0});
        host.dispatch({type: 'discardDrawn', playerId: 0});
        await skip(hugo);
        host.dispatch({type: 'endTurn', playerId: 0, dutch: true});
        await until(() => hugo.state.currentPlayerIndex === 1);
        hugo.dispatch({type: 'drawFromPile', playerId: 1});
        await until(() => hugo.state.phase === 'drawn');
        hugo.dispatch({type: 'discardDrawn', playerId: 1});
        await until(() => hugo.state.phase === 'played');
        await skip(hugo);
        await until(() => !hugo.state.activeEffect);
        hugo.dispatch({type: 'endTurn', playerId: 1, dutch: false});
        await until(() => hugo.state.phase === 'roundOver');
        assert.equal(hugo.state.lastResult.scores.length, 2);
        assert.ok(hugo.state.lastResult.scores.every(s => s.hand.every(c => c.value)));
        host.dispatch({type: 'nextRound', playerId: 0});
        await until(() => hugo.state.round === 2);
    } finally {
        close();
    }
});

// region Robustness: phones lose the connection all the time
const fast = {retryDelaysMs: [0, 50, 100], welcomeTimeoutMs: 500};

test('a player reconnects on his own when the connection drops, and keeps his seat', async () => {
    const host = new Host(await transport.host(), 'Eddy', {heartbeatMs: 100000});
    const hugo = await Client.join(transport, host.code, 'Hugo', 'token-hugo-drop', fast);
    const statuses = [];
    hugo.on(e => e.type === 'connection' && statuses.push(e.status));
    try {
        host.start({deckCount: 1});
        await until(() => hugo.state);
        const hand = hugo.state.players[1].hand.map(c => c.id);
        // The host's page goes away for a moment (tab in the background, network change...)
        host.suspend();
        await until(() => hugo.status === 'reconnecting');
        await wait(150);
        host.resume();
        await until(() => hugo.status === 'online');
        assert.deepEqual(statuses, ['reconnecting', 'online']);
        await until(() => host.state.players[1].connected);
        assert.equal(hugo.state.viewerId, 1);
        assert.deepEqual(hugo.state.players[1].hand.map(c => c.id), hand);
        // and can play again
        host.dispatch({type: 'drawFromPile', playerId: 0});
        await until(() => hugo.state.phase === 'drawn');
    } finally {
        hugo.leave();
        host.close();
    }
});

test('the host page is reloaded: the saved game is reopened and the players come back', async () => {
    let saved = null;
    const first = new Host(await transport.host(), 'Eddy', {heartbeatMs: 100000, persist: s => saved = s});
    const code = first.code;
    const hugo = await Client.join(transport, code, 'Hugo', 'token-hugo-reload', fast);
    const axel = await Client.join(transport, code, 'Axel', 'token-axel-reload', fast);
    let second = null;
    try {
        first.start({deckCount: 1});
        await until(() => hugo.state && axel.state);
        first.dispatch({type: 'drawFromPile', playerId: 0});
        await until(() => hugo.state.phase === 'drawn');
        const before = JSON.stringify(saved.game);
        // The page dies (no goodbye to the players), then the reloaded page reopens the room
        first.suspend();
        await until(() => hugo.status === 'reconnecting' && axel.status === 'reconnecting');
        second = new Host(await transport.host(code), 'Eddy', {heartbeatMs: 100000, restore: JSON.parse(JSON.stringify(saved))});
        await until(() => hugo.status === 'online' && axel.status === 'online');
        await until(() => second.state.players.every(p => p.connected));
        assert.equal(JSON.stringify(second.snapshot().game), before);
        assert.equal(hugo.state.phase, 'drawn');
        assert.deepEqual(second.lobby.players.map(p => p.name), ['Eddy', 'Hugo', 'Axel']);
        // The game goes on where it was
        second.dispatch({type: 'discardDrawn', playerId: 0});
        await until(() => axel.state.phase !== 'drawn');
    } finally {
        hugo.leave();
        axel.leave();
        second?.close();
        first.close();
    }
});

test('when the host quits on purpose, the players are told and stop reconnecting', async () => {
    const host = new Host(await transport.host(), 'Eddy', {heartbeatMs: 100000});
    const hugo = await Client.join(transport, host.code, 'Hugo', 'token-hugo-end', fast);
    const events = [];
    hugo.on(e => events.push(e));
    host.start({deckCount: 1});
    await until(() => hugo.state);
    host.close();
    await until(() => events.some(e => e.type === 'closed'));
    assert.match(events.find(e => e.type === 'closed').reason, /quitté/);
    assert.ok(!events.some(e => e.type === 'connection'));
});

test('a player stops trying after the give-up delay', async () => {
    const host = new Host(await transport.host(), 'Eddy', {heartbeatMs: 100000});
    const hugo = await Client.join(transport, host.code, 'Hugo', 'token-hugo-giveup', {...fast, giveUpMs: 300});
    const events = [];
    hugo.on(e => events.push(e));
    try {
        host.start({deckCount: 1});
        await until(() => hugo.state);
        host.suspend();
        await until(() => events.some(e => e.type === 'closed'), 4000);
        assert.match(events.find(e => e.type === 'closed').reason, /ne revient pas/);
    } finally {
        host.close();
    }
});

test('after the host page slept, the players are not dropped for being silent', async () => {
    const host = new Host(await transport.host(), 'Eddy', {heartbeatMs: 100000, timeoutMs: 1000});
    const hugo = await Client.join(transport, host.code, 'Hugo', 'token-hugo-sleep', fast);
    try {
        host.start({deckCount: 1});
        await until(() => hugo.state);
        // The page was frozen for a minute: no tick, no pong received
        host['lastTick'] = Date.now() - 1000000;
        host['seats'][1].lastSeen = Date.now() - 60000;
        host['tick']();
        assert.equal(host.state.players[1].connected, true);
        // but a player really silent after that is dropped
        host['seats'][1].lastSeen = Date.now() - 60000;
        host['tick']();
        await until(() => host.state.players[1].connected === false);
    } finally {
        hugo.leave();
        host.close();
    }
});
// endregion

test('the host chooses the rules in the lobby, everybody sees them, and colours are unique', async () => {
    const [blue] = (await import('../src/ts/Settings.js')).PLAYER_COLORS.map(p => p.value);
    const host = new Host(await transport.host(), 'Eddy', {heartbeatMs: 100000, color: blue, settings: {cardsPerPlayer: 5}});
    const hugo = await Client.join(transport, host.code, 'Hugo', 'token-hugo-rules', {color: blue});
    try {
        await until(() => hugo.lobby);
        assert.equal(hugo.lobby.settings.cardsPerPlayer, 5);
        const colors = hugo.lobby.players.map(p => p.color);
        assert.equal(colors[0], blue);
        assert.notEqual(colors[1], blue);
        host.setSettings({targetScore: 50, effects: ['ACE']});
        await until(() => hugo.lobby.settings.targetScore === 50);
        assert.deepEqual(hugo.lobby.settings.effects, ['ACE']);
        host.start();
        await until(() => hugo.state);
        assert.equal(hugo.state.settings.cardsPerPlayer, 5);
        assert.equal(hugo.state.players[1].hand.length, 5);
        assert.equal(hugo.state.players[1].color, colors[1]);
        assert.equal(host.snapshot().settings.targetScore, 50);
    } finally {
        hugo.leave();
        host.close();
    }
});
