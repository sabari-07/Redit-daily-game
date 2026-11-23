import * as THREE from 'three';
import type { City } from '../../shared/types.js';
import { fnv1a, mulberry32 } from '../../shared/rng.js';

const FLOOR_HEIGHT = 1.6;
const ROOF_TOP = 0.32; // cap height above the wall top
const SLAB_H = 0.14;
/** Sidewalk margin around each building (kept narrow so the streets between lots show). */
const SIDEWALK = 0.6;

const noRaycast = (): void => {};

/**
 * Street-level and rooftop details, all built with InstancedMesh so the whole set
 * costs ~10 draw calls: sidewalk lots, trees, street lamps, parked cars, rooftop units.
 * Props never take part in click picking (raycast is disabled).
 */
export class CityProps {
  readonly group = new THREE.Group();
  private disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  constructor(city: City) {
    const rand = mulberry32(fnv1a(`${city.subreddit}:${city.dayKey}:props`));
    const lots = city.buildings.map((b) => ({
      x: b.x,
      z: b.z,
      half: b.size / 2 + SIDEWALK,
    }));

    this.addSlabs(city);
    this.addTrees(city, rand);
    this.addLamps(city, rand);
    this.addCars(city, lots, rand);
    this.addRoofGear(city, rand);
  }

  private track<T extends THREE.BufferGeometry | THREE.Material>(r: T): T {
    this.disposables.push(r);
    return r;
  }

