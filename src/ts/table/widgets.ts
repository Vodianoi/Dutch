import {Container, Graphics, Rectangle, Sprite, Text} from 'pixi.js';
import {gsap} from 'gsap';
import {Art, CH, CW, SANS} from './art.js';
import {centered} from './CardSprite.js';
import {handH, handW, Seat} from './layout.js';
import {sfx} from './sound.js';

export const GOLD = 0xffd166;
export const CREAM = 0xf6ead0;

export function label(text: string, size: number, color = CREAM, weight: '400' | '600' | '800' = '600'): Text {
    return new Text({text, style: {fontFamily: SANS, fontSize: size, fill: color, fontWeight: weight}});
}

export type ButtonKind = 'primary' | 'danger' | 'ghost';

/**
 *  Pill button drawn on the table (turn actions, score panel)
 */
export function button(text: string, kind: ButtonKind, scale: number, onTap: () => void): Container {
    const box = new Container();
    const t = label(text, 15 * scale, kind === 'primary' ? 0x2a1805 : 0xffffff, '800');
    t.anchor.set(.5);
    const w = Math.max(t.width + 36 * scale, 110 * scale);
    const h = 44 * scale;
    const bg = new Graphics().roundRect(-w / 2, -h / 2, w, h, h / 2);
    if (kind === 'primary') bg.fill(0xf2c14e).stroke({width: 2, color: 0xffe7a3});
    else if (kind === 'danger') bg.fill(0xc8323c).stroke({width: 2, color: 0xff8a8a});
    else bg.fill({color: 0x000000, alpha: .35}).stroke({width: 1.5, color: 0xffffff, alpha: .45});
    const shine = new Graphics().roundRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * .42, h / 2)
        .fill({color: 0xffffff, alpha: kind === 'ghost' ? .05 : .22});
    box.addChild(bg, shine, t);
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
        this.nameText = label(name, 13, CREAM, '800');
        this.scoreText = label('', 12, 0xd9c9a3, '400');
        this.badgeText = label('DUTCH', 10, 0x2a1805, '800');
        this.badgeText.anchor.set(.5);
        this.badge.addChild(new Graphics(), this.badgeText);
        this.badge.visible = false;
        this.addChild(this.ring, this.disc, this.initial, this.nameText, this.scoreText, this.badge);
        this.spot = centered(new Sprite(art.glow));
        this.spot.alpha = 0;
        this.eventMode = 'static';
    }

    public layout(seat: Seat, ui: number, cols: number) {
        const r = seat.avatar.r;
        this.position.set(seat.avatar.x, seat.avatar.y);
        this.ring.clear().circle(0, 0, r + 4).stroke({width: 3, color: GOLD});
        this.ring.alpha = this.lit ? 1 : 0;
        this.disc.clear().circle(0, 0, r).fill(this.color).stroke({width: 2, color: 0xffffff, alpha: .8});
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
        this.spot.scale.set(handW(seat.cw, cols) * 1.5 / CW, handH(seat.cw) * 1.2 / CH);
    }

    private placeBadge(r: number, side: 'right' | 'below') {
        const w = this.badgeText.width + 14;
        (this.badge.children[0] as Graphics).clear().roundRect(-w / 2, -9, w, 18, 9).fill(GOLD);
        if (side === 'right') this.badge.position.set(r + 8 + Math.max(this.nameText.width, this.scoreText.width) + w / 2 + 8, 0);
        else this.badge.position.set(0, -r - 14);
    }

    public update(o: { score: number; active: boolean; badge: string | null; choosable: boolean; connected: boolean }) {
        this.scoreText.text = `${o.score} pt${o.score > 1 ? 's' : ''}`;
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
            this.pulse = gsap.fromTo(this.ring.scale, {x: 1, y: 1}, {x: 1.14, y: 1.14, duration: .45, yoyo: true, repeat: 3, ease: 'sine.inOut'});
            gsap.to(this.spot, {alpha: .22, duration: .4});
        } else {
            this.ring.alpha = 0;
            this.ring.scale.set(1);
            gsap.to(this.spot, {alpha: 0, duration: .4});
        }
    }
}
