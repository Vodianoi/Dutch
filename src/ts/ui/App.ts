import {findPublicGames} from '../net/PublicGames.js';
import {IS_DEV, scoped, TABLE_3D, TEST_VERSION} from '../env.js';
import {render, t} from '../i18n.js';
import Dutch, {DutchOptions, DutchSnapshot, RuleError} from '../Dutch.js';
import {LocalSession, Session} from '../Session.js';
import {SoloSession} from '../SoloSession.js';
import {TableOptions, TableView} from '../table/TableView.js';
import {BOT_PACES, loadPrefs, savePrefs} from '../table/prefs.js';
import {applyTheme} from '../table/themes.js';
import {BroadcastTransport} from '../net/BroadcastTransport.js';
import {Client} from '../net/Client.js';
import {Host, HostSnapshot} from '../net/Host.js';
import {PeerTransport} from '../net/PeerTransport.js';
import {randomToken} from '../net/Protocol.js';
import {PUBLIC_CODES, TransportFactory} from '../net/Transport.js';
import GameView from './GameView.js';
import {ChatBox} from './ChatBox.js';
import {renderLobby} from './LobbyView.js';
import {GameSettings} from '../Settings.js';
import {loadSetup, renderSetup, SetupInitial} from './SetupView.js';
import {clear, el} from './dom.js';
import {renderHero} from './hero.js';

/** Room hosted by this device, saved after every change */
interface SavedHost {
    savedAt: number;
    name: string;
    snapshot: HostSnapshot;
}

