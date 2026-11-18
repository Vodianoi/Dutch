import { Container, Rectangle, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { toCard } from '../View.js';
import { CH, CW } from './art.js';
import { sfx } from './sound.js';
export function centered(sprite) {
    sprite.anchor.set(.5);
    return sprite;
}
/**
 *  Destroy a display object and stop its animations first
 *  (a tween left on a destroyed object throws on every frame and stops the other animations)
 */
export function dispose(object) {
    if (object.destroyed)
        return;
    const stop = (o) => {
        gsap.killTweensOf(o);
        gsap.killTweensOf(o.scale);
        o.children.forEach(stop);
    };
    stop(object);
    object.destroy({ children: true });
}
/**
 *  One card on the table. Its face is only known once the card is shown to this device.
 */
export class CardSprite extends Container {
    constructor(view, art) {
        super();
        this.art = art;
        this.target = null;
        this.place = null;
        this.faceUp = false;
        this.lifter = new Container();
        this.body = new Container();
        this.glowTween = null;
        this.glowLevel = 0;
        this.liftValue = 0;
        this.flipTimeline = null;
        /** Move to its place, while it runs (or waits for its delay) */
        this.moveTween = null;
        this.hovered = false;
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
    learn(view) {
        if (!view.value || this.view.value === view.value && this.front.texture !== this.art.back)
            return;
        this.view = view;
        const card = toCard(view);
        if (card)
            this.front.texture = this.art.face(card);
    }
    get known() {
        return !!this.view.value;
    }
    /** 0 on the table, 1 in the air (bigger, shadow further away) */
    get lift() {
        return this.liftValue;
    }
    set lift(v) {
        this.liftValue = v;
        this.shadow.position.set(6 + v * 22, 10 + v * 36);
        this.shadow.alpha = .7 - v * .25;
        this.lifter.scale.set(1 + v * .08);
    }
    setFace(up, delay = 0, instant = false) {
        // A card is only turned over when its face is known
        up = up && this.known;
        if (up === this.faceUp)
            return;
        this.faceUp = up;
        this.flipTimeline?.kill();
        if (instant) {
            this.body.scale.x = 1;
            this.showFace();
            return;
        }
        this.flipTimeline = gsap.timeline({ delay })
            .to(this.body.scale, { x: 0, duration: .13, ease: 'power2.in', onComplete: () => {
                this.showFace();
                sfx.flip();
            } })
            .to(this.body.scale, { x: 1, duration: .17, ease: 'power2.out' });
    }
    showFace() {
        this.front.visible = this.faceUp;
        this.backSide.visible = !this.faceUp;
    }
    /** 0 nothing, 1 can be chosen (pulsing), 2 chosen */
    setGlow(level) {
        if (level === this.glowLevel)
            return;
        this.glowLevel = level;
        this.glowTween?.kill();
        if (level === 0) {
            this.glowTween = gsap.to(this.glow, { alpha: 0, duration: .2 });
        }
        else if (level === 1) {
            // Two pulses to catch the eye, then a steady glow (endless motion distracts)
            this.glow.alpha = .2;
            this.glowTween = gsap.to(this.glow, { alpha: .75, duration: .55, yoyo: true, repeat: 4, ease: 'sine.inOut' });
        }
        else {
            this.glowTween = gsap.to(this.glow, { alpha: 1, duration: .15 });
        }
    }
    moveTo(target, delay = 0, instant = false) {
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
            this.fitHitArea(target.scale);
            return;
        }
        // Same place as before: nothing to do, unless the card was moved away from it (dropped after a drag)
        const travelling = !!this.moveTween && this.moveTween.progress() < 1;
        const inPlace = travelling || Math.hypot(this.x - target.x, this.y - target.y) < .5;
        if (previous && inPlace && Math.hypot(previous.x - target.x, previous.y - target.y) < .5
            && previous.scale === target.scale && previous.rotation === target.rotation) {
            if (!travelling)
                this.zIndex = target.z;
            return;
        }
        const distance = Math.hypot(this.x - target.x, this.y - target.y);
        const duration = Math.max(.26, Math.min(.55, .24 + distance / 1600));
        gsap.killTweensOf(this);
        gsap.killTweensOf(this.scale);
        this.zIndex = 1000 + target.z;
        this.moveTween = gsap.to(this, {
            // Fast start, soft landing
            x: target.x, y: target.y, rotation: target.rotation, duration, delay, ease: 'power3.out',
            onStart: () => {
                if (distance > 6)
                    sfx.slide();
            },
            onComplete: () => {
                this.zIndex = target.z;
            },
        });
        gsap.to(this.scale, { x: target.scale, y: target.scale, duration, delay, ease: 'power3.out' });
        this.fitHitArea(target.scale);
        if (distance > 40) {
            gsap.to(this, { lift: 1, duration: duration / 2, delay, yoyo: true, repeat: 1, ease: 'sine.inOut' });
        }
        else {
            this.lift = 0;
        }
    }
    /** Small cards are easier to touch: the touch area grows up to half the space between two cards */
    fitHitArea(scale) {
        const hw = Math.min(Math.max(CW / 2, 22 / scale), CW / 2 * 1.12);
        const hh = Math.min(Math.max(CH / 2, 22 / scale), CH / 2 * 1.08);
        this.hitArea = new Rectangle(-hw, -hh, hw * 2, hh * 2);
    }
    /** Mouse over a card that can be played: it rises a little */
    hover(on) {
        if (on === this.hovered)
            return;
        this.hovered = on;
        gsap.to(this, { lift: on ? .35 : 0, duration: on ? .16 : .12, ease: on ? 'power2.out' : 'power2.in' });
    }
    /** Picked up by a finger: stops where it is */
    pickUp() {
        gsap.killTweensOf(this);
        gsap.killTweensOf(this.scale);
        this.moveTween = null;
    }
    /** Back to its place (after a drag that went nowhere) */
    settle() {
        const target = this.target;
        this.target = null;
        if (target)
            this.moveTo(target);
    }
    /** Short shake: "no", or a wrong throw (red) */
    shake(color) {
        if (color !== undefined) {
            this.front.tint = color;
            this.backSide.tint = color;
            gsap.delayedCall(.9, () => {
                if (this.destroyed)
                    return;
                this.front.tint = 0xffffff;
                this.backSide.tint = 0xffffff;
            });
        }
        gsap.fromTo(this.lifter, { x: -10 }, { x: 0, duration: .5, ease: 'elastic.out(1.2, .3)' });
    }
    /** Small lift: its owner looks at it */
    peekGesture() {
        gsap.to(this, { lift: .7, duration: .3, yoyo: true, repeat: 1, delay: .2, ease: 'sine.inOut' });
    }
}
