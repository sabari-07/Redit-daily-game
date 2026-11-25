import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

export type QualityTier = 'high' | 'medium' | 'low';

function detectTier(): QualityTier {
  const isMobile = window.matchMedia('(pointer: coarse)').matches;
  const dpr = window.devicePixelRatio;
  const cores = navigator.hardwareConcurrency ?? 2;
  if (!isMobile && dpr >= 1.5 && cores >= 4) return 'high';
  if (cores >= 2 && dpr >= 1) return 'medium';
  return 'low';
}

export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  tier: QualityTier;

  private frameTimeSamples: number[] = [];
  private lastFrameTime = 0;
  private degradeTimer = 0;
  private paused = false;
  private visibilityHandler: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.tier = detectTier();

    // Native MSAA on every tier: phones render straight to the screen, so this is what keeps edges smooth.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.tier !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Render at the screen's real sharpness (phones are 2-3x). Capped at 2 for speed; it only drops if the device is too slow.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Pause rendering when tab is hidden
    this.visibilityHandler = () => {
      this.paused = document.hidden;
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /** Sets up the post-processing composer for a given scene */
  setupComposer(scene: THREE.Scene): void {
    // Only desktops get bloom + SMAA. Phones render directly with native MSAA: the composer's
    // render targets have no anti-aliasing, which made the phone view look soft and jagged.
    if (this.tier !== 'high') return;

    const { width, height } = this.getSize();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));

    const bloomStrength = this.tier === 'high' ? 0.22 : 0.16;
    const bloomRadius = this.tier === 'high' ? 0.6 : 0.3;
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      bloomStrength,
      bloomRadius,
      0.92
    );
    this.composer.addPass(this.bloomPass);

    if (this.tier === 'high') {
      this.composer.addPass(new SMAAPass(width, height));
    }
    this.composer.addPass(new OutputPass());
  }

  getSize(): { width: number; height: number } {
    return { width: this.renderer.domElement.clientWidth, height: this.renderer.domElement.clientHeight };
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setSize(w, h);
      this.bloomPass?.setSize(w, h);
    }
  }

  /** Renders a frame. Returns false if paused. */
  render(scene: THREE.Scene, now: number): boolean {
    if (this.paused) return false;

    const dt = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // Auto-degrade quality if frame time consistently > 24ms
    if (this.tier !== 'low' && dt > 0 && dt < 500) {
      this.frameTimeSamples.push(dt);
      if (this.frameTimeSamples.length > 60) this.frameTimeSamples.shift();
      const avg = this.frameTimeSamples.reduce((a, b) => a + b, 0) / this.frameTimeSamples.length;
      if (avg > 24) {
        this.degradeTimer += dt;
        if (this.degradeTimer > 2000) {
          this.tier = this.tier === 'high' ? 'medium' : 'low';
          if (this.tier === 'low') {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            this.resize();
          }
          this.degradeTimer = 0;
          this.frameTimeSamples = [];
        }
      } else {
        this.degradeTimer = 0;
      }
    }

    if (this.composer && this.tier === 'high') {
      this.composer.render();
    } else {
      this.renderer.render(scene, this.camera);
    }
    return true;
  }

  /** Pulses bloom strength for win effect */
  setBloomStrength(strength: number): void {
    if (this.bloomPass) this.bloomPass.strength = strength;
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    if (this.composer) {
      this.composer.passes.forEach((p) => p.dispose?.());
    }
    this.renderer.dispose();
  }
}