const HOST_KEY = scoped('host');
/** Solo game in progress, saved after every change */
const SOLO_KEY = scoped('solo');
/** Which room this tab hosts: a reload of this tab reopens it */
const HOST_TAB_KEY = scoped('host-room');
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
    private readonly root: HTMLElement;
    private readonly debug: boolean;
    /** `?transport=local` plays between tabs of this browser (development) */
    private readonly localTransport: boolean;
    private readonly transport: TransportFactory;

    private view: { render(): void; destroy(): void } | null = null;
    /** Chat of the online game (waiting room, then game) */
    private chatBox: ChatBox | null = null;
    /** `?classic`: the previous game screen (HTML), kept while the new table is being tested */
    private readonly classic: boolean;
    private session: Session | null = null;
    private cleanup: (() => void)[] = [];
    /** Dialog shown above the game (outside of the root re-rendered by the game) */
    private dialog: HTMLElement | null = null;
    /** "Reconnexion…" banner of an online player */
    private banner: HTMLElement | null = null;

    constructor(root: HTMLElement) {
        this.root = root;
        if (IS_DEV) {
            // The test version must never be taken for the real one
            document.title = t('Dutch (version de test)');
            (document.querySelector('.brand') ?? document.querySelector('.site-header'))?.appendChild(
                el('span', {class: 'dev-badge', title: t('Les parties sont séparées de celles du vrai site')},
                    TEST_VERSION === 'new-look' ? t('Aperçu du nouveau look') : TEST_VERSION === '3d' ? t('Aperçu de la table en 3D') : t('Version de test')));
        }
        // The look chosen on this device, before anything is drawn with it
        applyTheme(loadPrefs().theme);
        renderHero();
        const params = new URLSearchParams(location.search);
        this.debug = params.has('debug');
        this.classic = params.has('classic');
        // `?table=3d` / `?table=2d`: choose the table of this device (kept in its settings), test version only
        const table = params.get('table');
        if (TABLE_3D && (table === '3d' || table === '2d')) {
            const prefs = loadPrefs();
            prefs.table = table;
            savePrefs(prefs);
        }
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
            if (this.session instanceof Host || this.session instanceof Client) this.session.suspend();
        });
        window.addEventListener('pageshow', e => {
            if (e.persisted) this.resumeSession();
        });
        // Screen unlocked, browser back in the foreground: check the connections right away
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.resumeSession();
        });
        window.addEventListener('online', () => this.resumeSession());
    }

    public start() {
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
        this.home({code: code ?? undefined});
    }

    private resumeSession() {
        if (this.session instanceof Host || this.session instanceof Client) this.session.resume();
    }

    // region Home
    private home(initial: SetupInitial = {}) {
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
        const solo = this.savedSolo();
        if (solo) initial = {...initial, soloResume: {round: solo.round, players: solo.players.map(p => p.name)}};
        renderSetup(this.root, {
            onSolo: options => this.playSolo(options),
            onResumeSolo: () => {
                const again = this.savedSolo();
                if (again) this.resumeSolo(again);
            },
            onForgetSolo: () => {
                this.forgetSolo();
                this.home();
            },
            onLocal: options => this.playLocal(options),
            onHost: (name, color, settings, isPublic) => this.host(name, color, settings, isPublic),
            onFindPublic: () => findPublicGames(this.transport),
            onJoin: (code, name) => this.join(code, name),
            onResume: () => {
                const again = this.savedHost();
                if (again) this.resumeHost(again);
            },
            onForget: () => {
                this.forgetHost();
                this.home();
            },
        }, initial);
    }

    private reset() {
        this.cleanup.forEach(fn => fn());
        this.cleanup = [];
        this.dialog?.remove();
        this.dialog = null;
        this.showBanner(false);
        this.root.removeAttribute('inert');
        this.view?.destroy();
        this.view = null;
        this.chatBox?.destroy();
        this.chatBox = null;
        if (this.session instanceof Host) {
            // Leaving the room from the app: the game is over for everybody
            this.session.close();
            this.forgetHost();
        }
        if (this.session instanceof Client) this.session.leave();
        // The solo game stays saved: it can be continued from the home screen
        if (this.session instanceof SoloSession) this.session.close();
        this.session = null;
        clear(this.root);
    }

    private savedName(): string {
        try {
            return JSON.parse(localStorage.getItem(scoped('setup')) ?? '{}').onlineName ?? '';
        } catch {
            return '';
        }
    }
    // endregion

    // region Solo game
    private playSolo(options: DutchOptions) {
        this.reset();
        this.forgetSolo();
        const game = new Dutch(options);
        this.runSolo(game, options);
        game.startRound();
    }

    private resumeSolo(snapshot: DutchSnapshot) {
        this.reset();
        let game: Dutch;
        try {
            game = Dutch.restore(snapshot);
        } catch {
            this.forgetSolo();
            this.home({error: t('La partie enregistrée n\'a pas pu être reprise.')});
            return;
        }
        const options: DutchOptions = {
            players: game.players.map(p => p.name), playerColors: game.players.map(p => p.color),
            deckCount: game.deckCount, cardsPerPlayer: game.cardsPerPlayer, targetScore: game.targetScore,
            dutchPenalty: game.dutchPenalty, peekVariant: game.peekVariant, effects: game.effectsEnabled,
            protectFromJack: game.protectFromJack, protectFromAce: game.protectFromAce, queenAny: game.queenAny,
        };
        this.runSolo(game, options);
    }

    private runSolo(game: Dutch, options: DutchOptions) {
        const session = new SoloSession(game, snapshot => this.saveSolo(snapshot), {speed: BOT_PACES[loadPrefs().bots].factor});
        this.session = session;
        this.showGame(session, () => this.playSolo(options), () => this.home());
        (window as unknown as { dutch: Dutch }).dutch = game;
    }
    // endregion

    // region Local game
    private playLocal(options: DutchOptions) {
        this.reset();
        const game = new Dutch(options);
        const session = new LocalSession(game);
        this.session = session;
        this.showGame(session, () => this.home(), () => this.home());
        game.startRound();
        // Handy in the console while developing
        (window as unknown as { dutch: Dutch }).dutch = game;
    }
    // endregion

    // region Online: host
    private async host(name: string, color: string, settings: GameSettings, isPublic = false) {
        this.home({busy: t('Création de la partie…')});
        let host: Host;
        try {
            // Public game: the first free public code, so that the list finds it
            // In random order: a code freed for a moment by a host whose phone sleeps is less likely to be taken
            const transport = isPublic ? await this.transport.hostFirstFree(shuffled(PUBLIC_CODES)) : await this.transport.host();
            host = new Host(transport, name, {color, settings, persist: snapshot => this.saveHost(name, snapshot)});
        } catch (e) {
            this.home({error: errorText(e)});
            return;
        }
        this.runHost(host);
    }

    /**
     *  Reopen a saved room with the same code: the players reconnect on their own
     */
    private async resumeHost(saved: SavedHost) {
        const code = saved.snapshot.code;
        this.home({busy: t('Reprise de la partie {code}…', {code}), code});
        let host: Host;
        try {
            const transport = await this.transport.host(code);
            host = new Host(transport, saved.name, {restore: saved.snapshot, persist: snapshot => this.saveHost(saved.name, snapshot)});
        } catch (e) {
            this.home({error: t('Impossible de reprendre la partie {code} : {error}', {code, error: errorText(e)})});
            return;
        }
        this.runHost(host);
    }

    private runHost(host: Host) {
        this.reset();
        this.session = host;
        this.chatBox = new ChatBox(host.chat, host);
        this.setRoomInUrl(host.code);
        this.markHostTab(host.code);
        let lobbyError: string | undefined;
        const lobby = () => {
            if (host.started) return;
            renderLobby(this.root, {
                lobby: host.lobby, you: 0, isHost: true, link: this.link(host.code), error: lobbyError, chat: this.chatBox ?? undefined,
                onStart: options => {
                    try {
                        host.start(options);
                    } catch (e) {
                        if (!(e instanceof RuleError)) throw e;
                        lobbyError = render(e.msg);
                        lobby();
                    }
                },
                onSettings: settings => host.setSettings(settings),
                onKick: index => host.kick(index),
                onLeave: () => this.home(),
            });
        };
        this.cleanup.push(host.on(event => {
            if (event.type === 'lobby' || event.type === 'state') {
                if (host.started) {
                    if (!this.view) this.showHostGame(host);
                } else {
                    this.view?.destroy();
                    this.view = null;
                    lobby();
                }
            }
        }));
        if (host.started) this.showHostGame(host);
        else lobby();
    }
    // endregion

    // region Online: player
    private async join(code: string, name: string) {
        this.home({busy: t('Connexion à la partie {code}…', {code}), code});
        const token = this.storedToken(code) ?? randomToken();
        let client: Client;
        try {
            // The colour chosen on the home screen (the host gives another one if it is taken)
            client = await Client.join(this.transport, code, name, token, {color: loadSetup().onlineColor, room: this.storedRoom(code) ?? undefined});
        } catch (e) {
            // Removed by the host: keep the token, the room goes on refusing it
            if (!isRemoved(errorText(e))) this.forgetToken(code);
            this.home({code, error: errorText(e)});
            return;
        }
        this.storeToken(code, token, client.room);
        this.reset();
        this.session = client;
        this.chatBox = new ChatBox(client.chat, client);
        this.setRoomInUrl(code);

        const update = () => {
            if (client.state) {
                if (!this.view) this.showGame(client, () => undefined, () => {
                    this.forgetToken(code);
                    this.home();
                });
            } else if (client.lobby) {
                this.view?.destroy();
                this.view = null;
                renderLobby(this.root, {
                    lobby: client.lobby, you: client.seat, isHost: false, link: this.link(code), chat: this.chatBox ?? undefined,
                    onLeave: () => {
                        this.forgetToken(code);
                        this.home();
                    },
                });
            }
        };
        this.cleanup.push(client.on(event => {
            if (event.type === 'lobby' || event.type === 'state') update();
            if (event.type === 'connection') this.showBanner(event.status === 'reconnecting', () => {
                this.forgetToken(code);
                this.home();
            });
            if (event.type === 'closed') this.connectionLost(code, name, event.reason);
        }));
        update();
    }

    /**
     *  Banner while an online player reconnects: the game stays on screen, actions wait
     */
    private showBanner(show: boolean, onQuit?: () => void) {
        if (!show) {
            this.banner?.remove();
            this.banner = null;
            return;
        }
        if (this.banner) return;
        this.banner = el('div', {class: 'net-banner', role: 'status'},
            el('span', {class: 'spinner', 'aria-hidden': 'true'}),
            el('span', {},
                el('strong', {}, t('Reconnexion… ')),
                t('La partie reprend dès que l\'hôte est là.')),
            onQuit ? el('button', {class: 'secondary', onclick: onQuit}, t('Quitter')) : null);
        document.body.appendChild(this.banner);
    }

    private connectionLost(code: string, name: string, reason: string) {
        this.showBanner(false);
        this.dialog?.remove();
        // Removed by the host: no « try again », and his token is kept so that this room keeps refusing him
        const removed = isRemoved(reason);
        this.dialog = el('div', {class: 'overlay lost'},
            el('section', {class: 'result panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lost-title'},
                el('h2', {id: 'lost-title'}, t('Partie interrompue')),
                el('p', {}, t(reason)),
                removed ? null : el('button', {class: 'primary', id: 'reconnect', onclick: () => this.join(code, name)}, t('Réessayer')),
                el('button', {class: 'secondary', id: 'lost-home', onclick: () => {
                    if (!removed) this.forgetToken(code);
                    this.home();
                }}, t('Retour à l\'accueil'))));
        document.body.appendChild(this.dialog);
        // The game behind the dialog can not be used anymore
        this.root.setAttribute('inert', '');
        this.dialog.querySelector<HTMLElement>('#reconnect, #lost-home')?.focus();
    }
    // endregion

    // region Helpers
    private showGame(session: Session, onNewGame: () => void, onQuit: () => void, quitWarning?: string) {
        this.view?.destroy();
        this.view = null;
        if (this.classic) {
            this.view = new GameView(this.root, session, onNewGame, this.debug);
            this.view.render();
            return;
        }
        const options: TableOptions = {
            onNewGame, onQuit, quitWarning, debug: this.debug, chatBox: this.chatBox ?? undefined,
            // Other table chosen in the menu: the same game, drawn by the other table (test version only)
            onTableChange: TABLE_3D ? () => {
                if (this.session === session) this.showGame(session, onNewGame, onQuit, quitWarning);
            } : undefined,
            // Drawing lost while the page was in the background: the same game on a new table
            onRebuild: () => {
                if (this.session === session) this.showGame(session, onNewGame, onQuit, quitWarning);
            },
        };
        const flat = () => {
            this.view = new TableView(this.root, session, options);
            this.view.render();
        };
        if (!TABLE_3D || loadPrefs().table !== '3d') return flat();
        // The 3D table (Three.js) is only loaded by the devices that use it
        let cancelled = false;
        const waiting = {render: () => undefined, destroy: () => cancelled = true};
        this.view = waiting;
        import('../table3d/Table3DView.js')
            .then(module => {
                if (cancelled || this.view !== waiting) return;
                this.view = new module.Table3DView(this.root, session, options);
                this.view.render();
            })
            .catch(error => {
                // No WebGL, or the 3D files didn't load: the flat table
                console.warn('3D table unavailable', error);
                if (!cancelled && this.view === waiting) flat();
            });
    }

    private showHostGame(host: Host) {
        this.showGame(host, () => host.newGame(), () => this.home(),
            t('Vous êtes l\'hôte : si vous quittez, la partie s\'arrête pour tout le monde. Quitter quand même ?'));
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
    // endregion

    // region Storage
    /** Solo game saved on this device, if not over */
    private savedSolo(): DutchSnapshot | null {
        try {
            const saved = JSON.parse(localStorage.getItem(SOLO_KEY) ?? 'null') as DutchSnapshot | null;
            if (!saved || saved.v !== 1 || saved.phase === 'gameOver') return null;
            return saved;
        } catch {
            return null;
        }
    }

    private saveSolo(snapshot: DutchSnapshot) {
        try {
            if (snapshot.phase === 'gameOver') localStorage.removeItem(SOLO_KEY);
            else localStorage.setItem(SOLO_KEY, JSON.stringify(snapshot));
        } catch {
            // Storage full or refused: the game goes on, it just can't be continued later
        }
    }

    private forgetSolo() {
        try {
            localStorage.removeItem(SOLO_KEY);
        } catch {
            // ignore
        }
    }

    /**
     *  Room hosted by this device (for `code` if given), if recent enough.
     *  Between tabs of one browser (?transport=local), only the tab that created the room reopens it.
     */
    private savedHost(code?: string): SavedHost | null {
        try {
            const saved = JSON.parse(localStorage.getItem(HOST_KEY) ?? 'null') as SavedHost | null;
            if (!saved?.snapshot || saved.snapshot.v !== 1) return null;
            if (Date.now() - saved.savedAt > HOST_MAX_AGE_MS) return null;
            if (code && saved.snapshot.code !== code) return null;
            if (this.localTransport && sessionStorage.getItem(HOST_TAB_KEY) !== saved.snapshot.code) return null;
            return saved;
        } catch {
            return null;
        }
    }

    private saveHost(name: string, snapshot: HostSnapshot) {
        try {
            localStorage.setItem(HOST_KEY, JSON.stringify({savedAt: Date.now(), name, snapshot} satisfies SavedHost));
        } catch {
            // Storage full or refused: the game goes on, it just can't be reopened
        }
    }

    private forgetHost() {
        try {
            localStorage.removeItem(HOST_KEY);
            sessionStorage.removeItem(HOST_TAB_KEY);
        } catch {
            // ignore
        }
    }

    private markHostTab(code: string) {
        try {
            sessionStorage.setItem(HOST_TAB_KEY, code);
        } catch {
            // ignore
        }
    }

    /**
     *  The token gives a player his seat back. It is kept for the tab (sessionStorage) and for the
     *  device (localStorage, so that opening the link again in a new tab works), except between tabs
     *  of one browser in development where each tab is a different player.
     */
    private storedToken(code: string): string | null {
        try {
            return sessionStorage.getItem(scoped(`token-${code}`))
                ?? (this.localTransport ? null : localStorage.getItem(scoped(`token-${code}`)));
        } catch {
            return null;
        }
    }

    /** Id of the room joined with this code (public codes are used by one game after another) */
    private storedRoom(code: string): string | null {
        try {
            return sessionStorage.getItem(scoped(`room-${code}`))
                ?? (this.localTransport ? null : localStorage.getItem(scoped(`room-${code}`)));
        } catch {
            return null;
        }
    }

    private storeToken(code: string, token: string, room: string | null = null) {
        try {
            sessionStorage.setItem(scoped(`token-${code}`), token);
            if (!this.localTransport) localStorage.setItem(scoped(`token-${code}`), token);
            if (room) {
                sessionStorage.setItem(scoped(`room-${code}`), room);
                if (!this.localTransport) localStorage.setItem(scoped(`room-${code}`), room);
            }
        } catch {
            // ignore: reconnecting will just need a new seat
        }
    }

    private forgetToken(code: string) {
        try {
            for (const key of [`token-${code}`, `room-${code}`]) {
                sessionStorage.removeItem(scoped(key));
                localStorage.removeItem(scoped(key));
            }
        } catch {
            // ignore
        }
    }
    // endregion
}

/** An error for the player, in the language of this device */
function errorText(e: unknown): string {
    if (e instanceof RuleError) return render(e.msg);
    return t((e as Error)?.message ?? String(e));
}

function shuffled<T>(list: T[]): T[] {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/** The host removed this player from the room */
function isRemoved(reason: string): boolean {
    return reason === t('L\'hôte vous a retiré de la partie.') || reason === 'L\'hôte vous a retiré de la partie.';
}
