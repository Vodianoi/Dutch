import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 *  The finish of a photograph, for the devices that can afford it: the picture is computed with its real light
 *  (far brighter than a screen can show), the brightest glints of brass and varnish bleed a little like in a lens,
 *  then everything is brought back to what the screen shows. Loaded only when it is used.
 */
export interface Finish {
    render(): void;
    setSize(w: number, h: number, pixelRatio: number): void;
    dispose(): void;
}

export function finish(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Finish {
    const size = renderer.getSize(new THREE.Vector2());
    // Smooth edges: the picture is drawn with 4 samples per pixel
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {type: THREE.HalfFloatType, samples: 4});
    const composer = new EffectComposer(renderer, target);
    const bloom = new UnrealBloomPass(size.clone(), .14, .55, 1.25);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return {
        render: () => composer.render(),
        setSize(w, h, pixelRatio) {
            composer.setPixelRatio(pixelRatio);
            composer.setSize(w, h);
        },
        dispose() {
            bloom.dispose();
            composer.dispose();
            target.dispose();
        },
    };
}
