import * as THREE from 'three';

type EasingFn = (t: number) => number;
const easeOut: EasingFn = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut: EasingFn = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** A single tween managed by the central Tweener */
interface TweenEntry {
  elapsed: number;
  duration: number;
  easing: EasingFn;
  onUpdate: (t: number) => void;
  onDone?: () => void;
}

/** Central tween utility — no setTimeout chains */
export class Tweener {
  private tweens: TweenEntry[] = [];

  add(opts: Omit<TweenEntry, 'elapsed'>): void {
    this.tweens.push({ elapsed: 0, ...opts });
  }

  update(dt: number): void {
    this.tweens = this.tweens.filter((tw) => {
      tw.elapsed += dt;
      const t = Math.min(tw.elapsed / tw.duration, 1);
      tw.onUpdate(tw.easing(t));
      if (t >= 1) {
        tw.onDone?.();
        return false;
      }
      return true;
    });
  }
}

export class EffectsManager {
  private scene: THREE.Scene;
  private tweener: Tweener;
  private particles: THREE.Points[] = [];
  private debris: THREE.Mesh[] = [];
  private floatingTexts: Array<{ mesh: THREE.Sprite; born: number }> = [];
  private disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  constructor(scene: THREE.Scene, tweener: Tweener) {
    this.scene = scene;
    this.tweener = tweener;
  }

  /** Dust ring on landing */
  spawnLandingDust(x: number, y: number, z: number): void {
    const count = 20;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      positions[i * 3] = x + Math.cos(angle) * 1.5;
      positions[i * 3 + 1] = y + 0.2;
      positions[i * 3 + 2] = z + Math.sin(angle) * 1.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.disposables.push(geo);
    const mat = new THREE.PointsMaterial({ color: 0xaabbff, size: 0.3, transparent: true, depthWrite: false });
    this.disposables.push(mat);
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.particles.push(pts);

    const posArr = geo.attributes['position'] as THREE.BufferAttribute;
    const startY = y + 0.2;
    this.tweener.add({
      duration: 500,
      easing: easeOut,
      onUpdate: (t) => {
        mat.opacity = 1 - t;
        for (let i = 0; i < count; i++) {
          posArr.setY(i, startY + t * 1.5);
          const a = (i / count) * Math.PI * 2;
          posArr.setX(i, x + Math.cos(a) * (1.5 + t * 1.5));
          posArr.setZ(i, z + Math.sin(a) * (1.5 + t * 1.5));
        }
        posArr.needsUpdate = true;
      },
      onDone: () => {
        this.scene.remove(pts);
        this.particles = this.particles.filter((p) => p !== pts);
        geo.dispose(); mat.dispose();
      },
    });
  }

  /** Gold collect: 12 sparkles */
  spawnGoldSparkles(x: number, y: number, z: number): void {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const geo = new THREE.SphereGeometry(0.15, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
      this.disposables.push(geo, mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + 1, z);
      this.scene.add(mesh);

      const vx = Math.cos(angle) * 2;
      const vz = Math.sin(angle) * 2;
      const vy = 2 + Math.random() * 2;
      this.tweener.add({
        duration: 800,
        easing: easeOut,
        onUpdate: (t) => {
          mesh.position.x = x + vx * t;
          mesh.position.y = y + 1 + vy * t - 4 * t * t;
          mesh.position.z = z + vz * t;
          mat.opacity = 1 - t;
        },
        onDone: () => {
          this.scene.remove(mesh);
          geo.dispose(); mat.dispose();
        },
      });
    }
  }

  /** Building collapse: 8-12 debris boxes fall with gravity */
  spawnCollapse(x: number, _y: number, z: number, roofHeight: number): void {
    const count = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const w = 0.3 + Math.random() * 0.5;
      const geo = new THREE.BoxGeometry(w, w, w);
      const mat = new THREE.MeshStandardMaterial({ color: 0x1b2347, roughness: 0.9 });
      this.disposables.push(geo, mat);
      const mesh = new THREE.Mesh(geo, mat);
      const startX = x + (Math.random() - 0.5) * 2;
      const startZ = z + (Math.random() - 0.5) * 2;
      mesh.position.set(startX, roofHeight, startZ);
      this.scene.add(mesh);
      this.debris.push(mesh);

      const vx = (Math.random() - 0.5) * 3;
      const vy = 1 + Math.random() * 2;
      const vz = (Math.random() - 0.5) * 3;
      this.tweener.add({
        duration: 800,
        easing: easeInOut,
        onUpdate: (t) => {
          mesh.position.x = startX + vx * t;
          mesh.position.y = roofHeight + vy * t - 5 * t * t;
          mesh.position.z = startZ + vz * t;
          mesh.rotation.x = t * Math.PI * 2;
          mesh.rotation.z = t * Math.PI;
          mat.opacity = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
          mat.transparent = t > 0.6;
        },
        onDone: () => {
          this.scene.remove(mesh);
          this.debris = this.debris.filter((d) => d !== mesh);
          geo.dispose(); mat.dispose();
        },
      });
    }
  }

  /** Win confetti of emissive cubes */
  spawnWinConfetti(x: number, y: number, z: number): void {
    const confettiColors = [0xff4fa3, 0x34e0ff, 0xffb347, 0x9b7bff];
    for (let i = 0; i < 30; i++) {
      const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      const mat = new THREE.MeshStandardMaterial({
        color: confettiColors[i % confettiColors.length],
        emissive: confettiColors[i % confettiColors.length],
        emissiveIntensity: 1,
      });
      this.disposables.push(geo, mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);

      const angle = (i / 30) * Math.PI * 2;
      const speed = 3 + Math.random() * 4;
      const vx = Math.cos(angle) * speed;
      const vy = 4 + Math.random() * 6;
      const vz = Math.sin(angle) * speed;

      this.tweener.add({
        duration: 1500,
        easing: easeOut,
        onUpdate: (t) => {
          mesh.position.x = x + vx * t;
          mesh.position.y = y + vy * t - 8 * t * t;
          mesh.position.z = z + vz * t;
          mesh.rotation.x = t * Math.PI * 4;
          mesh.rotation.z = t * Math.PI * 3;
          mat.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
          mat.transparent = t > 0.7;
        },
        onDone: () => {
          this.scene.remove(mesh);
          geo.dispose(); mat.dispose();
        },
      });
    }
  }

  /** Floating text (+0 or +50 GOLD) that rises and fades */
  spawnFloatingText(x: number, y: number, z: number, text: string): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = text.includes('GOLD') ? '#ffb347' : '#34e0ff';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Use textContent equivalent — fillText is safe
    ctx.fillText(text, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    this.disposables.push(tex, mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1, 1);
    sprite.position.set(x, y + 2, z);
    this.scene.add(sprite);
    this.floatingTexts.push({ mesh: sprite, born: Date.now() });

    const startY = y + 2;
    this.tweener.add({
      duration: 1200,
      easing: easeOut,
      onUpdate: (t) => {
        sprite.position.y = startY + t * 2;
        mat.opacity = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      },
      onDone: () => {
        this.scene.remove(sprite);
        this.floatingTexts = this.floatingTexts.filter((f) => f.mesh !== sprite);
        tex.dispose(); mat.dispose();
      },
    });
  }

  dispose(): void {
    for (const p of this.particles) this.scene.remove(p);
    for (const d of this.debris) this.scene.remove(d);
    for (const f of this.floatingTexts) this.scene.remove(f.mesh);
    for (const d of this.disposables) d.dispose();
    this.particles = []; this.debris = []; this.floatingTexts = []; this.disposables = [];
  }
}
