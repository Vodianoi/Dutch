import {Container, Graphics, Rectangle, Sprite, Text} from 'pixi.js';
import {gsap} from 'gsap';
import {Art, CH, CW} from './art.js';
import {centered} from './CardSprite.js';
import {handH, handW, Seat} from './layout.js';
import {hex, theme} from './themes.js';
import {points} from '../i18n.js';
import {sfx} from './sound.js';

/** Text on the table, in the font and (unless told otherwise) the colour of the theme */
export function label(text: string, size: number, color = hex(theme().ui.text), weight: '400' | '600' | '800' = '600'): Text {
    return new Text({text, style: {fontFamily: theme().body, fontSize: size, fill: color, fontWeight: weight}});
}

/** `primary`: on the table. `solid`: on the score panel. `danger`: the « Dutch » call. `ghost`: a way out */
export type ButtonKind = 'primary' | 'solid' | 'danger' | 'ghost';

/**
 *  Button drawn on the table (turn actions, score panel): a key in the colours of the theme,
 *  with its thickness showing under it when the theme has keys that stand out
 */
export function button(text: string, kind: ButtonKind, scale: number, onTap: () => void): Container {
    const ui = theme().ui;
    const box = new Container();
    const key = kind === 'ghost' ? null : ui.keys[kind];
    const t = label(text, 15 * scale, hex(key ? key.text : ui.ghost.text), '800');
    t.anchor.set(.5);
    const w = Math.max(t.width + 36 * scale, 110 * scale);
    const h = 44 * scale;
    const r = Math.min(ui.keyRadius * scale, h / 2);
    const bg = new Graphics();
    if (key) {
        // The edge of the key shows under its face
        const depth = ui.keyDepth * scale;
        if (depth) bg.roundRect(-w / 2, -h / 2 + depth, w, h - depth, r).fill(key.edge);
        bg.roundRect(-w / 2, -h / 2, w, h - depth, r).fill(key.face);
        t.y = -depth / 2;
    } else {
        bg.roundRect(-w / 2, -h / 2, w, h, r).fill({color: hex(ui.ghost.fill), alpha: ui.ghost.alpha}).stroke({width: 1.5, color: hex(ui.ghost.stroke), alpha: .6});
    }
    box.addChild(bg, t);
    box.eventMode = 'static';
    box.cursor = 'pointer';
    // Bigger touch area than the drawing
    box.hitArea = new Rectangle(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
    box.on('pointerdown', () => gsap.to(box.scale, {x: .94, y: .94, duration: .08}));
    box.on('pointerupoutside', () => gsap.to(box.scale, {x: 1, y: 1, duration: .15}));
    box.on('pointerup', () => {
        gsap.to(box.scale, {x: 1, y: 1, duration: .2, ease: 'back.out(3)'});
        sfx.tap();
        onTap();
    });
    return box;
}

/**
 *  A player around the table: coloured token with the initial, name, score, badges
 */
export class SeatView extends Container {
    private readonly ring = new Graphics();
    private readonly disc = new Graphics();
    private readonly initial: Text;
    private readonly nameText: Text;
    private readonly scoreText: Text;
    private readonly badge = new Container();
    private readonly badgeText: Text;
    private pulse: gsap.core.Tween | null = null;
    private lit = false;
    public readonly spot: Sprite;

    private readonly fullName: string;

    constructor(public readonly playerId: number, private readonly color: string, name: string, art: Art) {
        super();
        this.fullName = name;
        this.initial = label(name[0]?.toUpperCase() ?? '?', 16, 0xffffff, '800');
        this.initial.anchor.set(.5);
        const ui = theme().ui;
        this.nameText = label(name, 13, hex(ui.text), '800');
        this.scoreText = label('', 12, hex(ui.muted), '400');
        if (ui.textShadow) {
            // Names sit on the rim of the table or on the room: a soft shadow keeps them readable on both
            const shadow = {color: hex(ui.textShadow), alpha: .85, blur: 4, distance: 1, angle: Math.PI / 2};
            this.nameText.style.dropShadow = shadow;
            this.scoreText.style.dropShadow = shadow;
        }
        this.badgeText = label('DUTCH', 10, hex(ui.badge.text), '800');
        this.badgeText.anchor.set(.5);
        this.badge.addChild(new Graphics(), this.badgeText);
        this.badge.visible = false;
        this.addChild(this.ring, this.disc, this.initial, this.nameText, this.scoreText, this.badge);
        this.spot = centered(new Sprite(art.spot));
        this.spot.alpha = 0;
        this.eventMode = 'static';
    }

    public layout(seat: Seat, ui: number, cols: number) {
        const r = seat.avatar.r;
        this.position.set(seat.avatar.x, seat.avatar.y);
        this.ring.clear().circle(0, 0, r + 4).stroke({width: 3, color: hex(theme().ui.accent)});
        this.ring.alpha = this.lit ? 1 : 0;
        this.disc.clear().circle(0, 0, r).fill(this.color).stroke({width: 2, color: 0xffffff, alpha: .92});
        this.initial.style.fontSize = r * .85;
        this.nameText.style.fontSize = 13 * ui;
        // Long names end with « … » to stay in their place
        this.nameText.text = this.fullName;
        const room = seat.label === 'below' ? Math.max(seat.labelW, 2 * r) : seat.labelW;
        while (this.nameText.width > room && this.nameText.text.length > 2) this.nameText.text = this.nameText.text.slice(0, -2) + '…';
        this.scoreText.style.fontSize = 11.5 * ui;
        if (seat.label === 'right') {
            this.nameText.anchor.set(0, 1);
            this.scoreText.anchor.set(0, 0);
            this.nameText.position.set(r + 8, 1);
            this.scoreText.position.set(r + 8, 2);
        } else {
            this.nameText.anchor.set(.5, 0);
            this.scoreText.anchor.set(.5, 0);
            this.nameText.position.set(0, r + 6);
            this.scoreText.position.set(0, r + 6 + 15 * ui);
        }
        this.placeBadge(r, seat.label);
        this.hitArea = new Rectangle(-r - 6, -r - 6, r * 2 + 12 + (seat.label === 'right' ? 90 : 0), r * 2 + 12 + (seat.label === 'below' ? 34 : 0));
        this.spot.position.set(seat.x, seat.y);
        // A round pool of light, a little wider than the hand
        const size = this.spot.texture.width;
        this.spot.scale.set(handW(seat.cw, cols) * 1.7 / size, handH(seat.cw) * 1.5 / size);
    }

    private placeBadge(r: number, side: 'right' | 'below') {
        const w = this.badgeText.width + 14;
        (this.badge.children[0] as Graphics).clear().roundRect(-w / 2, -9, w, 18, Math.min(6, theme().ui.keyRadius)).fill(hex(theme().ui.badge.fill));
        if (side === 'right') this.badge.position.set(r + 8 + Math.max(this.nameText.width, this.scoreText.width) + w / 2 + 8, 0);
        else this.badge.position.set(0, -r - 14);
    }

    public update(o: { score: number; active: boolean; badge: string | null; choosable: boolean; connected: boolean }) {
        this.scoreText.text = points(o.score);
        this.badge.visible = !!o.badge;
        if (o.badge && this.badgeText.text !== o.badge) this.badgeText.text = o.badge;
        this.cursor = o.choosable ? 'pointer' : 'default';
        this.alpha = o.connected ? 1 : .45;
        const lit = o.active || o.choosable;
        if (lit === this.lit) return;
        this.lit = lit;
        this.pulse?.kill();
        if (lit) {
            this.ring.alpha = 1;
            // A few pulses when the turn comes, then a steady ring
            this.pulse = gsap.fromTo(this.ring.scale, {x: 1, y: 1}, {x: 1.12, y: 1.12, duration: .6, yoyo: true, repeat: 3, ease: 'sine.inOut'});
            gsap.to(this.spot, {alpha: .2, duration: .6, ease: 'sine.out'});
        } else {
            this.ring.alpha = 0;
            this.ring.scale.set(1);
            gsap.to(this.spot, {alpha: 0, duration: .6, ease: 'sine.out'});
        }
    }
}
