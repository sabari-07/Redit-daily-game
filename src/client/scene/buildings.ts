import * as THREE from 'three';
import type { Building, City, Tool } from '../../shared/types.js';
import { fnv1a } from '../../shared/rng.js';
import { jumpGeometry, GLIDE_GAP, WALK_RISE } from '../../shared/rules.js';
import {
  AWNINGS,
  makeFacade,
  makePadTexture,
  makeRingTexture,
  makeRoofTexture,
  pickKind,
} from './facade.js';
import { CityProps } from './props.js';

const FLOOR_HEIGHT = 1.6;
const CAP_H = 0.32;

const COLORS = {
  walk: new THREE.Color(0x16d6ff),
  glide: new THREE.Color(0xb08cff),
  grapple: new THREE.Color(0xffa91f),
  blocked: new THREE.Color(0xff4d4d),
  ahead: new THREE.Color(0xffffff),
  summit: new THREE.Color(0xffd36b),
  gold: new THREE.Color(0xffc233),
  hint: new THREE.Color(0xffe14d),
};

const noRaycast = (): void => {};

/** One small texture per sign (24 x ~100 KB, instead of sharing a 16 MB atlas). Titles use fillText only. */
function makeSignTexture(b: Building): THREE.CanvasTexture {
  const SIGN_W = 256;
  const SIGN_H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = SIGN_W;
  canvas.height = SIGN_H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(18,22,34,0.92)';
  roundRect(ctx, 4, 4, SIGN_W - 8, SIGN_H - 8, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const title = b.title || 'Empty lot';
  ctx.fillStyle = '#f4f6ff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const maxW = SIGN_W - 24;
  wrapText(ctx, title, maxW).slice(0, 2).forEach((line, li) => {
    ctx.fillText(line, SIGN_W / 2, 30 + li * 18, maxW);
  });

  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.arc(22, SIGN_H - 20, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText(`${formatNum(b.score)} Buzz`, 32, SIGN_H - 15);
  ctx.fillStyle = '#8fd3ff';
  ctx.beginPath();
  ctx.arc(SIGN_W / 2 + 6, SIGN_H - 20, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText(`${formatNum(b.numComments)} Chatter`, SIGN_W / 2 + 16, SIGN_H - 15);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxW && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function formatNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function toolColor(tool: Tool): THREE.Color {
  return tool === 'glide' ? COLORS.glide : tool === 'grapple' ? COLORS.grapple : COLORS.walk;
}

interface RingState {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  mode: 'off' | 'primary' | 'other' | 'ahead' | 'selected' | 'hint';
}

/** Floor-difference tag ("+3") textures, cached by text. */
const labelCache = new Map<string, THREE.CanvasTexture>();
function floorLabelTexture(rise: number): THREE.CanvasTexture {
  const text = rise > 0 ? `+${rise}` : rise < 0 ? `\u2212${-rise}` : '\u00b10';
  const bg = rise > WALK_RISE ? '#b45309' : rise < -WALK_RISE ? '#5b21b6' : '#0e7490';
  const key = `${text}|${bg}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 56;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(4, 4, 88, 48, 14);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 48, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, t);
  return t;
}

export class CityBuildings {
  private disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  private root: THREE.Group;
  private props: CityProps | null = null;
  private signSprites: THREE.Sprite[] = [];
  private rings: RingState[] = [];
  private floorTags: THREE.Sprite[] = [];
  /** Roof the Hint points at (blinks gold until the next jump). */
  private hintIndex: number | null = null;
  private city: City | null = null;
  private summitBeam: THREE.Mesh | null = null;
  private goldCoins: Array<{ mesh: THREE.Mesh; baseY: number; index: number }> = [];

  constructor(private readonly scene: THREE.Scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
  }

  buildFromCity(city: City): void {
    this.dispose();
    this.city = city;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    const roofTex = makeRoofTexture();
    this.disposables.push(roofTex);
    const ringTex = makeRingTexture();
    this.disposables.push(ringTex);
    const startPad = makePadTexture('S', '#18c6f0');
    const summitPad = makePadTexture('\u2605', '#ffd36b');
    this.disposables.push(startPad, summitPad);

    const ringGeoBySize = new Map<number, THREE.PlaneGeometry>();

    for (const b of city.buildings) {
      const worldH = b.height * FLOOR_HEIGHT;
      const size = b.size;
      const hash = fnv1a(b.postId);

      // Walls: a procedural facade with real windows, shopfronts and weathering.
      const kind = pickKind(b.height, hash);
      // Daytime: only some interiors glow. More Chatter = more lit rooms.
      const lit = Math.min(0.6, 0.12 + (b.numComments / 160) * 0.4);
      const tex = makeFacade({
        kind,
        cols: size === 5 ? 6 : 4,
        floors: b.height,
        seed: hash ^ (b.index * 2654435761),
        litFraction: lit,
        cracked: b.tags.includes('cracked'),
        awning: AWNINGS[hash % AWNINGS.length],
      });
      this.disposables.push(tex.map, tex.emissive);
      const wallMat = new THREE.MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.emissive,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.5,
        roughness: kind === 'glass' ? 0.25 : 0.88,
        metalness: kind === 'glass' ? 0.35 : 0.04,
      });
      this.disposables.push(wallMat);
      const bodyGeo = new THREE.BoxGeometry(size, worldH, size);
      this.disposables.push(bodyGeo);
      const body = new THREE.Mesh(bodyGeo, wallMat);
      body.position.set(b.x, worldH / 2 + 0.14, b.z);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData['buildingIndex'] = b.index;
      this.root.add(body);

      // Roof cap with a parapet lip.
      const cracked = b.tags.includes('cracked');
      const capMat = new THREE.MeshStandardMaterial({
        map: roofTex,
        color: cracked ? 0xb86a55 : 0xd8d8d4,
        roughness: 0.95,
      });
      this.disposables.push(capMat);
      const capGeo = new THREE.BoxGeometry(size + 0.3, CAP_H, size + 0.3);
      this.disposables.push(capGeo);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(b.x, worldH + 0.14 + CAP_H / 2, b.z);
      cap.castShadow = true;
      cap.receiveShadow = true;
      cap.userData['buildingIndex'] = b.index;
      this.root.add(cap);

      const roofTop = worldH + 0.14 + CAP_H;

      // Floor-difference tag, shown on roofs within jumping distance.
      const tagMat = new THREE.SpriteMaterial({ map: floorLabelTexture(0), depthWrite: false, sizeAttenuation: false, transparent: true });
      this.disposables.push(tagMat);
      const tag = new THREE.Sprite(tagMat);
      tag.scale.set(0.05, 0.029, 1);
      tag.position.set(b.x, roofTop + 1.1, b.z);
      tag.visible = false;
      tag.renderOrder = 10;
      tag.raycast = noRaycast;
      this.floorTags[b.index] = tag;
      this.root.add(tag);

      // Start / Summit pads painted on the roof.
      if (b.tags.includes('start') || b.tags.includes('summit')) {
        const isSummit = b.tags.includes('summit');
        const padGeo = new THREE.PlaneGeometry(size - 0.5, size - 0.5);
        const padMat = new THREE.MeshBasicMaterial({
          map: isSummit ? summitPad : startPad,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        });
        this.disposables.push(padGeo, padMat);
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(b.x, roofTop + 0.03, b.z);
        pad.raycast = noRaycast;
        this.root.add(pad);
      }

      // Jump-target ring.
      let ringGeo = ringGeoBySize.get(size);
      if (!ringGeo) {
        ringGeo = new THREE.PlaneGeometry(size + 0.5, size + 0.5);
        ringGeoBySize.set(size, ringGeo);
        this.disposables.push(ringGeo);
      }
      const ringMat = new THREE.MeshBasicMaterial({
        map: ringTex,
        color: COLORS.walk,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      this.disposables.push(ringMat);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(b.x, roofTop + 0.08, b.z);
      ring.visible = false;
      ring.raycast = noRaycast;
      this.root.add(ring);
      this.rings[b.index] = { mesh: ring, material: ringMat, mode: 'off' };

      // Sign billboard (shown for selected / key buildings).
      const signTex = makeSignTexture(b);
      this.disposables.push(signTex);
      const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false });
      this.disposables.push(signMat);
      const sign = new THREE.Sprite(signMat);
      sign.position.set(b.x, roofTop + 3.1, b.z);
      sign.scale.set(6, 2.25, 1);
      sign.visible = false;
      sign.raycast = noRaycast;
      this.signSprites[b.index] = sign;
      this.root.add(sign);

      this.addTagVisuals(b, roofTop);
    }

    this.props = new CityProps(city);
    this.scene.add(this.props.group);
  }

  private addTagVisuals(b: Building, roofTop: number): void {
    if (b.tags.includes('summit')) {
      // Landmark: vertical beacon of warm light, a flag mast and an aviation light.
      const beamGeo = new THREE.CylinderGeometry(0.35, 1.3, 26, 12, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: COLORS.summit,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      this.disposables.push(beamGeo, beamMat);
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(b.x, roofTop + 13, b.z);
      beam.raycast = noRaycast;
      this.root.add(beam);
      this.summitBeam = beam;

      const mastGeo = new THREE.CylinderGeometry(0.05, 0.06, 3.4, 6);
      const mastMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.6, roughness: 0.4 });
      const flagGeo = new THREE.BoxGeometry(1.3, 0.75, 0.04);
      const flagMat = new THREE.MeshBasicMaterial({ color: COLORS.summit, toneMapped: false });
      this.disposables.push(mastGeo, mastMat, flagGeo, flagMat);
      const mast = new THREE.Mesh(mastGeo, mastMat);
      mast.position.set(b.x + b.size / 2 - 0.7, roofTop + 1.7, b.z - b.size / 2 + 0.7);
      mast.raycast = noRaycast;
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(mast.position.x + 0.65, roofTop + 3.0, mast.position.z);
      flag.raycast = noRaycast;
      this.root.add(mast, flag);
    }

    if (b.tags.includes('gold')) {
      const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.14, 20);
      const coinMat = new THREE.MeshStandardMaterial({
        color: COLORS.gold,
        emissive: COLORS.gold,
        emissiveIntensity: 0.55,
        metalness: 0.85,
        roughness: 0.25,
      });
      this.disposables.push(coinGeo, coinMat);
      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.rotation.x = Math.PI / 2;
      const baseY = roofTop + 1.5;
      coin.position.set(b.x, baseY, b.z);
      coin.raycast = noRaycast;
      this.goldCoins.push({ mesh: coin, baseY, index: b.index });
      this.root.add(coin);
    }

    if (b.tags.includes('cracked')) {
      // Warning light on the roof of a building that will not survive being left.
      const lampGeo = new THREE.SphereGeometry(0.2, 8, 6);
      const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.25, 0.2), toneMapped: false });
      this.disposables.push(lampGeo, lampMat);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(b.x - b.size / 2 + 0.6, roofTop + 0.3, b.z + b.size / 2 - 0.6);
      lamp.raycast = noRaycast;
      this.root.add(lamp);
    }
  }

  /**
   * Rooftop rings.
   *  primary  = reachable now with the chosen tool (bright, pulsing, tool colour)
   *  other    = reachable only with another tool (faint, that tool's colour)
   *  ahead    = reachable after jumping to the selected roof (faint white)
   *  selected = the roof being checked (tool colour if reachable, red if not)
   */
  setReach(
    primary: Set<number> | null,
    primaryTool: Tool,
    other: Map<number, Tool> | null,
    ahead: Set<number> | null,
    selected: { index: number; valid: boolean; tool: Tool } | null
  ): void {
    for (const r of this.rings) {
      if (!r) continue;
      r.mode = 'off';
      r.mesh.visible = false;
      r.mesh.scale.setScalar(1);
    }
    const apply = (i: number, mode: RingState['mode'], color: THREE.Color): void => {
      const r = this.rings[i];
      if (!r) return;
      r.mode = mode;
      r.material.color.copy(color);
      r.mesh.visible = true;
    };
    if (other) for (const [i, t] of other) apply(i, 'other', toolColor(t));
    if (ahead) for (const i of ahead) apply(i, 'ahead', COLORS.ahead);
    if (primary) for (const i of primary) apply(i, 'primary', toolColor(primaryTool));
    if (selected) {
      apply(selected.index, 'selected', selected.valid ? toolColor(selected.tool) : COLORS.blocked);
      this.rings[selected.index]?.mesh.scale.setScalar(1.12);
    }
    this.applyHint();
  }

  /** Makes one roof's ring blink gold (the Hint's next step). null clears it. */
  setHint(index: number | null): void {
    const prev = this.hintIndex;
    this.hintIndex = index;
    if (prev !== null && prev !== index) {
      const r = this.rings[prev];
      if (r && r.mode === 'hint') {
        r.mode = 'off';
        r.mesh.visible = false;
        r.mesh.scale.setScalar(1);
      }
    }
    this.applyHint();
  }

  private applyHint(): void {
    if (this.hintIndex === null) return;
    const r = this.rings[this.hintIndex];
    if (!r) return;
    r.mode = 'hint';
    r.material.color.copy(COLORS.hint);
    r.mesh.visible = true;
    r.mesh.scale.setScalar(1.3);
  }

  /** Hides the coins on roofs already collected this run (and shows them again after Undo/Restart). */
  setCollected(collected: ReadonlySet<number>): void {
    for (const c of this.goldCoins) c.mesh.visible = !collected.has(c.index);
  }

  /** Shows "+3" / "âˆ’2" floor tags on every roof within Glide range of `from` (null hides all). */
  setFloorLabels(from: number | null, collapsed: ReadonlySet<number>): void {
    const city = this.city;
    for (let i = 0; i < this.floorTags.length; i++) {
      const tag = this.floorTags[i];
      if (!tag) continue;
      if (from === null || !city || i === from || collapsed.has(i)) {
        tag.visible = false;
        continue;
      }
      const g = jumpGeometry(city.buildings[from], city.buildings[i]);
      tag.visible = g.gap <= GLIDE_GAP + 0.01;
      if (tag.visible) (tag.material).map = floorLabelTexture(g.rise);
    }
  }
  update(time: number, dt: number): void {
    if (this.summitBeam) {
      (this.summitBeam.material as THREE.MeshBasicMaterial).opacity = 0.26 + 0.1 * Math.sin(time * 2);
    }
    for (const c of this.goldCoins) {
      c.mesh.rotation.z += dt * 0.0022;
      c.mesh.position.y = c.baseY + Math.sin(time * 2 + c.baseY) * 0.12;
    }
    const pulse = 0.6 + 0.4 * Math.sin(time * 3.4);
    for (const r of this.rings) {
      if (!r || r.mode === 'off') continue;
      r.material.opacity = r.mode === 'hint'
        ? (Math.sin(time * 9) > 0 ? 1 : 0.1) // on/off blink
        : r.mode === 'primary' ? pulse : r.mode === 'ahead' ? 0.4 : r.mode === 'other' ? 0.32 : 1;
    }
  }

  showSign(buildingIndex: number, visible: boolean): void {
    const sprite = this.signSprites[buildingIndex];
    if (sprite) sprite.visible = visible;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.signSprites = [];
    this.rings = [];
    this.floorTags = [];
    this.hintIndex = null;
    this.city = null;
    this.goldCoins = [];
    this.summitBeam = null;
    this.props?.dispose();
    this.props = null;
    this.root.removeFromParent();
  }
}
