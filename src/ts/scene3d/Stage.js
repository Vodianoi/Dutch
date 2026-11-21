import { AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, Float32BufferAttribute, FogExp2, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, NeutralToneMapping, PCFShadowMap, PerspectiveCamera, Plane, PlaneGeometry, PMREMGenerator, Raycaster, RepeatWrapping, Scene, Shape, ShapeGeometry, SpotLight, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { gsap } from 'gsap';
import { ring, spark, tables } from '../table/cardArt.js';
import { first, theme } from '../table/themes.js';
import { CARD_H, CARD_W, fitCamera, outline, pathLength, RIM } from './rig.js';
import { boards, clothColor, clothRelief, css, hexOf, leatherRelief, mix, rgb, rug, shade, token, wall, wood } from './textures.js';
/**
 *  The room of the 3D table: a card table under one lamp, chairs around it, a rug on a wooden floor.
 *  Built from a plan (rig.ts) in the colours of the theme; the cards are added by Table3D.
 */
/** Height of the table top above the floor */
const TABLE_H = .74;
/** Top of the rim above the cloth */
const RIM_H = .013;
/** Seated view: the widest this device's own cards are shown, in pixels */
const OWN_CARD_MAX = 112;
function lookOf(choice) {
    const all = tables();
    const table = all[choice] ?? all[first(all)];
    return {
        cloth: mix(rgb(table.felt[0]), rgb(table.felt[1]), .45),
        rim: mix(rgb(table.rail[0]), rgb(table.rail[1]), .7),
        rimDark: rgb(table.rail[2]),
        inlay: rgb(table.inlay),
        ink: rgb(table.ink),
        room: rgb(table.room[0]),
        wooden: !!table.wood,
        light: rgb(theme().ui.light),
    };
}
/**
 *  A shape pulled along a closed line: each point of `profile` is [distance outwards, height]
 * @param turns how many times the picture of the material repeats along the line
 */
function sweep(path, profile, turns) {
    const n = path.length, m = profile.length;
    const across = [0];
    for (let j = 1; j < m; j++)
        across.push(across[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
    const positions = [], uvs = [], index = [];
    for (let i = 0; i <= n; i++) {
        const p = path[i % n];
        for (let j = 0; j < m; j++) {
            positions.push(p.x + p.nx * profile[j][0], profile[j][1], p.z + p.nz * profile[j][0]);
            uvs.push(i / n * turns, across[j] / across[m - 1]);
        }
    }
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < m - 1; j++) {
            const a = i * m + j, b = (i + 1) * m + j, c = a + 1, d = b + 1;
            index.push(a, b, c, c, b, d);
        }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    // The line closes on itself: the last ring of points takes the shading of the first
    const normals = geometry.getAttribute('normal');
    for (let j = 0; j < m; j++) {
        const x = normals.getX(j) + normals.getX(n * m + j), y = normals.getY(j) + normals.getY(n * m + j), z = normals.getZ(j) + normals.getZ(n * m + j);
        const length = Math.hypot(x, y, z) || 1;
        normals.setXYZ(j, x / length, y / length, z / length);
        normals.setXYZ(n * m + j, x / length, y / length, z / length);
    }
    return geometry;
}
function picture(canvas, repeatX = 1, repeatY = 1, color = true) {
    const texture = new CanvasTexture(canvas);
    if (color)
        texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    return texture;
}
export class Stage {
    /**
     * @param fine the heavier look: sharper shadows, varnish and wool sheen (computers and tablets)
     */
    constructor(host, fine) {
        this.host = host;
        this.fine = fine;
        this.scene = new Scene();
        this.camera = new PerspectiveCamera(40, 1, .04, 40);
        /** The cards and the draw pile go in here */
        this.cards = new Group();
        /** Tokens of the players (they can be touched) */
        this.tokens = [];
        this.width = 1;
        this.height = 1;
        this.room = new Group();
        this.table = new Group();
        this.ray = new Raycaster();
        this.fx = new Group();
        this.plan = null;
        this.marksPicture = null;
        this.marksScale = 1;
        this.dirty = true;
        this.shadowsDirty = true;
        this.home = new Vector3();
        this.jolt = { x: 0, y: 0 };
        // region Drawing
        /** Something moved: the picture is drawn again at the next frame (nothing is drawn while the table is still) */
        this.invalidate = () => {
            this.dirty = true;
            this.shadowsDirty = true;
        };
        /** Only a light changed (the glow of the cards breathing): the shadows of the lamp stay as they are */
        this.repaint = () => {
            this.dirty = true;
        };
        this.tick = () => {
            if (!this.dirty)
                return;
            this.dirty = false;
            if (this.shadowsDirty)
                this.renderer.shadowMap.needsUpdate = true;
            this.shadowsDirty = false;
            this.renderer.render(this.scene, this.camera);
        };
        const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer = renderer;
        this.canvas = renderer.domElement;
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        renderer.outputColorSpace = SRGBColorSpace;
        renderer.toneMapping = NeutralToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = PCFShadowMap;
        // Drawn again only when something that casts a shadow moved (see invalidate)
        renderer.shadowMap.autoUpdate = false;
        this.canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(this.canvas);
        // One warm lamp above the table: everything else is its light coming back from the room
        this.lamp = new SpotLight(0xffe4c0, 8, 0, .9, .7, 2);
        this.lamp.castShadow = true;
        this.lamp.shadow.mapSize.set(fine ? 2048 : 1024, fine ? 2048 : 1024);
        this.lamp.shadow.bias = -.0004;
        this.lamp.shadow.normalBias = .0012;
        this.lamp.shadow.radius = fine ? 3 : 2;
        this.scene.add(this.lamp, this.lamp.target);
        // A second, narrow light on the player whose turn it is
        this.turnLight = new SpotLight(0xffffff, 0, 0, .17, 1, 2);
        this.scene.add(this.turnLight, this.turnLight.target);
        this.scene.add(new HemisphereLight(0xfff0dc, 0x1c130c, .22));
        this.scene.add(this.room, this.table, this.cards, this.fx);
        this.fxPictures = { ring: new CanvasTexture(ring()), spark: new CanvasTexture(spark()) };
        this.fxPictures.ring.colorSpace = this.fxPictures.spark.colorSpace = SRGBColorSpace;
        this.reflections();
        gsap.ticker.add(this.tick);
    }
    /**
     *  The picture follows the size of its place on the page
     * @returns true when the size changed
     */
    resize() {
        const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
        if (width === this.width && height === this.height)
            return false;
        this.width = width;
        this.height = height;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.invalidate();
        return true;
    }
    dispose() {
        gsap.ticker.remove(this.tick);
        gsap.killTweensOf(this.jolt);
        gsap.killTweensOf(this.turnLight);
        gsap.killTweensOf(this.turnLight.target.position);
        this.clear(this.room);
        this.clear(this.table);
        this.clear(this.fx);
        this.fxPictures.ring.dispose();
        this.fxPictures.spark.dispose();
        this.marksPicture?.dispose();
        this.scene.environment?.dispose();
        this.renderer.dispose();
        this.canvas.remove();
    }
    clear(group) {
        group.traverse(object => {
            const mesh = object;
            if (!mesh.isMesh)
                return;
            mesh.geometry.dispose();
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                for (const value of Object.values(material))
                    if (value?.isTexture)
                        value.dispose();
                material.dispose();
            }
        });
        group.clear();
    }
    /** What shiny things reflect: a dark room, the lamp above, two dim warm walls */
    reflections() {
        const room = new Scene();
        room.background = new Color(0x0a0705);
        const glow = (w, h, r, g, b) => new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color().setRGB(r, g, b), side: 2 }));
        const lamp = new Mesh(new CircleGeometry(.7, 32), new MeshBasicMaterial({ color: new Color().setRGB(13, 10, 6.5), side: 2 }));
        lamp.position.set(0, 2.6, 0);
        lamp.rotation.x = Math.PI / 2;
        const left = glow(4, 2.4, .7, .46, .26);
        left.position.set(-4, 1, 0);
        left.rotation.y = Math.PI / 2;
        const far = glow(5, 2, .34, .26, .2);
        far.position.set(0, 1.2, -4.5);
        const right = glow(2, 1.6, .5, .55, .7);
        right.position.set(4, 1.4, -1);
        right.rotation.y = -Math.PI / 2;
        const floor = glow(10, 10, .05, .035, .025);
        floor.position.y = -1;
        floor.rotation.x = Math.PI / 2;
        room.add(lamp, left, far, right, floor);
        const pmrem = new PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromScene(room, .035).texture;
        this.scene.environmentIntensity = .5;
        pmrem.dispose();
        room.traverse(object => {
            const mesh = object;
            if (!mesh.isMesh)
                return;
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
    }
    // endregion
    // region Building
    /** The table of a plan, its chairs and the tokens of the players, in the colours chosen on this device */
    build(plan, players, choice) {
        this.plan = plan;
        this.look = lookOf(choice);
        this.clear(this.room);
        this.clear(this.table);
        this.tokens.length = 0;
        this.marksPicture?.dispose();
        this.marksPicture = null;
        const look = this.look;
        const dark = shade(look.room, .28);
        this.scene.background = new Color(hexOf(dark));
        this.scene.fog = new FogExp2(hexOf(dark), .2);
        this.buildRoom(plan);
        this.buildTable(plan);
        // Chairs for the others (the camera sits on this device's), when the table is big enough for them to sit side by side
        const others = [...plan.seats.values()].filter(seat => !seat.own);
        const roomy = others.every(a => others.every(b => a === b || Math.hypot(a.chair.x - b.chair.x, a.chair.z - b.chair.z) > .47));
        for (const info of players) {
            const seat = plan.seats.get(info.id);
            if (!seat)
                continue;
            this.buildToken(seat, info);
            if (roomy && !seat.own)
                this.buildChair(seat);
        }
        const reach = Math.max(plan.a, plan.b);
        const height = 1.05 + reach * .7;
        this.lamp.position.set(0, height, .04);
        this.lamp.target.position.set(0, 0, 0);
        this.lamp.angle = Math.min(1.05, Math.atan((reach + .95) / height));
        this.lamp.intensity = 2.5 * height * height;
        this.lamp.shadow.camera.near = .3;
        this.lamp.shadow.camera.far = height + TABLE_H + .5;
        this.turnLight.position.set(0, height * .9, 0);
        this.turnLight.color.set(hexOf(mix(look.light, [255, 255, 255], .35)));
        this.invalidate();
    }
    buildRoom(plan) {
        const look = this.look;
        const floorColor = shade(mix(look.room, [112, 74, 44], .45), 1.5);
        const floor = new Mesh(new PlaneGeometry(16, 16), new MeshStandardMaterial({ map: picture(boards(floorColor), 12, 12), roughness: .62 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -TABLE_H;
        floor.receiveShadow = true;
        const field = shade(mix(look.room, look.cloth, .3), 1.25), border = shade(look.rimDark, 1.2);
        const w = plan.a * 2 + 1.5, d = plan.b * 2 + 1.5;
        const carpet = new Mesh(new PlaneGeometry(w, d), new MeshStandardMaterial({
            map: picture(rug(field, border, mix(look.inlay, border, .45), 768, Math.round(768 * d / w))), roughness: 1,
        }));
        carpet.rotation.x = -Math.PI / 2;
        carpet.position.y = -TABLE_H + .006;
        carpet.receiveShadow = true;
        // The wall at the end of the room: in the half-light, seen from the chair above the far players
        const paper = shade(mix(look.room, look.cloth, .12), 1.9);
        const end = new Mesh(new PlaneGeometry(16, 3), new MeshBasicMaterial({ map: picture(wall(paper, shade(look.rimDark, 1.5)), 4, 1) }));
        end.position.set(0, -TABLE_H + 1.5, -plan.b - 2.1);
        this.room.add(floor, carpet, end);
    }
    buildTable(plan) {
        const look = this.look;
        const fine = this.fine;
        const edge = outline(plan.a, plan.b, plan.r, .01);
        // Top: baize (or bare wood), with its fibres catching the light
        const shape = new Shape(edge.map(p => new Vector2(p.x, -p.z)));
        const topGeometry = new ShapeGeometry(shape);
        let top;
        if (look.wooden) {
            const map = picture(wood(look.cloth, 1024, 512), 1 / .9, 1 / .45);
            top = fine ? new MeshPhysicalMaterial({ map, roughness: .5, clearcoat: .5, clearcoatRoughness: .3 }) : new MeshStandardMaterial({ map, roughness: .45 });
        }
        else {
            const map = picture(clothColor(look.cloth), 1 / .34, 1 / .34);
            const normalMap = picture(clothRelief(), 1 / .05, 1 / .05, false);
            const sheen = fine ? { sheen: 1, sheenRoughness: .7, sheenColor: new Color(hexOf(shade(look.cloth, 1.5))) } : {};
            top = new (fine ? MeshPhysicalMaterial : MeshStandardMaterial)({ map, normalMap, normalScale: new Vector2(.55, .55), roughness: 1, ...sheen });
        }
        const cloth = new Mesh(topGeometry, top);
        cloth.rotation.x = -Math.PI / 2;
        cloth.receiveShadow = true;
        cloth.userData.table = true;
        // What is printed on the cloth: the shade of the rim, a line, the places of the cards (see marks)
        const longest = Math.max(plan.a, plan.b) * 2;
        this.marksScale = Math.min(1700, (fine ? 2048 : 1024) / longest);
        const print = document.createElement('canvas');
        print.width = Math.round(plan.a * 2 * this.marksScale);
        print.height = Math.round(plan.b * 2 * this.marksScale);
        this.marksPicture = new CanvasTexture(print);
        this.marksPicture.colorSpace = SRGBColorSpace;
        this.marksPicture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        const printed = new Mesh(new PlaneGeometry(plan.a * 2, plan.b * 2), new MeshStandardMaterial({
            map: this.marksPicture, transparent: true, roughness: 1, depthWrite: false,
            // Only a hair above the cloth, and never pulled forward: it must stay under the cards that lie on it
            polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -1,
        }));
        printed.rotation.x = -Math.PI / 2;
        printed.position.y = .0001;
        printed.receiveShadow = true;
        printed.renderOrder = 1;
        this.marks([]);
        // Rim: varnished wood, flat on top (the tokens sit on it), rounded on both sides
        const turns = Math.max(2, Math.round(pathLength(plan.a, plan.b, plan.r) / .7));
        const rimMap = picture(wood(look.rim), turns, 1);
        rimMap.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        const rimMaterial = fine
            ? new MeshPhysicalMaterial({ map: rimMap, roughness: .42, clearcoat: .85, clearcoatRoughness: .16 })
            : new MeshStandardMaterial({ map: rimMap, roughness: .4 });
        const rim = new Mesh(sweep(edge, [
            [0, -.002], [0, RIM_H - .006], [.0015, RIM_H - .0025], [.005, RIM_H - .0005], [.009, RIM_H], [.012, RIM_H],
            [RIM - .014, RIM_H], [RIM - .01, RIM_H], [RIM - .005, RIM_H - .001], [RIM - .0015, RIM_H - .004], [RIM, RIM_H - .009],
            [RIM, -.02], [RIM - .002, -.03], [RIM - .012, -.034],
        ], 1), rimMaterial);
        rim.castShadow = true;
        rim.receiveShadow = true;
        // A thin metal line between the cloth and the wood
        const inlay = new Mesh(sweep(edge, [[-.0035, .0009], [-.0005, .0016], [0, .0016]], 1), new MeshStandardMaterial({ color: hexOf(look.inlay), metalness: 1, roughness: .32 }));
        inlay.receiveShadow = true;
        // Under the top: the apron and four legs, mostly in the dark
        const darkWood = new MeshStandardMaterial({ color: hexOf(shade(look.rimDark, .9)), roughness: .55 });
        const apron = new Mesh(sweep(edge, [[RIM - .012, -.03], [RIM - .016, -.11], [RIM - .05, -.11]], 1), darkWood);
        apron.castShadow = true;
        const under = new Mesh(new ShapeGeometry(shape), darkWood);
        under.rotation.x = Math.PI / 2;
        under.position.y = -.03;
        under.castShadow = true;
        const legs = new Group();
        const legGeometry = new CylinderGeometry(.03, .021, TABLE_H - .1, 16);
        const lx = Math.max(.12, plan.a - .07), lz = Math.max(.12, plan.b - .07);
        const corner = plan.r * (1 - Math.SQRT1_2);
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const leg = new Mesh(legGeometry, darkWood);
            leg.position.set(sx * (lx - corner * .8), -.1 - (TABLE_H - .1) / 2, sz * (lz - corner * .8));
            leg.castShadow = true;
            legs.add(leg);
        }
        this.table.add(cloth, printed, rim, inlay, apron, under, legs);
    }
    buildToken(seat, info) {
        const top = new CanvasTexture(token(info.color, info.initial, theme().display));
        top.colorSpace = SRGBColorSpace;
        top.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        const side = new MeshStandardMaterial({ color: info.color, roughness: .45 });
        const mesh = new Mesh(new CylinderGeometry(.0185, .0185, .0042, 40), [side, new MeshStandardMaterial({ map: top, roughness: .45 }), side]);
        mesh.position.set(seat.token.x, RIM_H + .0021, seat.token.z);
        // The initial reads upright from this device's seat
        mesh.rotation.y = Math.PI / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.seat = info.id;
        this.tokens.push(mesh);
        this.table.add(mesh);
    }
    buildChair(seat) {
        const look = this.look;
        const frame = new MeshStandardMaterial({ color: hexOf(shade(look.rimDark, 1.3)), roughness: .45 });
        const leather = new MeshStandardMaterial({
            color: hexOf(shade(mix(look.rimDark, [70, 34, 24], .5), 1.1)), roughness: .5,
            ...(this.fine ? { normalMap: picture(leatherRelief(), 4, 4, false), normalScale: new Vector2(.5, .5) } : {}),
        });
        const chair = new Group();
        const cushion = new Mesh(new RoundedBoxGeometry(.43, .07, .42, 3, .028), leather);
        cushion.position.y = .46;
        // A padded back held by two posts, open above the seat
        const back = new Mesh(new RoundedBoxGeometry(.4, .27, .05, 3, .024), leather);
        back.position.set(0, .8, .225);
        back.rotation.x = .13;
        const postGeometry = new CylinderGeometry(.014, .014, .34, 10);
        for (const sx of [-1, 1]) {
            const post = new Mesh(postGeometry, frame);
            post.position.set(sx * .15, .6, .2);
            post.rotation.x = .13;
            post.castShadow = true;
            chair.add(post);
        }
        const legGeometry = new CylinderGeometry(.018, .014, .43, 10);
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const leg = new Mesh(legGeometry, frame);
            leg.position.set(sx * .18, .215, sz * .17);
            leg.castShadow = true;
            chair.add(leg);
        }
        const rail = new Mesh(new BoxGeometry(.4, .03, .03), frame);
        rail.position.set(0, .4, .19);
        for (const part of [cushion, back, rail]) {
            part.castShadow = true;
            part.receiveShadow = true;
            chair.add(part);
        }
        chair.position.set(seat.chair.x, -TABLE_H, seat.chair.z);
        chair.rotation.y = seat.yaw;
        this.room.add(chair);
    }
    /**
     *  Printed on the cloth: the soft shade along the rim, a thin line, and the places of the cards
     *  (hands and discard pile), so that an empty place still shows
     */
    marks(places) {
        const plan = this.plan, texture = this.marksPicture;
        if (!plan || !texture)
            return;
        const c = texture.image;
        const ctx = c.getContext('2d');
        const k = this.marksScale;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.setTransform(k, 0, 0, k, plan.a * k, plan.b * k);
        const trace = (inset) => {
            ctx.beginPath();
            ctx.roundRect(-plan.a + inset, -plan.b + inset, (plan.a - inset) * 2, (plan.b - inset) * 2, Math.max(.001, plan.r - inset));
        };
        // The rim keeps the light off the edge of the cloth
        ctx.save();
        trace(0);
        ctx.clip();
        ctx.strokeStyle = 'rgba(0, 0, 0, .075)';
        for (let i = 0; i < 9; i++) {
            ctx.lineWidth = .09 - i * .01;
            trace(0);
            ctx.stroke();
        }
        ctx.restore();
        const ink = this.look.ink;
        if (!this.look.wooden) {
            ctx.strokeStyle = css(ink, .3);
            ctx.lineWidth = .0012;
            trace(.0085);
            ctx.stroke();
        }
        for (const place of places) {
            ctx.save();
            ctx.translate(place.x, place.z);
            ctx.rotate(-place.yaw);
            ctx.beginPath();
            ctx.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_W * .075);
            ctx.fillStyle = 'rgba(0, 0, 0, .1)';
            ctx.fill();
            ctx.strokeStyle = css(ink, .2);
            ctx.lineWidth = .0009;
            ctx.stroke();
            ctx.restore();
        }
        texture.needsUpdate = true;
        this.invalidate();
    }
    // endregion
    // region Camera
    /**
     *  Put the camera where the whole game shows, as big as the screen allows
     * @param margin pixels kept free: top (bar and instructions), bottom, sides
     */
    frame(margin) {
        const plan = this.plan;
        if (!plan)
            return;
        this.camera.fov = plan.fov;
        let points = plan.mustSee;
        if (plan.rig === 'mobile') {
            // On a wide upright screen (a tablet) the cards would get huge: more of the table is shown instead
            const own = [...plan.seats.values()].find(seat => seat.own);
            const half = this.width / 2 / OWN_CARD_MAX * CARD_W;
            if (own)
                points = [...points, [-half, 0, own.z], [half, 0, own.z]];
        }
        const free = { top: margin.top / this.height, bottom: margin.bottom / this.height, side: margin.side / this.width };
        // Looking down as little as possible: the first angle at which the width of the screen, not its height, limits
        // the picture (a long table is then seen more from above, instead of from further away).
        // When the height limits it at every angle: the angle that shows the table biggest.
        let pitch = plan.pitchMin;
        let at = fitCamera(points, pitch, plan.fov, this.width / this.height, free, plan.align);
        for (let angle = plan.pitchMin + 1; at.tall && angle <= plan.pitch; angle++) {
            const other = fitCamera(points, angle, plan.fov, this.width / this.height, free, plan.align);
            if (!other.tall || other.back < at.back) {
                at = other;
                pitch = angle;
            }
        }
        this.home.set(at.x, at.y, at.z);
        this.camera.rotation.set(-pitch * Math.PI / 180, 0, 0);
        this.placeCamera();
        this.camera.updateProjectionMatrix();
        this.invalidate();
    }
    placeCamera() {
        this.camera.position.set(this.home.x + this.jolt.x, this.home.y + this.jolt.y, this.home.z);
        this.camera.updateMatrixWorld();
    }
    /** « Dutch ! »: the table gets a knock */
    knock() {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
        gsap.fromTo(this.jolt, { x: -.012, y: .006 }, { x: 0, y: 0, duration: .7, ease: 'elastic.out(1.4, .22)', onUpdate: () => {
                this.placeCamera();
                this.invalidate();
            } });
    }
    /** A point of the room on the screen, in pixels from the top left corner of the table */
    toScreen(x, y, z) {
        const v = new Vector3(x, y, z).project(this.camera);
        return { x: (v.x * .5 + .5) * this.width, y: (-v.y * .5 + .5) * this.height };
    }
    /** How wide a card looks at this point, in pixels */
    cardWidthAt(x, y, z) {
        const distance = new Vector3(x, y, z).sub(this.camera.position).dot(this.camera.getWorldDirection(new Vector3()));
        return CARD_W / (2 * Math.max(.01, distance) * Math.tan(this.camera.fov * Math.PI / 360)) * this.height;
    }
    /**
     *  How to hold a card up so that it can be read: lifted off a point of the table, towards the eye, turned to face
     *  the camera, and shown `width` pixels wide. It stays close to the table (its shadow falls next to it):
     *  what the lift does not give in size, the card gets by being shown bigger.
     * @param lift height above the table
     * @param most how much bigger than a real card it may be shown
     */
    heldUp(x, z, lift, width, most = 2.6) {
        const eye = this.home;
        const at = new Vector3(x, 0, z).sub(eye).multiplyScalar((eye.y - lift) / eye.y).add(eye);
        const back = eye.clone().sub(at).normalize();
        const scale = Math.max(1, Math.min(most, width / this.cardWidthAt(at.x, at.y, at.z)));
        const tilt = Math.acos(Math.max(-1, Math.min(1, back.y)));
        // Its bottom edge stays above the cloth
        const y = Math.max(at.y, scale * CARD_H / 2 * Math.sin(tilt) + .012);
        return { x: at.x, y, z: at.z, yaw: Math.atan2(back.x, back.z), tilt, scale };
    }
    aim(clientX, clientY) {
        const box = this.canvas.getBoundingClientRect();
        this.ray.setFromCamera(new Vector2((clientX - box.left) / box.width * 2 - 1, -(clientY - box.top) / box.height * 2 + 1), this.camera);
    }
    /** First of these objects under a point of the screen */
    pick(clientX, clientY, objects) {
        this.aim(clientX, clientY);
        return this.ray.intersectObjects(objects, false)[0]?.object ?? null;
    }
    /** The point above the table, at `height`, under a point of the screen */
    over(clientX, clientY, height) {
        this.aim(clientX, clientY);
        return this.ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -height), new Vector3());
    }
    // endregion
    // region Light and effects
    /** The light of the turn goes to a hand (null: nobody's turn) */
    light(seat, instant = false) {
        const duration = instant ? 0 : .6;
        if (!seat) {
            gsap.to(this.turnLight, { intensity: 0, duration, overwrite: true, onUpdate: this.repaint });
            return;
        }
        const from = this.turnLight.position;
        const distance = Math.hypot(from.x - seat.x, from.y, from.z - seat.z);
        this.turnLight.angle = Math.atan(.16 / distance);
        gsap.to(this.turnLight.target.position, { x: seat.x, y: 0, z: seat.z, duration, ease: 'power2.inOut', overwrite: true });
        gsap.to(this.turnLight, { intensity: 2.6 * distance * distance, duration, overwrite: true, onUpdate: this.repaint });
    }
    /** A card lands well: a flash and a ring of light that widens on the cloth, a few specks that fly off */
    burst(x, z) {
        const flat = (texture, size) => {
            const mesh = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({
                map: texture, transparent: true, blending: AdditiveBlending, depthWrite: false, depthTest: false,
            }));
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(x, .004, z);
            mesh.renderOrder = 5;
            this.fx.add(mesh);
            return mesh;
        };
        const done = (mesh) => () => {
            mesh.removeFromParent();
            mesh.geometry.dispose();
            mesh.material.dispose();
            this.invalidate();
        };
        const wave = flat(this.fxPictures.ring, CARD_H);
        gsap.to(wave.scale, { x: 4.2, y: 4.2, duration: .75, ease: 'power2.out', onUpdate: this.invalidate });
        gsap.to(wave.material, { opacity: 0, duration: .75, ease: 'sine.in', onComplete: done(wave) });
        const flash = flat(this.fxPictures.spark, CARD_H * 2.2);
        gsap.to(flash.scale, { x: 2.4, y: 2.4, duration: .5, ease: 'sine.out' });
        gsap.to(flash.material, { opacity: 0, duration: .55, ease: 'sine.in', onComplete: done(flash) });
        const spin = Math.random() < .5 ? 1 : -1;
        for (let i = 0; i < 14; i++) {
            const speck = flat(this.fxPictures.spark, .016 + Math.random() * .014);
            const start = i / 14 * Math.PI * 2 + Math.random() * .3, reach = .09 + Math.random() * .08;
            const path = { p: 0 };
            gsap.to(path, {
                p: 1, duration: .8 + Math.random() * .35, ease: 'power3.out',
                onUpdate: () => {
                    const angle = start + spin * path.p * .9;
                    speck.position.set(x + Math.cos(angle) * reach * path.p, .004 + Math.sin(path.p * Math.PI) * .03, z + Math.sin(angle) * reach * path.p);
                    speck.material.opacity = 1 - path.p * path.p;
                },
                onComplete: done(speck),
            });
        }
    }
}
