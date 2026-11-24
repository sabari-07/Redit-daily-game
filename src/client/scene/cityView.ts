import * as THREE from 'three';
import type { City } from '../../shared/types.js';
import { CityBuildings } from './buildings.js';
import { SkyScene, SUN_DIR } from './sky.js';
import { makeStreetTexture } from './facade.js';
import type { SceneRenderer } from './renderer.js';

/** The subset of SceneRenderer that CityView needs (lets the lightweight splash reuse it). */
export type CityRenderTarget = Pick<SceneRenderer, 'tier' | 'setupComposer'>;

const STREET_W = 2.2;
const noRaycast = (): void => {};

/** Builds and manages the full 3D city scene for a given City. */
export class CityView {
  readonly scene: THREE.Scene;
  private buildings: CityBuildings | null = null;
  private sky: SkyScene | null = null;
  private objects: THREE.Object3D[] = [];
  private disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  constructor() {
    this.scene = new THREE.Scene();
  }

  buildFromCity(city: City, sceneRenderer: CityRenderTarget): void {
    this.dispose();
    this.sky = new SkyScene(this.scene);

    // Ground: dark paving everywhere, with streets drawn on the real street lines.
    const groundGeo = new THREE.PlaneGeometry(900, 900);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x45474c, roughness: 1 });
    this.disposables.push(groundGeo, groundMat);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.raycast = noRaycast;
    this.add(ground);

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const b of city.buildings) {
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x); minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z);
    }
    const pad = 14;
    const streetTex = makeStreetTexture();
    this.disposables.push(streetTex);
    const addStreet = (cx: number, cz: number, length: number, alongX: boolean, y: number): void => {
      const tex = streetTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, length / 8);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 });
      const geo = new THREE.PlaneGeometry(STREET_W, length);
      this.disposables.push(tex, mat, geo);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      if (alongX) m.rotation.z = Math.PI / 2;
      m.position.set(cx, y, cz);
      m.receiveShadow = true;
      m.raycast = noRaycast;
      this.add(m);
    };
    const s = city.streets;
    if (s) {
      const lenZ = maxZ - minZ + pad * 2;
      const lenX = maxX - minX + pad * 2;
      for (const x of s.x) addStreet(x, (minZ + maxZ) / 2, lenZ, false, 0.02);
      for (const z of s.z) addStreet((minX + maxX) / 2, z, lenX, true, 0.025);
    }

    // Late-afternoon light: warm low sun, cool sky fill, and a soft bounce from the ground.
    const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x8a7560, 1.05);
    this.add(hemi);

    const sun = new THREE.DirectionalLight(0xffd2a0, 3.1);
    sun.position.copy(SUN_DIR).multiplyScalar(90);
    this.add(sun.target);
    if (sceneRenderer.tier !== 'low') {
      sun.castShadow = true;
      const res = sceneRenderer.tier === 'high' ? 2048 : 1024;
      sun.shadow.mapSize.set(res, res);
      sun.shadow.camera.near = 10;
      sun.shadow.camera.far = 230;
      sun.shadow.camera.left = -60;
      sun.shadow.camera.right = 60;
      sun.shadow.camera.top = 60;
      sun.shadow.camera.bottom = -60;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.06;
    }
    this.add(sun);

    const fill = new THREE.DirectionalLight(0x9db8ff, 0.55);
    fill.position.set(-50, 40, -30);
    this.add(fill);
    this.buildings = new CityBuildings(this.scene);
    this.buildings.buildFromCity(city);
    sceneRenderer.setupComposer(this.scene);
  }

  private add(o: THREE.Object3D): void {
    this.scene.add(o);
    this.objects.push(o);
  }

  update(time: number, dt: number): void {
    this.sky?.update(time * 0.001);
    this.buildings?.update(time * 0.001, dt);
  }

  setReach(...args: Parameters<CityBuildings['setReach']>): void {
    this.buildings?.setReach(...args);
  }

  setFloorLabels(...args: Parameters<CityBuildings['setFloorLabels']>): void {
    this.buildings?.setFloorLabels(...args);
  }

  setCollected(collected: ReadonlySet<number>): void {
    this.buildings?.setCollected(collected);
  }

  setHint(index: number | null): void {
    this.buildings?.setHint(index);
  }

  showSign(index: number, visible: boolean): void {
    this.buildings?.showSign(index, visible);
  }

  dispose(): void {
    this.buildings?.dispose();
    this.sky?.dispose();
    for (const o of this.objects) this.scene.remove(o);
    for (const d of this.disposables) d.dispose();
    this.buildings = null;
    this.sky = null;
    this.objects = [];
    this.disposables = [];
  }
}
