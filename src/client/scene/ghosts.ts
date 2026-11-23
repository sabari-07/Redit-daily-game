import * as THREE from 'three';
import type { City, GhostRoute } from '../../shared/types.js';

const FLOOR_HEIGHT = 1.6;
const ROOF_SLAB = 0.25;

export class GhostsView {
  private lines: THREE.Line[] = [];
  private ghostMarkers: THREE.Mesh[] = [];
  private scene: THREE.Scene;
  private disposables: Array<THREE.BufferGeometry | THREE.Material> = [];
  private animTime = 0;
  private routeData: Array<{ path: THREE.Vector3[]; cycle: number }> = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  show(routes: GhostRoute[], city: City): void {
    this.hide();
    const maxCount = Math.max(...routes.map((r) => r.count), 1);

    routes.forEach((route, ri) => {
      const points: THREE.Vector3[] = route.path.map((idx) => {
        const b = city.buildings[idx];
        return new THREE.Vector3(b.x, b.height * FLOOR_HEIGHT + ROOF_SLAB + 1, b.z);
      });
      if (points.length < 2) return;

      const opacity = 0.3 + 0.4 * (route.count / maxCount);
      const thickness = 1 + 2 * (route.count / maxCount);
      const hue = ri === 0 ? 0.6 : ri === 1 ? 0.75 : 0.5;
      const color = new THREE.Color().setHSL(hue, 0.8, 0.6);

      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineDashedMaterial({
        color,
        dashSize: 0.6,
        gapSize: 0.3,
        transparent: true,
        opacity,
        linewidth: thickness,
      });
      this.disposables.push(geo, mat);
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      this.scene.add(line);
      this.lines.push(line);

      this.routeData.push({ path: points, cycle: ri * 2 }); // stagger by 2s each

      // Ghost marker (small semi-transparent sphere)
      const markerGeo = new THREE.SphereGeometry(0.3, 8, 8);
      const markerMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: opacity * 0.9 });
      this.disposables.push(markerGeo, markerMat);
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(points[0]);
      this.scene.add(marker);
      this.ghostMarkers.push(marker);
    });
  }

  hide(): void {
    for (const l of this.lines) this.scene.remove(l);
    for (const m of this.ghostMarkers) this.scene.remove(m);
    for (const d of this.disposables) d.dispose();
    this.lines = []; this.ghostMarkers = []; this.disposables = []; this.routeData = [];
  }

  update(dt: number): void {
    this.animTime += dt;
    const CYCLE = 6000;

    this.ghostMarkers.forEach((marker, ri) => {
      const data = this.routeData[ri];
      if (!data || data.path.length < 2) return;
      const offset = data.cycle * 1000;
      const t = ((this.animTime + offset) % CYCLE) / CYCLE;
      const totalSegs = data.path.length - 1;
      const segT = t * totalSegs;
      const segIdx = Math.min(Math.floor(segT), totalSegs - 1);
      const segFrac = segT - segIdx;
      marker.position.lerpVectors(data.path[segIdx], data.path[segIdx + 1], segFrac);
    });
  }

  dispose(): void {
    this.hide();
  }
}
