import Dutch, { RuleError } from '../Dutch.js';
import { assignColors, checkSettings, cleanSettings, isPlayerColor } from '../Settings.js';
import { Emitter, findHandCard } from '../Session.js';
import { applyAction, buildView, faceUp } from '../View.js';
import { cleanName, MAX_PLAYERS, PROTOCOL_VERSION, randomToken } from './Protocol.js';
/**
 *  Online game, host side.
 *  - The engine runs here; this device is seat 0
 *  - Each player gets only his own view (buildView) and his own private reveals
 *  - Actions received from a connection are always played for the seat of that connection
 *  - The room is saved after every change and can be reopened (players reconnect with their token)
 */
export class Host {
    constructor(transport, hostName, options = {}) {
        this.viewerId = 0;
        this.isHost = true;
        this.canShowAll = false;
        this.state = null;
        this.events = new Emitter();
        this.lastTick = Date.now();
        this.game = null;
        this.unsubscribeGame = null;
        this.closed = false;
        this.transport = transport;
        this.heartbeatMs = options.heartbeatMs ?? 4000;
        this.timeoutMs = options.timeoutMs ?? 15000;
        this.persistTo = options.persist;
        const saved = options.restore;
        if (saved) {
            const colors = assignColors(saved.seats.map(s => s.color));
            this.seats = saved.seats.map((s, i) => ({ name: s.name, color: colors[i], token: s.token, connection: null, lastSeen: 0 }));
            this.settings = cleanSettings(saved.settings ?? options.settings);
            if (saved.game)
                this.attach(Dutch.restore(saved.game));
        }
        else {
            const color = assignColors([options.color])[0];
            this.seats = [{ name: cleanName(hostName, 'Hôte'), color, token: randomToken(), connection: null, lastSeen: Date.now() }];
            this.settings = cleanSettings(options.settings);
        }
        transport.onConnection(connection => this.accept(connection));
        this.heartbeat = setInterval(() => this.tick(), this.heartbeatMs);
        if (this.game)
            this.broadcastState();
        else
            this.persist();
    }
    // region Public
    get code() {
        return this.transport.code;
    }
    get started() {
        return this.game !== null;
    }
    get lobby() {
        return {
            code: this.code,
            started: this.started,
            settings: this.settings,
            players: this.seats.map((seat, i) => ({ name: seat.name, color: seat.color, connected: this.isConnected(i) })),
        };
    }
    on(listener) {
        return this.events.on(listener);
    }
    /**
     *  Rules chosen in the lobby: shown to every player before the game starts
     */
    setSettings(settings) {
        if (this.game)
            return;
        this.settings = cleanSettings({ ...this.settings, ...settings });
        this.broadcastLobby();
    }
    /**
     *  Deal the cards to everybody in the lobby
     */
    start(options = {}) {
        if (this.game)
            throw new RuleError('La partie a déjà commencé.');
        // Players who left the lobby don't get a seat
        for (let i = this.seats.length - 1; i > 0; i--) {
            if (!this.seats[i].connection)
                this.seats.splice(i, 1);
        }
        if (this.seats.length < 2)
            throw new RuleError('Il faut au moins 2 joueurs.');
        this.settings = cleanSettings({ ...this.settings, ...options });
        const problem = checkSettings(this.seats.length, this.settings);
        if (problem)
            throw new RuleError(problem);
        const game = new Dutch({
            ...this.settings,
            players: this.seats.map(s => s.name),
            playerColors: this.seats.map(s => s.color),
        });
        this.attach(game);
        this.broadcastLobby();
        game.startRound();
    }
    /**
     *  Back to the lobby with the same players (after a game over)
     */
    newGame() {
        this.unsubscribeGame?.();
        this.unsubscribeGame = null;
        this.game = null;
        this.state = null;
        for (let i = this.seats.length - 1; i > 0; i--) {
            if (!this.seats[i].connection)
                this.seats.splice(i, 1);
        }
        this.broadcastLobby();
    }
    dispatch(action) {
        const notice = this.run({ ...action, playerId: 0 }, true);
        if (notice)
            this.events.emit({ type: 'notice', notice });
    }
    setShowAll() {
        // Not available online: it would show the cards of the other players
    }
    snapshot() {
        return {
            v: 1,
            code: this.code,
            seats: this.seats.map(s => ({ name: s.name, token: s.token, color: s.color })),
            settings: this.settings,
            game: this.game ? this.game.snapshot() : null,
        };
    }
    /**
     *  The page goes away (closed, reloaded, discarded): the connections drop but the game is not over,
     *  the players keep trying to reconnect until this page (or its reload) reopens the room
     */
    suspend() {
        if (this.closed)
            return;
        this.persist();
        for (const seat of this.seats) {
            const connection = seat.connection;
            seat.connection = null;
            connection?.close();
        }
        this.transport.suspend();
    }
    /**
     *  The page is visible again: reopen the room if needed, and give everybody time to answer
     *  (their connections may have been frozen together with this page)
     */
    resume() {
        if (this.closed)
            return;
        this.transport.resume();
        this.forgiveSilence();
    }
    /**
     *  End of the game for everybody (the host left on purpose)
     */
    close() {
        if (this.closed)
            return;
        this.closed = true;
        clearInterval(this.heartbeat);
        this.unsubscribeGame?.();
        for (const seat of this.seats) {
            this.send(seat, { t: 'ended', reason: 'L\'hôte a quitté la partie.' });
            seat.connection?.close();
        }
        this.transport.close();
    }
    // endregion
    // region Connections
    isConnected(seatIndex) {
        return seatIndex === 0 || !!this.seats[seatIndex]?.connection;
    }
    accept(connection) {
        let seat = null;
        const helloTimer = setTimeout(() => {
            if (!seat)
                connection.close();
        }, 10000);
        connection.onMessage(raw => {
            const message = raw;
            if (!message || typeof message !== 'object')
                return;
            if (!seat) {
                if (message.t !== 'hello')
                    return;
                clearTimeout(helloTimer);
                seat = this.hello(connection, message);
                return;
            }
            if (seat.connection !== connection)
                return;
            seat.lastSeen = Date.now();
            if (message.t === 'action' && message.action && typeof message.action === 'object') {
                const index = this.seats.indexOf(seat);
                const notice = this.run({ ...message.action, playerId: index }, false);
                if (notice)
                    this.send(seat, { t: 'notice', notice });
            }
        });
        connection.onClose(() => {
            clearTimeout(helloTimer);
            if (seat && seat.connection === connection)
                this.disconnected(seat);
        });
    }
    hello(connection, hello) {
        const refuse = (reason) => {
            connection.send({ t: 'refused', reason });
            setTimeout(() => connection.close(), 200);
            return null;
        };
        if (hello.v !== PROTOCOL_VERSION)
            return refuse('Version du jeu différente : rechargez la page.');
        if (typeof hello.token !== 'string' || hello.token.length < 8)
            return refuse('Connexion invalide.');
        let seat = this.seats.find((s, i) => i > 0 && s.token === hello.token);
        if (seat) {
            // Same player coming back (page reloaded, phone woke up...)
            const previous = seat.connection;
            seat.connection = connection;
            if (previous && previous !== connection)
                previous.close();
        }
        else {
            if (this.game)
                return refuse('La partie a déjà commencé.');
            if (this.seats.length >= MAX_PLAYERS)
                return refuse('La partie est complète (10 joueurs).');
            const wanted = isPlayerColor(hello.color) && !this.seats.some(s => s.color === hello.color) ? hello.color : null;
            const color = wanted ?? assignColors([...this.seats.map(s => s.color), null])[this.seats.length];
            seat = { name: this.uniqueName(cleanName(hello.name, `Joueur ${this.seats.length + 1}`)), color, token: hello.token, connection, lastSeen: 0 };
            this.seats.push(seat);
        }
        seat.lastSeen = Date.now();
        this.send(seat, { t: 'welcome', seat: this.seats.indexOf(seat) });
        if (this.game)
            this.broadcastState();
        else
            this.broadcastLobby();
        return seat;
    }
    uniqueName(name) {
        let candidate = name;
        for (let n = 2; this.seats.some(s => s.name === candidate); n++)
            candidate = `${name} ${n}`;
        return candidate;
    }
    disconnected(seat) {
        seat.connection = null;
        if (!this.game) {
            // Before the game, a player who leaves frees his seat
            this.seats.splice(this.seats.indexOf(seat), 1);
            this.broadcastLobby();
        }
        else {
            this.broadcastState();
        }
    }
    forgiveSilence() {
        const now = Date.now();
        this.lastTick = now;
        for (const seat of this.seats)
            seat.lastSeen = now;
    }
    /**
     *  Heartbeat: detect players who vanished without closing the connection.
     *  If this page itself was asleep (phone locked, browser in the background), the players were
     *  not silent: we were. Give them a fresh delay instead of dropping everybody.
     */
    tick() {
        const now = Date.now();
        const slept = now - this.lastTick > this.heartbeatMs * 2.5;
        this.lastTick = now;
        if (slept) {
            this.forgiveSilence();
            this.transport.resume();
        }
        for (const seat of this.seats) {
            if (!seat.connection)
                continue;
            if (now - seat.lastSeen > this.timeoutMs) {
                const connection = seat.connection;
                this.disconnected(seat);
                connection.close();
            }
            else {
                this.send(seat, { t: 'ping' });
            }
        }
    }
    // endregion
    // region Game
    attach(game) {
        this.game = game;
        this.unsubscribeGame = game.on(event => {
            if (event.type === 'change') {
                this.broadcastState();
                return;
            }
            const card = findHandCard(game, event.cardId);
            if (!card)
                return;
            const message = { t: 'reveal', card: faceUp(card) };
            this.seats.forEach((seat, i) => {
                if (!event.public && i !== event.playerId)
                    return;
                if (i === 0)
                    this.events.emit({ type: 'reveal', card: message.card });
                else
                    this.send(seat, message);
            });
        });
    }
    run(action, fromHost) {
        if (!this.game)
            return { text: 'La partie n\'a pas commencé.', kind: 'error' };
        if (action.type === 'nextRound' && !fromHost)
            return { text: 'Seul l\'hôte lance la ronde suivante.', kind: 'error' };
        try {
            return applyAction(this.game, action);
        }
        catch (e) {
            if (e instanceof RuleError)
                return { text: e.message, kind: 'error' };
            console.error('Invalid action', action, e);
            return { text: 'Action invalide.', kind: 'error' };
        }
    }
    send(seat, message) {
        seat.connection?.send(message);
    }
    persist() {
        if (!this.persistTo || this.closed)
            return;
        try {
            this.persistTo(this.snapshot());
        }
        catch (e) {
            console.warn('Dutch: the game could not be saved', e);
        }
    }
    broadcastLobby() {
        const lobby = this.lobby;
        this.seats.forEach((seat, i) => this.send(seat, { t: 'lobby', lobby, you: i }));
        this.persist();
        this.events.emit({ type: 'lobby' });
    }
    broadcastState() {
        const game = this.game;
        if (!game)
            return;
        const connected = (i) => this.isConnected(i);
        this.seats.forEach((seat, i) => {
            if (i === 0)
                this.state = buildView(game, 0, { connected });
            else
                this.send(seat, { t: 'state', state: buildView(game, i, { connected }) });
        });
        this.persist();
        this.events.emit({ type: 'state' });
    }
}
