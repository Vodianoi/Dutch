import {gsap} from 'gsap';
import {ChatMessage, EMOTES} from '../net/Protocol.js';
import {Session} from '../Session.js';
import {describeSettings} from '../Settings.js';
import {ChatBox} from '../ui/ChatBox.js';
import {BACK_COLORS, BackColor} from './cardArt.js';
import {Prefs, savePrefs} from './prefs.js';
import {setMuted, unlockAudio} from './sound.js';

/**
 *  Everything around the game table that is plain HTML, shared by the flat table and the 3D one:
 *  the Menu button and its dialog (rules, device settings, quit), the reactions strip and the chat drawer.
 */
export interface ChromeOptions {
    session: Session;
    /** Screen of the table (the reactions strip goes in it) */
    screen: HTMLElement;
    /** Left part of the top bar: the buttons go in it */
    bar: HTMLElement;
    prefs: Prefs;
    /** Chat of the online game, coming from the waiting room (otherwise one is made if the session has a chat) */
    chatBox?: ChatBox;
    debug?: boolean;
    quitWarning?: string;
    onQuit(): void;
    /** Card back choice (flat table only) */
    onBackChange?(): void;
    /** The player chose the other table (flat / 3D) */
    onTableChange?(mode: '2d' | '3d'): void;
}

export class TableChrome {
    public chatBox: ChatBox | null = null;
    private ownChat = false;
    private chatDrawer: HTMLElement | null = null;
    private chatButton: HTMLButtonElement | null = null;
    private emotePop: HTMLElement | null = null;
    private menu: HTMLElement | null = null;
    private unread = 0;

    constructor(private readonly o: ChromeOptions) {
        const menuButton = document.createElement('button');
        menuButton.type = 'button';
        menuButton.className = 'table-menu-button';
        menuButton.setAttribute('aria-haspopup', 'dialog');
        menuButton.innerHTML = '<span aria-hidden="true">☰</span> Menu';
        menuButton.addEventListener('click', () => this.openMenu());
        o.bar.append(menuButton);
        if (o.session.chat) this.buildChat();
        this.applyPrefs();
    }

    public get prefs(): Prefs {
        return this.o.prefs;
    }

    public destroy() {
        this.menu?.remove();
        this.chatDrawer?.remove();
        this.emotePop?.remove();
        if (this.ownChat) this.chatBox?.destroy();
        else if (this.chatBox) {
            // Shared with the waiting room: shown again there
            this.chatBox.element.remove();
            this.chatBox.element.hidden = false;
        }
    }

    public applyPrefs() {
        setMuted(!this.o.prefs.sound);
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        gsap.globalTimeline.timeScale(reduced ? 2.5 : this.o.prefs.speed === 'fast' ? 1.6 : 1);
    }

    /** A chat line arrived: counted as unread while the chat is closed */
    public countUnread(message: ChatMessage) {
        if (message.text && message.seat !== this.o.session.viewerId && !this.chatDrawer) {
            this.unread++;
            this.updateUnread();
        }
    }

    // region Chat
    private buildChat() {
        const chat = this.o.session.chat!;
        this.chatBox = this.o.chatBox ?? new ChatBox(chat, this.o.session);
        this.ownChat = !this.o.chatBox;
        const emoteButton = document.createElement('button');
        emoteButton.type = 'button';
        emoteButton.className = 'table-menu-button table-emote-button';
        emoteButton.setAttribute('aria-label', 'Réactions');
        emoteButton.setAttribute('aria-expanded', 'false');
        emoteButton.textContent = '😀';
        emoteButton.addEventListener('click', () => this.toggleEmotes(emoteButton));
        this.o.bar.append(emoteButton);
        if (chat.text) {
            const chatButton = document.createElement('button');
            chatButton.type = 'button';
            chatButton.className = 'table-menu-button';
            chatButton.setAttribute('aria-haspopup', 'dialog');
            chatButton.addEventListener('click', () => this.openChat());
            this.chatButton = chatButton;
            this.updateUnread();
            this.o.bar.append(chatButton);
        }
    }

