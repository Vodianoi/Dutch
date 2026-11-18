import {Container, Rectangle, Sprite} from 'pixi.js';
import {gsap} from 'gsap';
import {CardView, toCard} from '../View.js';
import {Art, CH, CW} from './art.js';
import {Point} from './layout.js';
import {sfx} from './sound.js';

export interface Target extends Point {
    rotation: number;
    scale: number;
    z: number;
    up: boolean;
}

export type Place =
    | { zone: 'hand'; player: number; index: number }
    | { zone: 'discard'; top: boolean }
    | { zone: 'held' };

export function centered<T extends Sprite>(sprite: T): T {
    sprite.anchor.set(.5);
    return sprite;
}

/**
 *  Destroy a display object and stop its animations first
 *  (a tween left on a destroyed object throws on every frame and stops the other animations)
 */
export function dispose(object: Container) {
    if (object.destroyed) return;
    const stop = (o: Container) => {
        gsap.killTweensOf(o);
        gsap.killTweensOf(o.scale);
        o.children.forEach(stop);
    };
    stop(object);
    object.destroy({children: true});
}

/**
 *  One card on the table. Its face is only known once the card is shown to this device.
 */
export class CardSprite extends Container {
    public target: Target | null = null;
    public place: Place | null = null;
    public faceUp = false;
    /** Face of the card, once known */
    public view: CardView;
    private readonly shadow: Sprite;
    private readonly glow: Sprite;
    private readonly lifter = new Container();
    private readonly body = new Container();
    private readonly front: Sprite;
    private readonly backSide: Sprite;
    private glowTween: gsap.core.Tween | null = null;
    private glowLevel = 0;
    private liftValue = 0;
    private flipTimeline: gsap.core.Timeline | null = null;

    constructor(view: CardView, private readonly art: Art) {
        super();
        this.view = view;
        this.shadow = centered(new Sprite(art.shadow));
        this.glow = centered(new Sprite(art.glow));
        this.glow.alpha = 0;
        this.front = centered(new Sprite(art.back));
        this.backSide = centered(new Sprite(art.back));
        this.front.visible = false;
        this.body.addChild(this.front, this.backSide);
        this.lifter.addChild(this.glow, this.body);
        this.addChild(this.shadow, this.lifter);
        this.lift = 0;
        this.eventMode = 'static';
        this.hitArea = new Rectangle(-CW / 2, -CH / 2, CW, CH);
        this.learn(view);
    }

    /** The card was shown: remember its face */
    public learn(view: CardView) {
        if (!view.value || this.view.value === view.value && this.front.texture !== this.art.back) return;
        this.view = view;
        const card = toCard(view);
        if (card) this.front.texture = this.art.face(card);
    }

    public get known(): boolean {
        return !!this.view.value;
    }

    /** 0 on the table, 1 in the air (bigger, shadow further away) */
    get lift() {
        return this.liftValue;
    }

    set lift(v: number) {
        this.liftValue = v;
        this.shadow.position.set(6 + v * 22, 10 + v * 36);
        this.shadow.alpha = .7 - v * .25;
        this.lifter.scale.set(1 + v * .08);
    }

    public setFace(up: boolean, delay = 0, instant = false) {
        // A card is only turned over when its face is known
        up = up && this.known;
        if (up === this.faceUp) return;
        this.faceUp = up;
        this.flipTimeline?.kill();
        if (instant) {
            this.body.scale.x = 1;
            this.showFace();
            return;
        }
        this.flipTimeline = gsap.timeline({delay})
            .to(this.body.scale, {x: 0, duration: .13, ease: 'power2.in', onComplete: () => {
                this.showFace();
                sfx.flip();
            }})
            .to(this.body.scale, {x: 1, duration: .17, ease: 'power2.out'});
    }

    private showFace() {
        this.front.visible = this.faceUp;
        this.backSide.visible = !this.faceUp;
    }

    /** 0 nothing, 1 can be chosen (pulsing), 2 chosen */
    public setGlow(level: number) {
        if (level === this.glowLevel) return;
        this.glowLevel = level;
        this.glowTween?.kill();
        if (level === 0) {
            this.glowTween = gsap.to(this.glow, {alpha: 0, duration: .2});
        } else if (level === 1) {
            this.glow.alpha = .2;
            this.glowTween = gsap.to(this.glow, {alpha: .75, duration: .8, yoyo: true, repeat: -1, ease: 'sine.inOut'});
        } else {
            this.glowTween = gsap.to(this.glow, {alpha: 1, duration: .15});
        }
    }

    public moveTo(target: Target, delay = 0, instant = false) {
        const previous = this.target;
        this.target = target;
        if (instant) {
            gsap.killTweensOf(this);
            gsap.killTweensOf(this.scale);
            this.position.set(target.x, target.y);
            this.rotation = target.rotation;
            this.scale.set(target.scale);
            this.zIndex = target.z;
            this.lift = 0;
            return;
        }
        if (previous && Math.hypot(previous.x - target.x, previous.y - target.y) < .5
            && previous.scale === target.scale && previous.rotation === target.rotation) {
            if (!gsap.isTweening(this)) this.zIndex = target.z;
            return;
        }
        const distance = Math.hypot(this.x - target.x, this.y - target.y);
        const duration = Math.max(.3, Math.min(.62, .28 + distance / 1500));
        gsap.killTweensOf(this);
        gsap.killTweensOf(this.scale);
        this.zIndex = 1000 + target.z;
        gsap.to(this, {
            x: target.x, y: target.y, rotation: target.rotation, duration, delay, ease: 'power3.inOut',
            onStart: () => {
                if (distance > 6) sfx.slide();
            },
            onComplete: () => {
                this.zIndex = target.z;
            },
        });
        gsap.to(this.scale, {x: target.scale, y: target.scale, duration, delay, ease: 'power3.inOut'});
        if (distance > 40) {
            gsap.to(this, {lift: 1, duration: duration / 2, delay, yoyo: true, repeat: 1, ease: 'sine.inOut'});
        } else {
            this.lift = 0;
        }
    }

    /** Back to its place (after a drag that went nowhere) */
    public settle() {
        const target = this.target;
        this.target = null;
        if (target) this.moveTo(target);
    }

    /** Short shake: "no", or a wrong throw (red) */
    public shake(color?: number) {
        if (color !== undefined) {
            this.front.tint = color;
            this.backSide.tint = color;
            gsap.delayedCall(.9, () => {
                if (this.destroyed) return;
                this.front.tint = 0xffffff;
                this.backSide.tint = 0xffffff;
            });
        }
        gsap.fromTo(this.lifter, {x: -10}, {x: 0, duration: .5, ease: 'elastic.out(1.2, .3)'});
    }

    /** Small lift: its owner looks at it */
    public peekGesture() {
        gsap.to(this, {lift: .7, duration: .3, yoyo: true, repeat: 1, delay: .2, ease: 'sine.inOut'});
    }
}
