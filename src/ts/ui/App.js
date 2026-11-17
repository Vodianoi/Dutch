import Dutch, { RuleError } from '../Dutch.js';
import { LocalSession } from '../Session.js';
import { BroadcastTransport } from '../net/BroadcastTransport.js';
import { Client } from '../net/Client.js';
import { Host } from '../net/Host.js';
import { PeerTransport } from '../net/PeerTransport.js';
import { randomToken } from '../net/Protocol.js';
import GameView from './GameView.js';
import { renderLobby } from './LobbyView.js';
import { renderSetup } from './SetupView.js';
import { clear, el } from './dom.js';
/**
 *  Screens and sessions: home, local game, online lobby and game, connection lost
 */
export class App {
    constructor(root) {
        this.view = null;
        this.session = null;
        this.cleanup = [];
        /** Dialog shown above the game (outside of the root re-rendered by the game) */
        this.dialog = null;
        this.root = root;
        const params = new URLSearchParams(location.search);
        this.debug = params.has('debug');
        this.localTransport = params.get('transport') === 'local';
        this.transport = this.localTransport ? new BroadcastTransport() : new PeerTransport();
        window.addEventListener('beforeunload', e => {
            if (this.session instanceof Host && this.session.started) {
                // Closing the host's page ends the game for everybody
                e.preventDefault();
                e.returnValue = '';
            }
        });
        // Tell the other devices right away when this page goes away
        window.addEventListener('pagehide', () => {
            if (this.session instanceof Host)
                this.session.close();
            if (this.session instanceof Client)
                this.session.leave();
        });
    }
    start() {
        const code = new URLSearchParams(location.search).get('room');
        if (code) {
            const name = this.savedName();
            const token = this.storedToken(code);
            // Page reloaded during a game: join again automatically
            if (name && token) {
                this.join(code, name);
                return;
            }
        }
        this.home({ code: code ?? undefined });
    }
    // region Home
    home(initial = {}) {
        this.reset();
        this.setRoomInUrl(initial.code ?? null);
        renderSetup(this.root, {
            onLocal: options => this.playLocal(options),
            onHost: name => this.host(name),
            onJoin: (code, name) => this.join(code, name),
        }, initial);
    }
    reset() {
        this.cleanup.forEach(fn => fn());
        this.cleanup = [];
        this.dialog?.remove();
        this.dialog = null;
        this.view?.destroy();
        this.view = null;
        if (this.session instanceof Host)
            this.session.close();
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
    async host(name) {
        this.home({ busy: 'Création de la partie…' });
        let host;
        try {
            host = new Host(await this.transport.host(), name);
        }
        catch (e) {
            this.home({ error: e.message });
            return;
        }
        this.reset();
        this.session = host;
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
                onLeave: () => this.home(),
            });
        };
        this.cleanup.push(host.on(event => {
            if (event.type === 'lobby') {
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
        lobby();
    }
    // endregion
    // region Online: player
    async join(code, name) {
        this.home({ busy: `Connexion à la partie ${code}…`, code });
        const token = this.storedToken(code) ?? randomToken();
        let client;
        try {
            client = await Client.join(this.transport, code, name, token);
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
            if (event.type === 'closed')
                this.connectionLost(code, name, event.reason);
        }));
        update();
    }
    connectionLost(code, name, reason) {
        this.dialog?.remove();
        this.dialog = el('div', { class: 'overlay lost' }, el('section', { class: 'result panel', role: 'dialog', 'aria-modal': 'true' }, el('h2', {}, 'Connexion perdue'), el('p', {}, reason), el('p', { class: 'hint' }, 'Si la partie continue chez l\'hôte, vous retrouverez votre place et vos cartes.'), el('button', { class: 'primary', id: 'reconnect', onclick: () => this.join(code, name) }, 'Se reconnecter'), el('button', { class: 'secondary', onclick: () => {
                this.forgetToken(code);
                this.home();
            } }, 'Retour à l\'accueil')));
        document.body.appendChild(this.dialog);
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
    storedToken(code) {
        try {
            return sessionStorage.getItem(`dutch-token-${code}`);
        }
        catch {
            return null;
        }
    }
    storeToken(code, token) {
        try {
            sessionStorage.setItem(`dutch-token-${code}`, token);
        }
        catch {
            // ignore: reconnecting will just need a new seat
        }
    }
    forgetToken(code) {
        try {
            sessionStorage.removeItem(`dutch-token-${code}`);
        }
        catch {
            // ignore
        }
    }
}