    private toggleEmotes(opener: HTMLButtonElement) {
        if (this.emotePop) {
            this.emotePop.remove();
            this.emotePop = null;
            opener.setAttribute('aria-expanded', 'false');
            return;
        }
        const pop = document.createElement('div');
        pop.className = 'emote-pop';
        pop.setAttribute('role', 'group');
        pop.setAttribute('aria-label', 'Réactions');
        for (const emote of EMOTES) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'emote-button';
            b.textContent = emote;
            b.setAttribute('aria-label', `Envoyer ${emote}`);
            b.addEventListener('click', () => {
                unlockAudio();
                this.o.session.chat?.emote(emote);
                this.toggleEmotes(opener);
                opener.focus();
            });
            pop.append(b);
        }
        pop.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                this.toggleEmotes(opener);
                opener.focus();
            }
        });
        this.o.screen.append(pop);
        this.emotePop = pop;
        opener.setAttribute('aria-expanded', 'true');
        pop.querySelector<HTMLElement>('button')?.focus();
    }

    private openChat() {
        if (this.chatDrawer || !this.chatBox) return;
        const box = this.chatBox;
        const opener = document.activeElement as HTMLElement | null;
        const drawer = document.createElement('div');
        drawer.className = 'overlay chat-overlay';
        const panel = document.createElement('section');
        panel.className = 'panel chat-drawer';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'Discussion');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'secondary chat-close';
        close.textContent = 'Fermer';
        const shut = () => {
            drawer.remove();
            this.chatDrawer = null;
            this.o.screen.append(box.element);
            box.element.hidden = true;
            opener?.focus();
        };
        close.addEventListener('click', shut);
        drawer.addEventListener('click', e => e.target === drawer && shut());
        drawer.addEventListener('keydown', e => e.key === 'Escape' && shut());
        box.element.hidden = false;
        panel.append(box.element, close);
        drawer.append(panel);
        document.body.append(drawer);
        this.chatDrawer = drawer;
        this.unread = 0;
        this.updateUnread();
        box.scrollToEnd();
        box.focus();
    }

    private updateUnread() {
        if (!this.chatButton) return;
        this.chatButton.textContent = '';
        this.chatButton.append('Chat');
        if (this.unread) {
            const badge = document.createElement('span');
            badge.className = 'unread';
            badge.textContent = String(this.unread);
            this.chatButton.append(badge);
        }
        this.chatButton.setAttribute('aria-label', this.unread ? `Discussion, ${this.unread} message${this.unread > 1 ? 's' : ''} non lu${this.unread > 1 ? 's' : ''}` : 'Discussion');
    }
    // endregion

    // region Menu
    private openMenu() {
        if (this.menu) return;
        const s = this.o.session.state;
        const prefs = this.o.prefs;
        const opener = document.activeElement as HTMLElement | null;
        const dialog = document.createElement('div');
        dialog.className = 'overlay table-menu';
        const close = () => {
            dialog.remove();
            this.menu = null;
            opener?.focus();
        };
        const rules = s ? describeSettings(s.settings).map(line => `<li>${escape(line)}</li>`).join('') : '';
        const backs = this.o.onBackChange ? `<div class="backs" role="radiogroup" aria-label="Dos des cartes">${(Object.keys(BACK_COLORS) as BackColor[]).map(key =>
            `<label class="back-choice"><input type="radio" name="back" value="${key}" ${prefs.back === key ? 'checked' : ''}><span class="back-swatch back-${key}" aria-hidden="true"></span>${BACK_COLORS[key].name}</label>`).join('')}</div>` : '';
        dialog.innerHTML = `
            <section class="panel menu-panel" role="dialog" aria-modal="true" aria-labelledby="menu-title">
                <h2 id="menu-title">Menu</h2>
                <button type="button" class="primary" data-act="close">Reprendre la partie</button>
                <details><summary>Règles de la partie</summary><ul>${rules}</ul></details>
                <fieldset><legend>Réglages de cet appareil</legend>
                    <label class="switch"><input type="checkbox" name="sound" ${prefs.sound ? 'checked' : ''}> Sons</label>
                    <label class="switch"><input type="checkbox" name="vibration" ${prefs.vibration ? 'checked' : ''}> Vibrations</label>
                    <label class="switch"><input type="checkbox" name="fast" ${prefs.speed === 'fast' ? 'checked' : ''}> Animations rapides</label>
                    ${this.o.onTableChange ? `<label class="switch"><input type="checkbox" name="table3d" ${prefs.table === '3d' ? 'checked' : ''}> Table en 3D (prototype)</label>` : ''}
                    ${backs}
                    ${this.o.debug && this.o.session.canShowAll ? '<label class="switch"><input type="checkbox" name="showAll"> Voir toutes les cartes (debug)</label>' : ''}
                </fieldset>
                <button type="button" class="secondary danger" data-act="quit">Quitter la partie</button>
            </section>`;
        dialog.addEventListener('click', e => {
            const target = e.target as HTMLElement;
            if (target === dialog || target.dataset.act === 'close') close();
            if (target.dataset.act === 'quit') {
                if (!this.o.quitWarning || confirm(this.o.quitWarning)) {
                    close();
                    this.o.onQuit();
                }
            }
        });
        dialog.addEventListener('keydown', e => {
            if (e.key === 'Escape') close();
        });
        dialog.addEventListener('change', e => {
            const input = e.target as HTMLInputElement;
            if (input.name === 'sound') prefs.sound = input.checked;
            if (input.name === 'vibration') prefs.vibration = input.checked;
            if (input.name === 'fast') prefs.speed = input.checked ? 'fast' : 'normal';
            if (input.name === 'showAll') this.o.session.setShowAll(input.checked);
            if (input.name === 'back') {
                prefs.back = input.value as BackColor;
                this.o.onBackChange?.();
            }
            savePrefs(prefs);
            this.applyPrefs();
            if (input.name === 'table3d') {
                prefs.table = input.checked ? '3d' : '2d';
                savePrefs(prefs);
                close();
                this.o.onTableChange?.(prefs.table);
            }
        });
        document.body.appendChild(dialog);
        this.menu = dialog;
        dialog.querySelector<HTMLElement>('[data-act="close"]')?.focus();
    }
    // endregion
}

export function escape(text: string): string {
    return text.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]!));
}
