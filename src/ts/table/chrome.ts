import {gsap} from 'gsap';
import {ChatMessage, EMOTES} from '../net/Protocol.js';
import {Session} from '../Session.js';
import {howToPlay} from '../howToPlay.js';
import {t} from '../i18n.js';
import {describeSettings} from '../Settings.js';
import {ChatBox} from '../ui/ChatBox.js';
import {BACK_COLORS, BackColor, TABLE_THEMES, TableTheme} from './cardArt.js';
import {BOT_PACES, BotPace, Prefs, savePrefs} from './prefs.js';
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
    /** Table look choice (flat table only) */
    onFeltChange?(): void;
    /** The player chose the other table (flat / 3D) */
    onTableChange?(mode: '2d' | '3d'): void;
}

export class TableChrome {
    public chatBox: ChatBox | null = null;
    private ownChat = false;
    private chatDrawer: HTMLElement | null = null;
    private chatButton: HTMLButtonElement | null = null;
    private emotePop: HTMLElement | null = null;
    private emoteButton: HTMLButtonElement | null = null;
    /** Where the reactions button is next to the own token (null: in the top bar) */
    private emoteSpot: { x: number; y: number; r: number } | null = null;
    private menu: HTMLElement | null = null;
    private unread = 0;

    constructor(private readonly o: ChromeOptions) {
        const menuButton = document.createElement('button');
        menuButton.type = 'button';
        menuButton.className = 'table-menu-button';
        menuButton.setAttribute('aria-haspopup', 'dialog');
        menuButton.innerHTML = `<span aria-hidden="true">☰</span> ${t('Menu')}`;
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
        this.emoteButton?.remove();
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
        emoteButton.setAttribute('aria-label', t('Réactions'));
        emoteButton.setAttribute('aria-expanded', 'false');
        emoteButton.textContent = '😀';
        emoteButton.addEventListener('click', () => this.toggleEmotes(emoteButton));
        this.emoteButton = emoteButton;
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

    /**
     *  The table found room next to the own token: the reactions button goes there, where the thumb is
     *  (on phones, the top bar is far). Null: back in the top bar.
     *  @param spot centre and radius, in pixels from the top left corner of the table screen
     */
    public placeEmotes(spot: { x: number; y: number; r: number } | null) {
        const button = this.emoteButton;
        if (!button) return;
        this.emoteSpot = spot;
        if (spot) {
            button.classList.add('seat-emote-button');
            Object.assign(button.style, {left: `${spot.x - spot.r}px`, top: `${spot.y - spot.r}px`, width: `${spot.r * 2}px`, height: `${spot.r * 2}px`});
            // Right after the top bar in the reading order
            if (button.parentElement !== this.o.screen) {
                const bar = this.o.bar.closest('.table-bar');
                if (bar?.parentElement === this.o.screen) bar.after(button);
                else this.o.screen.append(button);
            }
        } else {
            button.classList.remove('seat-emote-button');
            button.removeAttribute('style');
            if (button.parentElement !== this.o.bar) {
                // Back after the Menu button
                const menu = this.o.bar.firstElementChild;
                if (menu) menu.after(button);
                else this.o.bar.append(button);
            }
        }
        if (this.emotePop) this.placePop(this.emotePop);
    }

    /** The reactions open above the button next to the own token, or under the top bar */
    private placePop(pop: HTMLElement) {
        const spot = this.emoteSpot;
        pop.classList.toggle('from-seat', !!spot);
        if (!spot) {
            pop.removeAttribute('style');
            return;
        }
        const height = this.o.screen.clientHeight;
        // Above the button if there is room, otherwise below it
        if (spot.y - spot.r > height / 2) Object.assign(pop.style, {top: 'auto', bottom: `${height - spot.y + spot.r + 8}px`});
        else Object.assign(pop.style, {top: `${spot.y + spot.r + 8}px`, bottom: 'auto'});
        pop.style.left = `${Math.max(10, spot.x - spot.r)}px`;
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
        pop.setAttribute('aria-label', t('Réactions'));
        for (const emote of EMOTES) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'emote-button';
            b.textContent = emote;
            b.setAttribute('aria-label', t('Envoyer {emote}', {emote}));
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
        this.placePop(pop);
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
        panel.setAttribute('aria-label', t('Discussion'));
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'secondary chat-close';
        close.textContent = t('Fermer');
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
        this.chatButton.append(t('Chat'));
        if (this.unread) {
            const badge = document.createElement('span');
            badge.className = 'unread';
            badge.textContent = String(this.unread);
            this.chatButton.append(badge);
        }
        this.chatButton.setAttribute('aria-label', this.unread ? t(this.unread > 1 ? 'Discussion, {n} messages non lus' : 'Discussion, {n} message non lu', {n: this.unread}) : t('Discussion'));
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
        // How to play, for the rules of this game
        const howTo = s ? howToPlay(s.settings).map(section =>
            `<h3>${escape(section.title)}</h3><ul>${section.lines.map(line => `<li>${escape(line)}</li>`).join('')}</ul>`).join('') : '';
        const backs = this.o.onBackChange ? `<p class="choice-title" aria-hidden="true">${t('Dos des cartes')}</p><div class="backs" role="radiogroup" aria-label="${t('Dos des cartes')}">${(Object.keys(BACK_COLORS) as BackColor[]).map(key =>
            `<label class="back-choice"><input type="radio" name="back" value="${key}" ${prefs.back === key ? 'checked' : ''}><span class="back-swatch back-${key}" aria-hidden="true"></span>${t(BACK_COLORS[key].name)}</label>`).join('')}</div>` : '';
        const felts = this.o.onFeltChange ? `<p class="choice-title" aria-hidden="true">${t('Tapis')}</p><div class="felts" role="radiogroup" aria-label="${t('Tapis')}">${(Object.keys(TABLE_THEMES) as TableTheme[]).map(key => {
            const c = TABLE_THEMES[key];
            const swatch = `background: radial-gradient(ellipse at 50% 40%, ${c.felt[0]}, ${c.felt[1]} 60%, ${c.felt[2]}); border-color: ${c.rail[1]}`;
            return `<label class="felt-choice"><input type="radio" name="felt" value="${key}" ${prefs.felt === key ? 'checked' : ''}><span class="felt-swatch${c.wood ? ' felt-wood' : ''}" style="${swatch}" aria-hidden="true"></span>${t(c.name)}</label>`;
        }).join('')}</div>` : '';
        dialog.innerHTML = `
            <section class="panel menu-panel" role="dialog" aria-modal="true" aria-labelledby="menu-title">
                <h2 id="menu-title">${t('Menu')}</h2>
                <button type="button" class="primary" data-act="close">${t('Reprendre la partie')}</button>
                <details class="how-to"><summary>${t('Comment jouer')}</summary><div class="how-to-body">${howTo}</div></details>
                <details><summary>${t('Règles de la partie')}</summary><ul>${rules}</ul></details>
                <fieldset><legend>${t('Réglages de cet appareil')}</legend>
                    <label class="switch"><input type="checkbox" name="sound" ${prefs.sound ? 'checked' : ''}> ${t('Sons')}</label>
                    <label class="switch"><input type="checkbox" name="vibration" ${prefs.vibration ? 'checked' : ''}> ${t('Vibrations')}</label>
                    <label class="switch"><input type="checkbox" name="fast" ${prefs.speed === 'fast' ? 'checked' : ''}> ${t('Animations rapides')}</label>
                    ${this.o.session.setBotSpeed ? `<label class="inline-field">${t('Vitesse des ordinateurs')} <select name="bots">${(Object.keys(BOT_PACES) as BotPace[]).map(key =>
                        `<option value="${key}" ${prefs.bots === key ? 'selected' : ''}>${t(BOT_PACES[key].name)}</option>`).join('')}</select></label>` : ''}
                    ${this.o.onTableChange ? `<label class="switch"><input type="checkbox" name="table3d" ${prefs.table === '3d' ? 'checked' : ''}> ${t('Table en 3D (prototype)')}</label>` : ''}
                    ${backs}
                    ${felts}
                    ${this.o.debug && this.o.session.canShowAll ? `<label class="switch"><input type="checkbox" name="showAll"> ${t('Voir toutes les cartes (debug)')}</label>` : ''}
                </fieldset>
                <button type="button" class="secondary danger" data-act="quit">${t('Quitter la partie')}</button>
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
            if (input.name === 'bots' && input.value in BOT_PACES) {
                prefs.bots = input.value as BotPace;
                this.o.session.setBotSpeed?.(BOT_PACES[prefs.bots].factor);
            }
            if (input.name === 'showAll') this.o.session.setShowAll(input.checked);
            if (input.name === 'felt') {
                prefs.felt = input.value as TableTheme;
                this.o.onFeltChange?.();
            }
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
