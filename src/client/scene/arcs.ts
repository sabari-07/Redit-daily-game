import * as THREE from 'three';
import type { Building } from '../../shared/types.js';
import type { JumpCheck } from '../../shared/rules.js';

const FLOOR_HEIGHT = 1.6;
const ROOF_SLAB = 0.25;

const ARC_COLORS = {
  walk: new THREE.Color(0x34e0ff),
  glide: new THREE.Color(0x9b7bff),
  grapple: new THREE.Color(0xffb347),
  invalid: new THREE.Color(0xff5c6c),
};

function roofY(height: number): number {
  return height * FLOOR_HEIGHT + ROOF_SLAB + 0.6; // ~1 unit above the new 0.46 roof top
}

/** Builds a parabolic arc curve between two points */
function buildArcPoints(
  from: THREE.Vector3,
  to: THREE.Vector3,
  segments = 24
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const apex = from.distanceTo(to) * 0.3 + 1;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const baseY = from.y + (to.y - from.y) * t;
    const arcY = apex * Math.sin(t * Math.PI);
    points.push(new THREE.Vector3(x, baseY + arcY, z));
  }
  return points;
}

export class ArcPreview {
  private line: THREE.Line | null = null;
  private animOffset = 0;
  private scene: THREE.Scene;
  private animDuration = 180;
  private animElapsed = 0;
  private visible = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Shows an arc from building `from` to building `to` given the jump check result */
  show(
    from: Building,
    to: Building,
    check: JumpCheck
  ): void {
    this.hide();

    const fromPos = new THREE.Vector3(from.x, roofY(from.height), from.z);
    const toPos = new THREE.Vector3(to.x, roofY(to.height), to.z);
    const points = buildArcPoints(fromPos, toPos);

    const color = check.valid
      ? (check.tool === 'glide' ? ARC_COLORS.glide : check.tool === 'grapple' ? ARC_COLORS.grapple : ARC_COLORS.walk)
      : ARC_COLORS.invalid;

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color,
      dashSize: check.valid ? 0.5 : 0.3,
      gapSize: check.valid ? 0.1 : 0.3,
      linewidth: 1,
    });
    this.line = new THREE.Line(geo, mat);
    this.line.computeLineDistances();
    this.scene.add(this.line);
    this.visible = true;
    this.animElapsed = 0;
  }

  hide(): void {
    if (this.line) {
      this.scene.remove(this.line);
      this.line.geometry.dispose();
      (this.line.material as THREE.Material).dispose();
      this.line = null;
    }
    this.visible = false;
  }

  update(dt: number): void {
    if (!this.line || !this.visible) return;
    // Animate the dash offset for the draw-in effect
    if (this.animElapsed < this.animDuration) {
      this.animElapsed += dt;
    }
    const mat = this.line.material as THREE.LineDashedMaterial;
    // Animate offset to create a "drawing" feel
    this.animOffset = (this.animOffset + dt * 0.003) % 1;
    (mat as THREE.LineDashedMaterial & { dashOffset: number }).dashOffset = -this.animOffset;
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.hide();
  }
}
