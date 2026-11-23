import * as THREE from 'three';
import { mulberry32 } from '../../shared/rng.js';

/** Direction TOWARD the sun (low, late-afternoon light). */
export const SUN_DIR = new THREE.Vector3(0.78, 0.42, 0.28).normalize();
export const HAZE_COLOR = 0xe9c9a8;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vDir = normalize(worldPos.xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform float uTime;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 zenith  = vec3(0.20, 0.38, 0.68);
  vec3 mid     = vec3(0.55, 0.70, 0.88);
  vec3 horizon = vec3(0.96, 0.78, 0.60);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
  col = mix(col, zenith, smoothstep(0.2, 0.9, h));

  float sd = max(dot(vDir, normalize(uSunDir)), 0.0);
  col += vec3(1.0, 0.72, 0.42) * pow(sd, 6.0) * 0.45;
  col += vec3(1.0, 0.9, 0.7) * pow(sd, 220.0) * 1.6;

  // Soft cirrus clouds, tinted by the low sun.
  vec2 cp = vDir.xz / max(vDir.y + 0.25, 0.12) * 0.9 + vec2(uTime * 0.004, 0.0);
  float cl = smoothstep(0.52, 0.85, fbm(cp * 1.4));
  vec3 cloudCol = mix(vec3(1.0, 0.86, 0.72), vec3(0.95, 0.96, 1.0), smoothstep(0.1, 0.6, h));
  col = mix(col, cloudCol, cl * 0.55 * smoothstep(0.02, 0.2, h));

  gl_FragColor = vec4(col, 1.0);
}
`;

const noRaycast = (): void => {};

export class SkyScene {
  private skyMesh: THREE.Mesh;
  private skyMaterial: THREE.ShaderMaterial;
  private skyline: THREE.InstancedMesh;
  readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uSunDir: { value: SUN_DIR.clone() },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), this.skyMaterial);
    this.skyMesh.raycast = noRaycast;
    scene.add(this.skyMesh);

    // Atmospheric haze: far ground and towers fade into the horizon colour.
    scene.fog = new THREE.FogExp2(HAZE_COLOR, 0.0042);

    // Distant skyline: hazy towers ringing the city for depth.
    const count = 56;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.skyline = new THREE.InstancedMesh(geo, mat, count);
    this.skyline.raycast = noRaycast;
    const rand = mulberry32(99);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand() * 0.1;
      const r = 175 + rand() * 40;
      const h = 14 + rand() * 46;
      const w = 7 + rand() * 12;
      d.position.set(Math.cos(angle) * r, h / 2 - 1, Math.sin(angle) * r);
      d.scale.set(w, h, w);
      d.rotation.set(0, rand() * Math.PI, 0);
      d.updateMatrix();
      this.skyline.setMatrixAt(i, d.matrix);
      c.setHSL(0.6 + rand() * 0.05, 0.12 + rand() * 0.1, 0.42 + rand() * 0.18);
      this.skyline.setColorAt(i, c);
    }
    this.skyline.instanceMatrix.needsUpdate = true;
    if (this.skyline.instanceColor) this.skyline.instanceColor.needsUpdate = true;
    scene.add(this.skyline);
  }

  update(time: number): void {
    const u = this.skyMaterial.uniforms['uTime'];
    if (u) u.value = time;
  }

  dispose(): void {
    this.skyMesh.geometry.dispose();
    this.skyMaterial.dispose();
    this.skyline.geometry.dispose();
    (this.skyline.material as THREE.Material).dispose();
    this.scene.remove(this.skyMesh, this.skyline);
  }
}
