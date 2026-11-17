import Dutch, {DutchOptions, RuleError} from '../Dutch.js';
import {LocalSession, Session} from '../Session.js';
import {BroadcastTransport} from '../net/BroadcastTransport.js';
import {Client} from '../net/Client.js';
import {Host} from '../net/Host.js';
import {PeerTransport} from '../net/PeerTransport.js';
import {randomToken} from '../net/Protocol.js';
import {TransportFactory} from '../net/Transport.js';
import GameView from './GameView.js';
import {renderLobby} from './LobbyView.js';
import {renderSetup, SetupInitial} from './SetupView.js';
import {clear, el} from './dom.js';

/**
 *  Screens and sessions: home, local game, online lobby and game, connection lost
 */
export class App {
    private readonly root: HTMLElement;
    private readonly debug: boolean;
    /** `?transport=local` plays between tabs of this browser (development) */
    private readonly localTransport: boolean;
    private readonly transport: TransportFactory;

    private view: GameView | null = null;
    private session: Session | null = null;
    private cleanup: (() => void)[] = [];
    /** Dialog shown above the game (outside of the root re-rendered by the game) */
    private dialog: HTMLElement | null = null;

    constructor(root: HTMLElement) {
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
            if (this.session instanceof Host) this.session.close();
            if (this.session instanceof Client) this.session.leave();
        });
    }

    public start() {
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
        this.home({code: code ?? undefined});
    }

    // region Home
    private home(initial: SetupInitial = {}) {
        this.reset();
        this.setRoomInUrl(initial.code ?? null);
        renderSetup(this.root, {
            onLocal: options => this.playLocal(options),
            onHost: name => this.host(name),
            onJoin: (code, name) => this.join(code, name),
        }, initial);
    }

    private reset() {
        this.cleanup.forEach(fn => fn());
        this.cleanup = [];
        this.dialog?.remove();
        this.dialog = null;
        this.view?.destroy();
        this.view = null;
        if (this.session instanceof Host) this.session.close();
        if (this.session instanceof Client) this.session.leave();
        this.session = null;
        clear(this.root);
    }

    private savedName(): string {
        try {
            return JSON.parse(localStorage.getItem('dutch-setup') ?? '{}').onlineName ?? '';
        } catch {
            return '';
        }
    }
    // endregion

    // region Local game
    private playLocal(options: DutchOptions) {
        this.reset();
        const game = new Dutch(options);
        const session = new LocalSession(game);
        this.session = session;
        this.showGame(session, () => this.home());
        game.startRound();
        // Handy in the console while developing
        (window as unknown as { dutch: Dutch }).dutch = game;
    }
    // endregion

    // region Online: host
    private async host(name: string) {
        this.home({busy: 'Création de la partie…'});
        let host: Host;
        try {
            host = new Host(await this.transport.host(), name);
        } catch (e) {
            this.home({error: (e as Error).message});
            return;
        }
        this.reset();
        this.session = host;
        let lobbyError: string | undefined;
        const lobby = () => {
            if (host.started) return;
            renderLobby(this.root, {
                lobby: host.lobby, you: 0, isHost: true, link: this.link(host.code), error: lobbyError,
                onStart: options => {
                    try {
                        host.start(options);
                    } catch (e) {
                        if (!(e instanceof RuleError)) throw e;
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
                    if (!this.view) this.showGame(host, () => host.newGame());
                } else {
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
    private async join(code: string, name: string) {
        this.home({busy: `Connexion à la partie ${code}…`, code});
        const token = this.storedToken(code) ?? randomToken();
        let client: Client;
        try {
            client = await Client.join(this.transport, code, name, token);
        } catch (e) {
            this.forgetToken(code);
            this.home({code, error: (e as Error).message});
            return;
        }
        this.storeToken(code, token);
        this.reset();
        this.session = client;
        this.setRoomInUrl(code);

        const update = () => {
            if (client.state) {
                if (!this.view) this.showGame(client, () => undefined);
            } else if (client.lobby) {
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
            if (event.type === 'lobby' || event.type === 'state') update();
            if (event.type === 'closed') this.connectionLost(code, name, event.reason);
        }));
        update();
    }

    private connectionLost(code: string, name: string, reason: string) {
        this.dialog?.remove();
        this.dialog = el('div', {class: 'overlay lost'},
            el('section', {class: 'result panel', role: 'dialog', 'aria-modal': 'true'},
                el('h2', {}, 'Connexion perdue'),
                el('p', {}, reason),
                el('p', {class: 'hint'}, 'Si la partie continue chez l\'hôte, vous retrouverez votre place et vos cartes.'),
                el('button', {class: 'primary', id: 'reconnect', onclick: () => this.join(code, name)}, 'Se reconnecter'),
                el('button', {class: 'secondary', onclick: () => {
                    this.forgetToken(code);
                    this.home();
                }}, 'Retour à l\'accueil')));
        document.body.appendChild(this.dialog);
    }
    // endregion

    // region Helpers
    private showGame(session: Session, onNewGame: () => void) {
        this.view?.destroy();
        this.view = new GameView(this.root, session, onNewGame, this.debug);
        this.view.render();
    }

    private link(code: string): string {
        const url = new URL(location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('room', code);
        if (this.localTransport) url.searchParams.set('transport', 'local');
        return url.toString();
    }

    private setRoomInUrl(code: string | null) {
        const url = new URL(location.href);
        if (code) url.searchParams.set('room', code);
        else url.searchParams.delete('room');
        history.replaceState(null, '', url);
    }

    private storedToken(code: string): string | null {
        try {
            return sessionStorage.getItem(`dutch-token-${code}`);
        } catch {
            return null;
        }
    }

    private storeToken(code: string, token: string) {
        try {
            sessionStorage.setItem(`dutch-token-${code}`, token);
        } catch {
            // ignore: reconnecting will just need a new seat
        }
    }

    private forgetToken(code: string) {
        try {
            sessionStorage.removeItem(`dutch-token-${code}`);
        } catch {
            // ignore
        }
    }
    // endregion
}
