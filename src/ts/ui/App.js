import Dutch, { RuleError } from '../Dutch.js';
import { LocalSession } from '../Session.js';
import { BroadcastTransport } from '../net/BroadcastTransport.js';
import { Client } from '../net/Client.js';
import { Host } from '../net/Host.js';
import { PeerTransport } from '../net/PeerTransport.js';
import { randomToken } from '../net/Protocol.js';
import GameView from './GameView.js';
import { renderLobby } from './LobbyView.js';
import { loadSetup, renderSetup } from './SetupView.js';
import { clear, el } from './dom.js';
const HOST_KEY = 'dutch-host';
/** Which room this tab hosts: a reload of this tab reopens it */
const HOST_TAB_KEY = 'dutch-host-room';
/** A saved room is offered back for this long */
const HOST_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/**
 *  Screens and sessions: home, local game, online lobby and game, connection lost.
 *
 *  Online games survive phones: leaving the page or locking the screen doesn't end the game.
 *  - The host saves the room after every change; reloading (or reopening) the page reopens it with the same code
 *  - Players reconnect on their own and get their seat back (their token is kept on the device)
 */
export class App {
    constructor(root) {
        this.view = null;
        this.session = null;
        this.cleanup = [];
        /** Dialog shown above the game (outside of the root re-rendered by the game) */
        this.dialog = null;
        /** "Reconnexion…" banner of an online player */
        this.banner = null;
        this.root = root;
        const params = new URLSearchParams(location.search);
        this.debug = params.has('debug');
        this.localTransport = params.get('transport') === 'local';
        this.transport = this.localTransport ? new BroadcastTransport() : new PeerTransport();
        window.addEventListener('beforeunload', e => {
            if (this.session instanceof Host && this.session.started) {
                // The game is saved, but the other players wait for this page to come back
                e.preventDefault();
                e.returnValue = '';
            }
        });
        // Leaving the page doesn't end the game: the connections drop, the game waits for the page to come back
        window.addEventListener('pagehide', () => {
            if (this.session instanceof Host || this.session instanceof Client)
                this.session.suspend();
        });
        window.addEventListener('pageshow', e => {
            if (e.persisted)
                this.resumeSession();
        });
        // Screen unlocked, browser back in the foreground: check the connections right away
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible')
                this.resumeSession();
        });
        window.addEventListener('online', () => this.resumeSession());
    }
    start() {
        const code = new URLSearchParams(location.search).get('room');
        if (code) {
            // This device hosts this room: reopen it (page reloaded, tab discarded by the phone…)
            const saved = this.savedHost(code);
            if (saved) {
                this.resumeHost(saved);
                return;
            }
            const name = this.savedName();
            const token = this.storedToken(code);
            // Page reloaded or link opened again during a game: join again automatically
            if (name && token) {
                this.join(code, name);
                return;
            }
        }
        this.home({ code: code ?? undefined });
    }
    resumeSession() {
        if (this.session instanceof Host || this.session instanceof Client)
            this.session.resume();
    }
    // region Home
    home(initial = {}) {
        this.reset();
        this.setRoomInUrl(initial.code ?? null);
        const saved = this.savedHost();
        if (saved && !initial.busy) {
            initial = {
                ...initial,
                resume: {
                    code: saved.snapshot.code,
                    players: saved.snapshot.seats.map(s => s.name),
                    started: !!saved.snapshot.game,
                },
            };
        }
        renderSetup(this.root, {
            onLocal: options => this.playLocal(options),
            onHost: (name, color, settings) => this.host(name, color, settings),
            onJoin: (code, name) => this.join(code, name),
            onResume: () => {
                const again = this.savedHost();
                if (again)
                    this.resumeHost(again);
            },
            onForget: () => {
                this.forgetHost();
                this.home();
            },
        }, initial);
    }
    reset() {
        this.cleanup.forEach(fn => fn());
        this.cleanup = [];
        this.dialog?.remove();
        this.dialog = null;
        this.showBanner(false);
        this.root.removeAttribute('inert');
        this.view?.destroy();
        this.view = null;
        if (this.session instanceof Host) {
            // Leaving the room from the app: the game is over for everybody
            this.session.close();
            this.forgetHost();
        }
        if (this.session instanceof Client)
            this.session.leave();
        this.session = null;
        clear(this.root);
    }
    savedName() {
        try {
            return JSON.parse(localStorage.getItem('dutch-setup') ?? '{}').onlineName ?? '';
        }
        catch {
            return '';
        }
    }
    // endregion
    // region Local game
    playLocal(options) {
        this.reset();
        const game = new Dutch(options);
        const session = new LocalSession(game);
        this.session = session;
        this.showGame(session, () => this.home());
        game.startRound();
        // Handy in the console while developing
        window.dutch = game;
    }
    // endregion
    // region Online: host
    async host(name, color, settings) {
        this.home({ busy: 'Création de la partie…' });
        let host;
        try {
            const transport = await this.transport.host();
            host = new Host(transport, name, { color, settings, persist: snapshot => this.saveHost(name, snapshot) });
        }
        catch (e) {
            this.home({ error: e.message });
            return;
        }
        this.runHost(host);
    }
    /**
     *  Reopen a saved room with the same code: the players reconnect on their own
     */
    async resumeHost(saved) {
        const code = saved.snapshot.code;
        this.home({ busy: `Reprise de la partie ${code}…`, code });
        let host;
        try {
            const transport = await this.transport.host(code);
            host = new Host(transport, saved.name, { restore: saved.snapshot, persist: snapshot => this.saveHost(saved.name, snapshot) });
        }
        catch (e) {
            this.home({ error: `Impossible de reprendre la partie ${code} : ${e.message}` });
            return;
        }
        this.runHost(host);
    }
    runHost(host) {
        this.reset();
        this.session = host;
        this.setRoomInUrl(host.code);
        this.markHostTab(host.code);
        let lobbyError;
        const lobby = () => {
            if (host.started)
                return;
            renderLobby(this.root, {
                lobby: host.lobby, you: 0, isHost: true, link: this.link(host.code), error: lobbyError,
                onStart: options => {
                    try {
                        host.start(options);
                    }
                    catch (e) {
                        if (!(e instanceof RuleError))
                            throw e;
                        lobbyError = e.message;
                        lobby();
                    }
                },
                onSettings: settings => host.setSettings(settings),
                onLeave: () => this.home(),
            });
        };
        this.cleanup.push(host.on(event => {
            if (event.type === 'lobby' || event.type === 'state') {
                if (host.started) {
                    if (!this.view)
                        this.showGame(host, () => host.newGame());
                }
                else {
                    this.view?.destroy();
                    this.view = null;
                    lobby();
                }
            }
        }));
        if (host.started)
            this.showGame(host, () => host.newGame());
        else
            lobby();
    }
    // endregion
    // region Online: player
    async join(code, name) {
        this.home({ busy: `Connexion à la partie ${code}…`, code });
        const token = this.storedToken(code) ?? randomToken();
        let client;
        try {
            // The colour chosen on the home screen (the host gives another one if it is taken)
            client = await Client.join(this.transport, code, name, token, { color: loadSetup().onlineColor });
        }
        catch (e) {
            this.forgetToken(code);
            this.home({ code, error: e.message });
            return;
        }
        this.storeToken(code, token);
        this.reset();
        this.session = client;
        this.setRoomInUrl(code);
        const update = () => {
            if (client.state) {
                if (!this.view)
                    this.showGame(client, () => undefined);
            }
            else if (client.lobby) {
                this.view?.destroy();
                this.view = null;
                renderLobby(this.root, {
                    lobby: client.lobby, you: client.seat, isHost: false, link: this.link(code),
                    onLeave: () => {
                        this.forgetToken(code);
                        this.home();
                    },
                });
            }
        };
        this.cleanup.push(client.on(event => {
            if (event.type === 'lobby' || event.type === 'state')
                update();
            if (event.type === 'connection')
                this.showBanner(event.status === 'reconnecting', () => {
                    this.forgetToken(code);
                    this.home();
                });
            if (event.type === 'closed')
                this.connectionLost(code, name, event.reason);
        }));
        update();
    }
    /**
     *  Banner while an online player reconnects: the game stays on screen, actions wait
     */
    showBanner(show, onQuit) {
        if (!show) {
            this.banner?.remove();
            this.banner = null;
            return;
        }
        if (this.banner)
            return;
        this.banner = el('div', { class: 'net-banner', role: 'status' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), el('span', {}, el('strong', {}, 'Reconnexion… '), 'La partie reprend dès que l\'hôte est là.'), onQuit ? el('button', { class: 'secondary', onclick: onQuit }, 'Quitter') : null);
        document.body.appendChild(this.banner);
    }
    connectionLost(code, name, reason) {
        this.showBanner(false);
        this.dialog?.remove();
        this.dialog = el('div', { class: 'overlay lost' }, el('section', { class: 'result panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lost-title' }, el('h2', { id: 'lost-title' }, 'Partie interrompue'), el('p', {}, reason), el('button', { class: 'primary', id: 'reconnect', onclick: () => this.join(code, name) }, 'Réessayer'), el('button', { class: 'secondary', onclick: () => {
                this.forgetToken(code);
                this.home();
            } }, 'Retour à l\'accueil')));
        document.body.appendChild(this.dialog);
        // The game behind the dialog can not be used anymore
        this.root.setAttribute('inert', '');
        this.dialog.querySelector('#reconnect')?.focus();
    }
    // endregion
    // region Helpers
    showGame(session, onNewGame) {
        this.view?.destroy();
        this.view = new GameView(this.root, session, onNewGame, this.debug);
        this.view.render();
    }
    link(code) {
        const url = new URL(location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('room', code);
        if (this.localTransport)
            url.searchParams.set('transport', 'local');
        return url.toString();
    }
    setRoomInUrl(code) {
        const url = new URL(location.href);
        if (code)
            url.searchParams.set('room', code);
        else
            url.searchParams.delete('room');
        history.replaceState(null, '', url);
    }
    // endregion
    // region Storage
    /**
     *  Room hosted by this device (for `code` if given), if recent enough.
     *  Between tabs of one browser (?transport=local), only the tab that created the room reopens it.
     */
    savedHost(code) {
        try {
            const saved = JSON.parse(localStorage.getItem(HOST_KEY) ?? 'null');
            if (!saved?.snapshot || saved.snapshot.v !== 1)
                return null;
            if (Date.now() - saved.savedAt > HOST_MAX_AGE_MS)
                return null;
            if (code && saved.snapshot.code !== code)
                return null;
            if (this.localTransport && sessionStorage.getItem(HOST_TAB_KEY) !== saved.snapshot.code)
                return null;
            return saved;
        }
        catch {
            return null;
        }
    }
    saveHost(name, snapshot) {
        try {
            localStorage.setItem(HOST_KEY, JSON.stringify({ savedAt: Date.now(), name, snapshot }));
        }
        catch {
            // Storage full or refused: the game goes on, it just can't be reopened
        }
    }
    forgetHost() {
        try {
            localStorage.removeItem(HOST_KEY);
            sessionStorage.removeItem(HOST_TAB_KEY);
        }
        catch {
            // ignore
        }
    }
    markHostTab(code) {
        try {
            sessionStorage.setItem(HOST_TAB_KEY, code);
        }
        catch {
            // ignore
        }
    }
    /**
     *  The token gives a player his seat back. It is kept for the tab (sessionStorage) and for the
     *  device (localStorage, so that opening the link again in a new tab works), except between tabs
     *  of one browser in development where each tab is a different player.
     */
    storedToken(code) {
        try {
            return sessionStorage.getItem(`dutch-token-${code}`)
                ?? (this.localTransport ? null : localStorage.getItem(`dutch-token-${code}`));
        }
        catch {
            return null;
        }
    }
    storeToken(code, token) {
        try {
            sessionStorage.setItem(`dutch-token-${code}`, token);
            if (!this.localTransport)
                localStorage.setItem(`dutch-token-${code}`, token);
        }
        catch {
            // ignore: reconnecting will just need a new seat
        }
    }
    forgetToken(code) {
        try {
            sessionStorage.removeItem(`dutch-token-${code}`);
            localStorage.removeItem(`dutch-token-${code}`);
        }
        catch {
            // ignore
        }
    }
}
