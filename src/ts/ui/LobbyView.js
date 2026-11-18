import { checkSettings, colorName, describeSettings } from '../Settings.js';
import { gameOptions, loadSetup, saveSetup } from './SetupView.js';
import { clear, el } from './dom.js';
/**
 *  Waiting room of an online game: code and link to share, players, rules (chosen by the host, seen by all)
 */
export function renderLobby(root, props) {
    // The lobby is drawn again when a player arrives or the rules change: keep the focused field
    const focusedId = root.contains(document.activeElement) ? document.activeElement?.id : undefined;
    clear(root);
    const { lobby, isHost } = props;
    const options = gameOptions(lobby.settings, () => {
        const settings = options.read();
        // Remembered as the rules of the next game created on this device
        const setup = loadSetup();
        setup.settings = settings;
        saveSetup(setup);
        props.onSettings?.(settings);
    });
    const copy = async (button) => {
        const shareData = { title: 'Dutch', text: `Rejoins ma partie de Dutch (code ${lobby.code})`, url: props.link };
        try {
            if (navigator.share && matchMedia('(pointer: coarse)').matches) {
                await navigator.share(shareData);
                return;
            }
            await navigator.clipboard.writeText(props.link);
            button.textContent = 'Lien copié ✓';
        }
        catch {
            // Clipboard refused: select the link so it can be copied by hand
            const input = root.querySelector('#room-link');
            input?.select();
        }
    };
    const players = el('ol', { class: 'lobby-players' }, ...lobby.players.map((p, i) => el('li', { class: p.connected ? '' : 'offline' }, el('span', { class: 'color-dot', style: { background: p.color }, role: 'img', 'aria-label': colorName(p.color) }), p.name, i === 0 ? el('span', { class: 'badge turn' }, 'Hôte') : null, i === props.you ? el('span', { class: 'badge you' }, 'Vous') : null)));
    const enough = lobby.players.length >= 2;
    const problem = checkSettings(lobby.players.length, lobby.settings);
    const startButton = el('button', {
        id: 'start-online', class: 'primary', disabled: !enough || !!problem,
        onclick: () => props.onStart?.(options.read()),
    }, enough ? `Distribuer les cartes (${lobby.players.length} joueurs)` : 'En attente d\'un autre joueur…');
    const copyButton = el('button', { class: 'secondary', id: 'copy-link' }, 'Partager le lien');
    copyButton.addEventListener('click', () => copy(copyButton));
    const rules = isHost
        ? options.element
        : el('section', { class: 'rules', 'aria-labelledby': 'rules-title' }, el('h3', { id: 'rules-title' }, 'Règles de la partie'), el('ul', {}, ...describeSettings(lobby.settings).map(line => el('li', {}, line))));
    root.appendChild(el('section', { class: 'lobby panel' }, el('h2', {}, 'Salle d\'attente'), el('div', { class: 'room-code' }, el('span', { class: 'hint' }, 'Code de la partie'), el('strong', { id: 'lobby-code' }, lobby.code)), el('div', { class: 'share' }, el('input', { type: 'text', id: 'room-link', readonly: true, value: props.link, 'aria-label': 'Lien de la partie' }), copyButton), el('h3', {}, `Joueurs (${lobby.players.length}/10)`), players, rules, isHost && problem ? el('p', { class: 'message error', role: 'alert' }, problem) : null, props.error ? el('p', { class: 'message error', role: 'alert' }, props.error) : null, isHost
        ? startButton
        : el('p', { class: 'hint waiting' }, `En attente de ${lobby.players[0]?.name ?? 'l\'hôte'} pour commencer…`), el('button', { class: 'secondary', id: 'leave', onclick: props.onLeave }, 'Quitter')));
    if (focusedId)
        document.getElementById(focusedId)?.focus();
}
