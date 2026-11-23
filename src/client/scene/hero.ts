import * as THREE from 'three';
import type { Tweener } from './effects.js';
import type { Tool } from '../../shared/types.js';

const FLOOR_HEIGHT = 1.6;
/** Roof top above the wall top: base plinth 0.14 + roof cap 0.32 (see buildings.ts). */
const ROOF_TOP = 0.46;
const SCALE = 2.3;

const SUIT = 0x1d4ed8;
const CAPE = 0xd62828;
const GOLD = 0xffc233;
const SKIN = 0xf1c27d;
const HAIR = 0x1b1410;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Five-point star outline (the hero's chest emblem; an original mark, not a real brand). */
function starShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/**
 * The player's caped hero. Stands hands-on-hips with a fluttering cape, crouches, then
 * flies to the next roof fist-first with the cape streaming behind, and lands upright.
 * Shows through buildings as an orange silhouette and always carries a "YOU" tag.
 */
export class Hero {
  readonly group = new THREE.Group();
  private readonly scene: THREE.Scene;
  private readonly model = new THREE.Group();
  /** Pivot at the hips: pitched forward to fly. */
  private readonly body = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly cape: THREE.Mesh;
  private readonly capeBase: Float32Array;
  private readonly marker: THREE.Sprite;
  private disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  private grappleLine: THREE.Line | null = null;
  private pathLine: THREE.Line | null = null;
  private pathPoints: THREE.Vector3[] = [];
  private time = 0;
  /** 0 = standing, 1 = full flying pose. */
  private fly = 0;
  private gliding = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const mat = (color: number, rough = 0.55, metal = 0.05): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      this.disposables.push(m);
      return m;
    };
    const geo = <G extends THREE.BufferGeometry>(g: G): G => {
      this.disposables.push(g);
      return g;
    };
    const suit = mat(SUIT, 0.45, 0.1);
    const red = mat(CAPE, 0.6);
    const gold = mat(GOLD, 0.35, 0.6);
    const skin = mat(SKIN, 0.7);
    const hair = mat(HAIR, 0.8);

    const part = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Body pivots at the hips (y = 0.78) so the whole hero tilts into flight.
    this.body.position.y = 0.78;
    this.model.add(this.body);

    // Legs with boots.
    for (const [leg, x] of [[this.legR, -0.1], [this.legL, 0.1]] as const) {
      leg.position.set(x, 0, 0);
      this.body.add(leg);
      part(geo(new THREE.CapsuleGeometry(0.085, 0.42, 4, 10)), suit, leg, 0, -0.3, 0);
      part(geo(new THREE.CapsuleGeometry(0.095, 0.14, 4, 10)), red, leg, 0, -0.66, 0.01);
    }
    // Belt and torso.
    part(geo(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 16)), gold, this.body, 0, 0.0, 0).scale.set(1, 1, 0.72);
    const torso = part(geo(new THREE.CapsuleGeometry(0.19, 0.3, 6, 14)), suit, this.body, 0, 0.27, 0);
    torso.scale.set(1.05, 1, 0.72);
    const emblem = part(geo(new THREE.ShapeGeometry(starShape(0.085))), gold, this.body, 0, 0.33, 0.142);
    emblem.castShadow = false;

    // Head.
    part(geo(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10)), skin, this.body, 0, 0.55, 0);
    part(geo(new THREE.SphereGeometry(0.14, 18, 14)), skin, this.body, 0, 0.7, 0.01);
    const hairCap = part(geo(new THREE.SphereGeometry(0.148, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair, this.body, 0, 0.72, -0.01);
    hairCap.rotation.x = -0.25;
    const eyeG = geo(new THREE.SphereGeometry(0.018, 8, 6));
    const eyeM = mat(0x16202e, 0.3);
    part(eyeG, eyeM, this.body, -0.05, 0.71, 0.13);
    part(eyeG, eyeM, this.body, 0.05, 0.71, 0.13);

    // Arms pivot at the shoulders.
    for (const [arm, x] of [[this.armR, -0.25], [this.armL, 0.25]] as const) {
      arm.position.set(x, 0.44, 0);
      this.body.add(arm);
      part(geo(new THREE.CapsuleGeometry(0.062, 0.34, 4, 10)), suit, arm, 0, -0.2, 0);
      part(geo(new THREE.SphereGeometry(0.07, 12, 10)), red, arm, 0, -0.43, 0);
    }

    // Cape: a subdivided plane hanging from the shoulders, animated every frame.
    const capeGeo = geo(new THREE.PlaneGeometry(0.5, 1.0, 6, 12));
    const pos = capeGeo.attributes['position'] as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const v = (0.5 - pos.getY(i)) / 1.0; // 0 at the shoulders, 1 at the hem
      pos.setX(i, pos.getX(i) * (1 + v * 0.7)); // flare out toward the hem
      pos.setY(i, -v * 1.0);
    }
    this.capeBase = Float32Array.from(pos.array as ArrayLike<number>);
    const capeMat = new THREE.MeshStandardMaterial({ color: CAPE, roughness: 0.7, side: THREE.DoubleSide });
    this.disposables.push(capeMat);
    this.cape = new THREE.Mesh(capeGeo, capeMat);
    this.cape.position.set(0, 0.47, -0.14);
    this.cape.castShadow = true;
    this.body.add(this.cape);

    this.model.scale.setScalar(SCALE);
    this.group.add(this.model);
    this.addXray();
    this.marker = this.makeMarker();
    this.group.add(this.marker);
    this.setPose(0, 0);
    scene.add(this.group);
  }

  /** Orange silhouette drawn only where a building hides the hero (GreaterDepth). */
  private addXray(): void {
    // Opaque (not transparent) so it is drawn in the opaque pass right after the city and BEFORE
    // the hero (renderOrder 1 < 2): it only shows where a building hides him, never over himself.
    const xray = new THREE.MeshBasicMaterial({
      color: 0xffb300,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      side: THREE.DoubleSide,
    });
    this.disposables.push(xray);
    const meshes: THREE.Mesh[] = [];
    this.model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    for (const m of meshes) {
      m.renderOrder = 2;
      const ghost = new THREE.Mesh(m.geometry, xray);
      ghost.renderOrder = 1;
      m.add(ghost); // child of the real part, so it follows every animation
    }
  }

  private makeMarker(): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 150;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffb300';
    g.strokeStyle = '#1a1200';
    g.lineWidth = 8;
    g.beginPath();
    g.roundRect(18, 10, 220, 78, 22);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(104, 88);
    g.lineTo(128, 138);
    g.lineTo(152, 88);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#1a1200';
    g.font = 'bold 54px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('YOU', 128, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true });
    this.disposables.push(mat, tex);
    const s = new THREE.Sprite(mat);
    s.scale.set(0.105, 0.0615, 1);
    s.position.set(0, 4.9, 0);
    s.renderOrder = 999;
    s.raycast = () => {};
    return s;
  }

  /** Blends between the standing pose (f = 0) and the flying pose (f = 1). */
  private setPose(f: number, pitch: number): void {
    this.fly = f;
    this.body.rotation.x = lerp(-0.04, pitch, f);
    // Standing: fists on hips. Flying: right fist forward over the head, left arm trailing.
    this.armR.rotation.set(lerp(0.15, -2.95, f), 0, lerp(-0.5, -0.08, f));
    this.armL.rotation.set(lerp(0.15, 0.2, f), 0, lerp(0.5, 0.12, f));
    this.legR.rotation.set(lerp(0, -0.06, f), 0, lerp(-0.04, 0, f));
    this.legL.rotation.set(lerp(0, 0.22, f), 0, lerp(0.04, 0, f));
  }

  getPosition(): THREE.Vector3 {
    return this.group.position;
  }

  /** Turns the hero to face a point on the map (e.g. the Summit). */
  lookToward(x: number, z: number): void {
    const p = this.group.position;
    if (Math.abs(x - p.x) + Math.abs(z - p.z) > 0.01) this.group.rotation.y = Math.atan2(x - p.x, z - p.z);
  }

  placeOnBuilding(x: number, z: number, height: number): void {
    this.group.position.set(x, height * FLOOR_HEIGHT + ROOF_TOP, z);
    this.group.scale.set(1, 1, 1);
    this.setPose(0, 0);
  }

  /** Crouch, fly fist-first along an arc to the target roof, land upright. */
  animateJump(
    fromX: number, fromZ: number, fromH: number,
    toX: number, toZ: number, toH: number,
    tool: Tool,
    tweener: Tweener,
    onDone?: () => void
  ): void {
    const fromY = fromH * FLOOR_HEIGHT + ROOF_TOP;
    const toY = toH * FLOOR_HEIGHT + ROOF_TOP;
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const dist = Math.hypot(dx, dz);
    const apex = (tool === 'glide' ? 0.15 : 0.3) * dist + (tool === 'grapple' ? 1.2 : 1.8);
    const duration = Math.min(1150, Math.max(650, dist * 55)) * (tool === 'glide' ? 1.35 : 1);
    if (dist > 0.01) this.group.rotation.y = Math.atan2(dx, dz);
    this.gliding = tool === 'glide';
    if (tool === 'grapple') this.showGrappleLine(fromX, fromY + 3.2, fromZ, toX, toY + 0.2, toZ);

    tweener.add({
      duration,
      easing: (t) => t,
      onUpdate: (t) => {
        const pt = smooth(0.1, 0.92, t); // position along the arc (waits for the crouch)
        const y = fromY + (toY - fromY) * pt + apex * Math.sin(Math.PI * pt);
        this.group.position.set(fromX + dx * pt, y, fromZ + dz * pt);
        // Nose up while rising, level at the top, nose down into the landing.
        const flyPitch = 1.35 + 0.35 * (pt * 2 - 1) - (tool === 'grapple' ? 0.35 : 0);
        const f = smooth(0.06, 0.2, t) * (1 - smooth(0.84, 0.97, t));
        this.setPose(f, flyPitch);
        const crouch = t < 0.12 ? Math.sin((t / 0.12) * Math.PI) * 0.16 : 0;
        const land = t > 0.9 ? Math.sin(((t - 0.9) / 0.1) * Math.PI) * 0.12 : 0;
        this.group.scale.set(1 + crouch * 0.4 + land * 0.4, 1 - crouch - land, 1 + crouch * 0.4 + land * 0.4);
      },
      onDone: () => {
        this.group.position.set(toX, toY, toZ);
        this.group.scale.set(1, 1, 1);
        this.setPose(0, 0);
        this.gliding = false;
        this.removeGrappleLine();
        this.pathPoints.push(new THREE.Vector3(toX, toY + 0.1, toZ));
        this.updatePathLine();
        onDone?.();
      },
    });
  }

  private showGrappleLine(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): void {
    this.removeGrappleLine();
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(fx, fy, fz), new THREE.Vector3(tx, ty, tz)]);
    this.grappleLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffb347 }));
    this.scene.add(this.grappleLine);
  }

  private removeGrappleLine(): void {
    if (!this.grappleLine) return;
    this.scene.remove(this.grappleLine);
    this.grappleLine.geometry.dispose();
    (this.grappleLine.material as THREE.Material).dispose();
    this.grappleLine = null;
  }

  private updatePathLine(): void {
    this.removePathLine();
    if (this.pathPoints.length < 2) return;
    const geo = new THREE.BufferGeometry().setFromPoints(this.pathPoints);
    this.pathLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x34e0ff, transparent: true, opacity: 0.55 }));
    this.scene.add(this.pathLine);
  }

  private removePathLine(): void {
    if (!this.pathLine) return;
    this.scene.remove(this.pathLine);
    this.pathLine.geometry.dispose();
    (this.pathLine.material as THREE.Material).dispose();
    this.pathLine = null;
  }

  clearPath(): void {
    this.pathPoints = [];
    this.removePathLine();
  }

  /** Per frame: cape flutter, hover bob, breathing, YOU tag bob. */
  update(dt: number): void {
    this.time += dt * 0.001;
    const t = this.time;
    const f = this.fly;
    const pos = this.cape.geometry.attributes['position'] as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const base = this.capeBase;
    // Standing: hangs with a gentle breeze. Flying: lifts off the back and ripples fast.
    const lift = lerp(0.1, this.gliding ? 0.75 : 0.55, f);
    const speed = lerp(2.2, 11, f);
    const amp = lerp(0.035, 0.11, f);
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const v = -y; // 0 at the shoulders, 1 at the hem
      arr[i * 3] = x * (1 + (this.gliding ? 0.35 : 0) * f * v);
      arr[i * 3 + 2] = -Math.pow(v, 1.5) * lift + Math.sin(t * speed - v * 5 + x * 4) * amp * v;
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();

    if (f === 0) {
      this.model.position.y = Math.sin(t * 2) * 0.03;
      this.body.scale.y = 1 + Math.sin(t * 2.6) * 0.008;
    } else {
      this.model.position.y = 0;
      this.body.rotation.z = Math.sin(t * 3) * 0.05 * f; // slight bank in flight
    }
    this.marker.position.y = 4.9 + Math.sin(t * 3.2) * 0.15;
  }

  dispose(): void {
    this.removeGrappleLine();
    this.removePathLine();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.scene.remove(this.group);
  }
}
