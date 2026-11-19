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
    if (object.destroyed || disposing.has(object))
        return;
    disposing.add(object);
    stopTweens(object);
    object.visible = false;
    object.removeFromParent();
    // Destroyed once the current animation frame is over: GSAP may still render, in this frame, a tween
    // of this object that comes after the one whose end called dispose()
    queueMicrotask(() => {
        disposing.delete(object);
        stopTweens(object);
        if (!object.destroyed)
            object.destroy({ children: true });
    });
}
const disposing = new WeakSet();
/** Stop every animation of an object and of everything inside it (before it is destroyed) */
export function stopTweens(object) {
    gsap.killTweensOf(object);
    gsap.killTweensOf(object.scale);
    gsap.killTweensOf(object.position);
    object.children.forEach(stopTweens);
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
        this.compact = false;
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
        this.drawFace();
    }
    drawFace() {
        const card = toCard(this.view);
        if (card)
            this.front.texture = this.compact ? this.art.compact(card) : this.art.face(card);
    }
    /** Small card: big rank and suit only (switched when the card is placed) */
    fitFace(scale) {
        const compact = CW * scale < CardSprite.COMPACT;
        if (compact === this.compact)
            return;
        this.compact = compact;
        this.drawFace();
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
        this.body.scale.y = 1;
        if (instant) {
            this.body.scale.x = 1;
            this.showFace();
            return;
        }
        // Turned over in the air: the card rises a little, narrows, shows its other side and lands softly
        this.flipTimeline = gsap.timeline({ delay })
            .to(this.body.scale, { x: 0, duration: .16, ease: 'sine.in', onComplete: () => {
                this.showFace();
                sfx.flip();
            } })
            .to(this.body.scale, { x: 1, duration: .22, ease: 'sine.out' })
            .to(this.body.scale, { y: 1.04, duration: .19, ease: 'sine.out', yoyo: true, repeat: 1 }, 0);
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
        gsap.killTweensOf(this.glow.scale);
        if (level === 0) {
            this.glowTween = gsap.to(this.glow, { alpha: 0, duration: .3, ease: 'sine.out' });
            gsap.to(this.glow.scale, { x: 1, y: 1, duration: .3, ease: 'sine.out' });
        }
        else if (level === 1) {
            // Fades in, breathes slowly a few times to catch the eye, then stays (endless motion distracts)
            this.glowTween = gsap.timeline()
                .to(this.glow, { alpha: .9, duration: .35, ease: 'sine.out' })
                .to(this.glow, { alpha: .5, duration: .8, ease: 'sine.inOut', yoyo: true, repeat: 3 })
                .to(this.glow, { alpha: .8, duration: .5, ease: 'sine.inOut' });
            gsap.fromTo(this.glow.scale, { x: .97, y: .97 }, { x: 1.03, y: 1.03, duration: .8, ease: 'sine.inOut', yoyo: true, repeat: 4 });
        }
        else {
            // Chosen: full light, held a little closer
            this.glowTween = gsap.to(this.glow, { alpha: 1, duration: .25, ease: 'sine.out' });
            gsap.to(this.glow.scale, { x: 1.06, y: 1.06, duration: .3, ease: 'back.out(2)' });
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
            this.fitFace(target.scale);
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
        const duration = Math.max(.3, Math.min(.6, .28 + distance / 1500));
        gsap.killTweensOf(this);
        gsap.killTweensOf(this.scale);
        this.zIndex = 1000 + target.z;
        this.moveTween = gsap.to(this, {
            // Quick but rounded start, long soft landing
            x: target.x, y: target.y, rotation: target.rotation, duration, delay, ease: 'power2.out',
            onStart: () => {
                if (distance > 6)
                    sfx.slide();
            },
            onComplete: () => {
                this.zIndex = target.z;
            },
        });
        gsap.to(this.scale, { x: target.scale, y: target.scale, duration, delay, ease: 'power2.out' });
        this.fitHitArea(target.scale);
        this.fitFace(target.scale);
        if (distance > 40) {
            // A round arc: up quickly, down slowly onto its place
            gsap.timeline({ delay })
                .to(this, { lift: 1, duration: duration * .4, ease: 'sine.out' })
                .to(this, { lift: 0, duration: duration * .7, ease: 'sine.inOut' });
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
        gsap.to(this, { lift: on ? .35 : 0, duration: on ? .22 : .18, ease: 'sine.out' });
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
        // A smooth « no »: a few gentle sways that die out
        gsap.killTweensOf(this.lifter);
        gsap.to(this.lifter, {
            keyframes: { x: [0, -8, 7, -5, 3, -1, 0], rotation: [0, -.05, .045, -.03, .015, 0, 0], easeEach: 'sine.inOut' },
            duration: .6,
        });
    }
    /** Small lift: its owner looks at it */
    peekGesture() {
        gsap.timeline({ delay: .2 })
            .to(this, { lift: .7, duration: .35, ease: 'sine.out' })
            .to(this, { lift: 0, duration: .45, ease: 'sine.inOut' }, '+=.15');
    }
}
/** Below this width (in pixels on screen) the card shows its compact face */
CardSprite.COMPACT = 48;
