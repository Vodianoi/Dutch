import { gameOptions, loadSetup, saveSetup } from './SetupView.js';
import { clear, el } from './dom.js';
/**
 *  Waiting room of an online game: code and link to share, players, options (host)
 */
export function renderLobby(root, props) {
    clear(root);
    const { lobby, isHost } = props;
    const setup = loadSetup();
    const options = gameOptions(setup, () => {
        Object.assign(setup, options.read());
        saveSetup(setup);
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
    const players = el('ol', { class: 'lobby-players' }, ...lobby.players.map((p, i) => el('li', { class: p.connected ? '' : 'offline' }, p.name, i === 0 ? el('span', { class: 'badge turn' }, 'Hôte') : null, i === props.you ? el('span', { class: 'badge you' }, 'Vous') : null)));
    const enough = lobby.players.length >= 2;
    const startButton = el('button', {
        id: 'start-online', class: 'primary', disabled: !enough,
        onclick: () => props.onStart?.(options.read()),
    }, enough ? `Distribuer les cartes (${lobby.players.length} joueurs)` : 'En attente d\'un autre joueur…');
    const copyButton = el('button', { class: 'secondary', id: 'copy-link' }, 'Partager le lien');
    copyButton.addEventListener('click', () => copy(copyButton));
    root.appendChild(el('section', { class: 'lobby panel' }, el('h2', {}, 'Salle d\'attente'), el('div', { class: 'room-code' }, el('span', { class: 'hint' }, 'Code de la partie'), el('strong', { id: 'lobby-code' }, lobby.code)), el('div', { class: 'share' }, el('input', { type: 'text', id: 'room-link', readonly: true, value: props.link, 'aria-label': 'Lien de la partie' }), copyButton), el('h3', {}, `Joueurs (${lobby.players.length}/10)`), players, isHost ? options.element : null, props.error ? el('p', { class: 'message error', role: 'alert' }, props.error) : null, isHost
        ? startButton
        : el('p', { class: 'hint waiting' }, `En attente de ${lobby.players[0]?.name ?? 'l\'hôte'} pour commencer…`), el('button', { class: 'secondary', id: 'leave', onclick: props.onLeave }, 'Quitter')));
}