  private instanced(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
    castShadow = true
  ): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.track(geo), this.track(mat), Math.max(1, count));
    m.raycast = noRaycast;
    m.castShadow = castShadow;
    m.receiveShadow = true;
    m.count = 0;
    this.group.add(m);
    return m;
  }

  /** Sidewalk lot under every building. */
  private addSlabs(city: City): void {
    const mesh = this.instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xb9b6ad, roughness: 0.95 }),
      city.buildings.length,
      false
    );
    const d = new THREE.Object3D();
    city.buildings.forEach((b, i) => {
      const s = b.size + SIDEWALK * 2;
      d.position.set(b.x, SLAB_H / 2, b.z);
      d.scale.set(s, SLAB_H, s);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.count = city.buildings.length;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private addTrees(city: City, rand: () => number): void {
    const max = city.buildings.length * 3;
    const trunk = this.instanced(
      new THREE.CylinderGeometry(0.1, 0.16, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }),
      max
    );
    const crown = this.instanced(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
      max
    );
    const greens = [0x3f7d3a, 0x4a8c3f, 0x2f6b34, 0x5c9a47, 0x6b8f3a].map((h) => new THREE.Color(h));
    const d = new THREE.Object3D();
    let n = 0;
    for (const b of city.buildings) {
      const half = b.size / 2 + SIDEWALK * 0.55;
      const count = 1 + (fnv1a(b.postId) % 2);
      for (let k = 0; k < count; k++) {
        const side = Math.floor(rand() * 4);
        const t = (rand() - 0.5) * (b.size + 1.2);
        const px = side === 0 ? b.x + half : side === 1 ? b.x - half : b.x + t;
        const pz = side === 2 ? b.z + half : side === 3 ? b.z - half : b.z + t;
        const h = 0.8 + rand() * 0.4;
        const r = 0.45 + rand() * 0.25;
        d.rotation.set(0, 0, 0);
        d.position.set(px, SLAB_H + h / 2, pz);
        d.scale.set(1, h, 1);
        d.updateMatrix();
        trunk.setMatrixAt(n, d.matrix);
        d.position.set(px, SLAB_H + h + r * 0.7, pz);
        d.scale.set(r, r * 0.85, r);
        d.updateMatrix();
        crown.setMatrixAt(n, d.matrix);
        crown.setColorAt(n, greens[Math.floor(rand() * greens.length)]);
        n++;
      }
    }
    trunk.count = crown.count = n;
    trunk.instanceMatrix.needsUpdate = crown.instanceMatrix.needsUpdate = true;
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
  }

  private addLamps(city: City, rand: () => number): void {
    const max = city.buildings.length * 2;
    const pole = this.instanced(
      new THREE.CylinderGeometry(0.04, 0.06, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.5, roughness: 0.5 }),
      max
    );
    const head = this.instanced(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.15, 0.6) }),
      max,
      false
    );
    const d = new THREE.Object3D();
    let n = 0;
    for (const b of city.buildings) {
      const half = b.size / 2 + SIDEWALK * 0.8;
      const corners: Array<[number, number]> = [[half, half], [-half, half], [half, -half], [-half, -half]];
      for (let k = 0; k < 2; k++) {
        const c = corners[Math.floor(rand() * 4)];
        const x = b.x + c[0];
        const z = b.z + c[1];
        const h = 2.2;
        d.rotation.set(0, 0, 0);
        d.position.set(x, SLAB_H + h / 2, z);
        d.scale.set(1, h, 1);
        d.updateMatrix();
        pole.setMatrixAt(n, d.matrix);
        d.position.set(x, SLAB_H + h + 0.08, z);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        head.setMatrixAt(n, d.matrix);
        n++;
      }
    }
    pole.count = head.count = n;
    pole.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
  }


  /** Parked cars along the real street centre lines. */
  private addCars(city: City, lots: Array<{ x: number; z: number; half: number }>, rand: () => number): void {
    const streets = city.streets;
    if (!streets || (streets.x.length === 0 && streets.z.length === 0)) return;
    const max = 40;
    const body = this.instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5 }),
      max
    );
    const cabin = this.instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.2, metalness: 0.7 }),
      max
    );
    const lamps = this.instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
      max * 2,
      false
    );
    const paints = [0xb3342f, 0x2f6db3, 0xd9d9d4, 0x1f2328, 0xc9892b, 0x6d747c, 0xd6b83a, 0x3b7a57].map((h) => new THREE.Color(h));
    const head = new THREE.Color(0xdedbd2);
    const tail = new THREE.Color(0x9c2a22);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const l of lots) {
      minX = Math.min(minX, l.x); maxX = Math.max(maxX, l.x); minZ = Math.min(minZ, l.z); maxZ = Math.max(maxZ, l.z);
    }
    const d = new THREE.Object3D();
    let n = 0;
    let li = 0;
    for (let attempt = 0; attempt < 500 && n < max; attempt++) {
      const alongX = rand() > 0.5;
      const lines = alongX ? streets.z : streets.x;
      if (lines.length === 0) continue;
      const line = lines[Math.floor(rand() * lines.length)];
      const lane = line + (rand() > 0.5 ? 0.45 : -0.45);
      const along = alongX ? minX - 2 + rand() * (maxX - minX + 4) : minZ - 2 + rand() * (maxZ - minZ + 4);
      const x = alongX ? along : lane;
      const z = alongX ? lane : along;
      if (lots.some((l) => Math.abs(x - l.x) < l.half + (alongX ? 1.0 : 0.45) && Math.abs(z - l.z) < l.half + (alongX ? 0.45 : 1.0))) continue;
      const dir = rand() > 0.5 ? 1 : -1;
      const rot = alongX ? 0 : Math.PI / 2;
      d.rotation.set(0, rot, 0);
      d.position.set(x, 0.3, z);
      d.scale.set(1.6, 0.36, 0.78);
      d.updateMatrix();
      body.setMatrixAt(n, d.matrix);
      body.setColorAt(n, paints[Math.floor(rand() * paints.length)]);
      d.position.set(x, 0.58, z);
      d.scale.set(0.85, 0.3, 0.68);
      d.updateMatrix();
      cabin.setMatrixAt(n, d.matrix);
      for (const [off, col] of [[0.8 * dir, head], [-0.8 * dir, tail]] as const) {
        d.position.set(x + (alongX ? off : 0), 0.32, z + (alongX ? 0 : off));
        d.scale.set(alongX ? 0.04 : 0.6, 0.1, alongX ? 0.6 : 0.04);
        d.rotation.set(0, 0, 0);
        d.updateMatrix();
        lamps.setMatrixAt(li, d.matrix);
        lamps.setColorAt(li, col);
        li++;
      }
      n++;
    }
    body.count = cabin.count = n;
    lamps.count = li;
    body.instanceMatrix.needsUpdate = cabin.instanceMatrix.needsUpdate = lamps.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  }
  private addRoofGear(city: City, rand: () => number): void {
    const max = city.buildings.length * 3;
    const units = this.instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.6, metalness: 0.4 }),
      max
    );
    const tanks = this.instanced(
      new THREE.CylinderGeometry(0.42, 0.42, 1, 10),
      new THREE.MeshStandardMaterial({ color: 0x7a5a42, roughness: 0.9 }),
      city.buildings.length
    );
    const masts = this.instanced(
      new THREE.CylinderGeometry(0.03, 0.04, 1, 5),
      new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 0.6, roughness: 0.4 }),
      city.buildings.length
    );
    const d = new THREE.Object3D();
    let u = 0;
    let t = 0;
    let m = 0;
    for (const b of city.buildings) {
      if (b.tags.includes('summit') || b.tags.includes('start')) continue;
      const roof = b.height * FLOOR_HEIGHT + ROOF_TOP;
      const half = b.size / 2 - 0.55;
      const spots: Array<[number, number]> = [
        [half, half],
        [-half, half],
        [half, -half],
        [-half, -half],
      ];
      // Fisher-Yates shuffle with the seeded rng for stable placement.
      for (let i = spots.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }
      d.rotation.set(0, 0, 0);
      const s0 = spots[0];
      const w = 0.7 + rand() * 0.5;
      d.position.set(b.x + s0[0], roof + 0.22, b.z + s0[1]);
      d.scale.set(w, 0.44, 0.7 + rand() * 0.3);
      d.updateMatrix();
      units.setMatrixAt(u++, d.matrix);
      if (rand() > 0.4) {
        const s1 = spots[1];
        d.position.set(b.x + s1[0], roof + 0.55, b.z + s1[1]);
        d.scale.set(1, 1.1, 1);
        d.updateMatrix();
        tanks.setMatrixAt(t++, d.matrix);
      }
      if (rand() > 0.5) {
        const s2 = spots[2];
        d.position.set(b.x + s2[0], roof + 1.1, b.z + s2[1]);
        d.scale.set(1, 2.2, 1);
        d.updateMatrix();
        masts.setMatrixAt(m++, d.matrix);
      }
    }
    units.count = u;
    tanks.count = t;
    masts.count = m;
    units.instanceMatrix.needsUpdate = tanks.instanceMatrix.needsUpdate = masts.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.group.removeFromParent();
  }
}
