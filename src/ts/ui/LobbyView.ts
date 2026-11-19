import {LobbyState} from '../net/Protocol.js';
import {checkSettings, colorName, describeSettings, GameSettings} from '../Settings.js';
import {ChatBox} from './ChatBox.js';
import {gameOptions, loadSetup, saveSetup} from './SetupView.js';
import {t} from '../i18n.js';
import {clear, el} from './dom.js';

export interface LobbyProps {
    lobby: LobbyState;
    you: number;
    isHost: boolean;
    link: string;
    error?: string;
    /** Chat of the room (kept from one drawing of the lobby to the next) */
    chat?: ChatBox;
    /** Host: the rules changed (shown to everybody right away) */
    onSettings?(settings: GameSettings): void;
    onStart?(settings: GameSettings): void;
    onLeave(): void;
}

/**
 *  Waiting room of an online game: code and link to share, players, rules (chosen by the host, seen by all)
 */
export function renderLobby(root: HTMLElement, props: LobbyProps) {
    // The lobby is drawn again when a player arrives or the rules change: keep the focused field
    const focusedId = root.contains(document.activeElement) ? document.activeElement?.id : undefined;
    clear(root);
    const {lobby, isHost} = props;
    const options = gameOptions(lobby.settings, () => {
        const settings = options.read();
        // Remembered as the rules of the next game created on this device
        const setup = loadSetup();
        setup.settings = settings;
        saveSetup(setup);
        props.onSettings?.(settings);
    });

    const copy = async (button: HTMLButtonElement) => {
        const shareData = {title: 'Dutch', text: t('Rejoins ma partie de Dutch (code {code})', {code: lobby.code}), url: props.link};
        try {
            if (navigator.share && matchMedia('(pointer: coarse)').matches) {
                await navigator.share(shareData);
                return;
            }
            await navigator.clipboard.writeText(props.link);
            button.textContent = t('Lien copié ✓');
        } catch {
            // Clipboard refused: select the link so it can be copied by hand
            const input = root.querySelector<HTMLInputElement>('#room-link');
            input?.select();
        }
    };

    const players = el('ol', {class: 'lobby-players'},
        ...lobby.players.map((p, i) => el('li', {class: p.connected ? '' : 'offline'},
            el('span', {class: 'color-dot', style: {background: p.color}, role: 'img', 'aria-label': colorName(p.color)}),
            p.name,
            i === 0 ? el('span', {class: 'badge turn'}, t('Hôte')) : null,
            i === props.you ? el('span', {class: 'badge you'}, t('Vous')) : null)));

    const enough = lobby.players.length >= 2;
    const problem = checkSettings(lobby.players.length, lobby.settings);
    const startButton = el('button', {
        id: 'start-online', class: 'primary', disabled: !enough || !!problem,
        onclick: () => props.onStart?.(options.read()),
    }, enough ? t('Distribuer les cartes ({n} joueurs)', {n: lobby.players.length}) : t('En attente d\'un autre joueur…'));

    const copyButton = el('button', {class: 'secondary', id: 'copy-link'}, t('Partager le lien'));
    copyButton.addEventListener('click', () => copy(copyButton));

    const rules = isHost
        ? options.element
        : el('section', {class: 'rules', 'aria-labelledby': 'rules-title'},
            el('h3', {id: 'rules-title'}, t('Règles de la partie')),
            el('ul', {}, ...describeSettings(lobby.settings).map(line => el('li', {}, line))));

    root.appendChild(el('section', {class: 'lobby panel'},
        el('h2', {}, t('Salle d\'attente')),
        el('div', {class: 'room-code'},
            el('span', {class: 'hint'}, t('Code de la partie')),
            el('strong', {id: 'lobby-code'}, lobby.code)),
        el('div', {class: 'share'},
            el('input', {type: 'text', id: 'room-link', readonly: true, value: props.link, 'aria-label': t('Lien de la partie')}),
            copyButton),
        el('h3', {}, t('Joueurs ({n}/10)', {n: lobby.players.length})),
        players,
        props.chat?.element ?? null,
        rules,
        isHost && problem ? el('p', {class: 'message error', role: 'alert'}, problem) : null,
        props.error ? el('p', {class: 'message error', role: 'alert'}, props.error) : null,
        isHost
            ? startButton
            : el('p', {class: 'hint waiting'}, t('En attente de {name} pour commencer…', {name: lobby.players[0]?.name ?? t('l\'hôte')})),
        el('button', {class: 'secondary', id: 'leave', onclick: props.onLeave}, t('Quitter'))));

    props.chat?.scrollToEnd();
    if (focusedId) document.getElementById(focusedId)?.focus();
}
