import * as THREE from 'three';
import { mulberry32 } from '../../shared/rng.js';

/**
 * Procedural, bundled-in-code building textures (no image files, no network).
 * One small canvas per building: columns x floors of real-looking windows with sills,
 * lintels, storefronts, brick/concrete/stone/glass walls, lit and unlit panes.
 */

export type FacadeKind = 'glass' | 'brick' | 'concrete' | 'stone';

export interface FacadeSpec {
  kind: FacadeKind;
  cols: number;
  floors: number;
  seed: number;
  /** 0..1 share of windows that are lit (driven by the post's Chatter). */
  litFraction: number;
  cracked: boolean;
  /** Storefront awning colour (CSS). */
  awning: string;
}

const CELL_W = 28;
const CELL_H = 36;

const WALLS: Record<FacadeKind, string[]> = {
  brick: ['#8c4f3b', '#7a4a3a', '#9a5a43', '#6f4636', '#86523f'],
  concrete: ['#8d9096', '#a1a29e', '#7b8087', '#9a9690', '#868a90'],
  stone: ['#bcae92', '#c8bda4', '#b3a58b', '#c4b496'],
  glass: ['#46687f', '#3c5d78', '#527488', '#41607a'],
};

export const AWNINGS = ['#b3342f', '#2f6db3', '#2f8f5b', '#c9892b', '#7a3fa0', '#2b8f94'];

export function pickKind(height: number, h: number): FacadeKind {
  if (height >= 9) return h % 3 === 0 ? 'concrete' : 'glass';
  if (height >= 6) return (['stone', 'concrete', 'glass', 'brick'] as const)[h % 4];
  return (['brick', 'brick', 'stone', 'concrete'] as const)[h % 4];
}

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

export interface FacadeTextures {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

export function makeFacade(spec: FacadeSpec): FacadeTextures {
  const rand = mulberry32(spec.seed);
  const W = spec.cols * CELL_W;
  const H = spec.floors * CELL_H;
  const color = document.createElement('canvas');
  color.width = W;
  color.height = H;
  const g = color.getContext('2d')!;
  const emi = document.createElement('canvas');
  emi.width = W;
  emi.height = H;
  const e = emi.getContext('2d')!;
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);

  const palette = WALLS[spec.kind];
  const wall = palette[Math.floor(rand() * palette.length)];

  // Wall base with per-floor tonal variation (weathering).
  for (let f = 0; f < spec.floors; f++) {
    const y = H - (f + 1) * CELL_H;
    g.fillStyle = shade(wall, 0.92 + rand() * 0.16);
    g.fillRect(0, y, W, CELL_H);
  }

  // Wall surface detail.
  if (spec.kind === 'brick') {
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    for (let y = 0, row = 0; y < H; y += 4, row++) {
      for (let x = (row % 2) * 6; x < W; x += 12) g.fillRect(x, y, 1, 4);
    }
  } else if (spec.kind === 'concrete' || spec.kind === 'stone') {
    for (let i = 0; i < W * H * 0.04; i++) {
      g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      g.fillRect(Math.floor(rand() * W), Math.floor(rand() * H), 2, 2);
    }
  }

  const glass = spec.kind === 'glass';

  for (let f = 0; f < spec.floors; f++) {
    const y0 = H - (f + 1) * CELL_H;

    // Floor slab line.
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, y0 + CELL_H - 2, W, 2);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(0, y0 + CELL_H - 3, W, 1);

    for (let c = 0; c < spec.cols; c++) {
      const x0 = c * CELL_W;
      const lit = rand() < spec.litFraction;
      const storefront = f === 0;

      if (glass) {
        // Curtain wall: pane fills the cell, reflecting a warm sky.
        const t = f / Math.max(1, spec.floors - 1);
        const gr = g.createLinearGradient(0, y0, 0, y0 + CELL_H);
        gr.addColorStop(0, shade('#9ec0da', 0.75 + t * 0.35));
        gr.addColorStop(1, shade('#35526b', 0.8 + t * 0.2));
        g.fillStyle = gr;
        g.fillRect(x0 + 1, y0 + 1, CELL_W - 2, CELL_H - 3);
        g.fillStyle = 'rgba(255,190,120,0.10)';
        g.fillRect(x0 + 1, y0 + 1, CELL_W - 2, 8);
        g.fillStyle = 'rgba(20,28,38,0.85)';
        g.fillRect(x0, y0, 1, CELL_H);
        g.fillRect(x0 + CELL_W - 1, y0, 1, CELL_H);
        if (lit) {
          g.fillStyle = 'rgba(255,214,150,0.55)';
          g.fillRect(x0 + 2, y0 + 3, CELL_W - 4, CELL_H - 8);
          e.fillStyle = 'rgba(255,200,120,0.85)';
          e.fillRect(x0 + 2, y0 + 3, CELL_W - 4, CELL_H - 8);
        }
        continue;
      }

      if (storefront) {
        // Shop window, awning and a lit interior.
        const wx = x0 + 3;
        const wy = y0 + 12;
        const ww = CELL_W - 6;
        const wh = CELL_H - 16;
        g.fillStyle = '#1b2230';
        g.fillRect(wx, wy, ww, wh);
        const shopLit = rand() < Math.min(0.95, spec.litFraction + 0.35);
        const sg = g.createLinearGradient(0, wy, 0, wy + wh);
        sg.addColorStop(0, shopLit ? '#ffe7b8' : '#5d7288');
        sg.addColorStop(1, shopLit ? '#f0a85e' : '#26323f');
        g.fillStyle = sg;
        g.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
        if (shopLit) {
          e.fillStyle = 'rgba(255,196,110,0.95)';
          e.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
        }
        g.fillStyle = spec.awning;
        g.fillRect(x0 + 1, y0 + 5, CELL_W - 2, 7);
        g.fillStyle = 'rgba(255,255,255,0.22)';
        for (let sx = x0 + 3; sx < x0 + CELL_W - 3; sx += 6) g.fillRect(sx, y0 + 5, 3, 7);
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(x0 + 1, y0 + 12, CELL_W - 2, 2);
        continue;
      }

      // Regular punched window with lintel and sill.
      const wx = x0 + 7;
      const wy = y0 + 8;
      const ww = CELL_W - 14;
      const wh = CELL_H - 18;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(wx - 1, wy - 3, ww + 2, 3);
      g.fillStyle = '#10151d';
      g.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
      const pg = g.createLinearGradient(0, wy, 0, wy + wh);
      if (lit) {
        pg.addColorStop(0, '#ffe3ae');
        pg.addColorStop(1, '#eea35a');
      } else {
        pg.addColorStop(0, '#9dbdd6');
        pg.addColorStop(0.55, '#4d6a85');
        pg.addColorStop(1, '#27374a');
      }
      g.fillStyle = pg;
      g.fillRect(wx, wy, ww, wh);
      if (lit) {
        e.fillStyle = 'rgba(255,190,105,0.9)';
        e.fillRect(wx, wy, ww, wh);
        if (rand() < 0.35) {
          // Curtain / blind.
          g.fillStyle = 'rgba(70,40,25,0.45)';
          g.fillRect(wx, wy, ww, Math.floor(wh * (0.3 + rand() * 0.4)));
          e.fillStyle = 'rgba(0,0,0,0.5)';
          e.fillRect(wx, wy, ww, Math.floor(wh * 0.35));
        }
      }
      // Mullion.
      g.fillStyle = 'rgba(16,21,29,0.9)';
      g.fillRect(wx + Math.floor(ww / 2), wy, 1, wh);
      // Sill.
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.fillRect(wx - 2, wy + wh + 1, ww + 4, 2);
    }
  }

  if (spec.cracked) {
    // Structural damage: dark cracks, boarded windows, hazard tape on the ground floor.
    g.strokeStyle = 'rgba(12,8,6,0.9)';
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      let x = rand() * W;
      let y = rand() * H * 0.5;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 8; s++) {
        x += (rand() - 0.5) * 22;
        y += 10 + rand() * 18;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = '#6a4a2a';
    for (let i = 0; i < Math.max(2, spec.floors); i++) {
      const c = Math.floor(rand() * spec.cols);
      const f = 1 + Math.floor(rand() * Math.max(1, spec.floors - 1));
      g.fillRect(c * CELL_W + 6, H - (f + 1) * CELL_H + 7, CELL_W - 12, CELL_H - 16);
      e.fillStyle = '#000';
      e.fillRect(c * CELL_W + 6, H - (f + 1) * CELL_H + 7, CELL_W - 12, CELL_H - 16);
    }
    const ty = H - CELL_H + 18;
    for (let x = -8; x < W + 8; x += 12) {
      g.fillStyle = '#f2c21b';
      g.beginPath();
      g.moveTo(x, ty);
      g.lineTo(x + 6, ty);
      g.lineTo(x + 12, ty + 7);
      g.lineTo(x + 6, ty + 7);
      g.closePath();
      g.fill();
    }
  }

  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const emissive = new THREE.CanvasTexture(emi);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.anisotropy = 4;
  return { map, emissive };
}

/** Shared gravel/tar roof texture. */
export function makeRoofTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5b5e63';
  g.fillRect(0, 0, 128, 128);
  const rand = mulberry32(7);
  for (let i = 0; i < 1800; i++) {
    const v = 70 + Math.floor(rand() * 70);
    g.fillStyle = `rgb(${v},${v},${v + 4})`;
    g.fillRect(Math.floor(rand() * 128), Math.floor(rand() * 128), 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Asphalt with lane markings; one tile = one city block (ROAD_TILE world units). */
export const ROAD_TILE = 24;
export function makeRoadTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#34373d';
  g.fillRect(0, 0, S, S);
  const rand = mulberry32(21);
  for (let i = 0; i < 9000; i++) {
    const v = 40 + Math.floor(rand() * 40);
    g.fillStyle = `rgba(${v},${v},${v + 3},0.55)`;
    g.fillRect(Math.floor(rand() * S), Math.floor(rand() * S), 2, 2);
  }
  // Roads run along the tile's centre lines.
  const mid = S / 2;
  const roadW = S * 0.3;
  g.fillStyle = '#2d3036';
  g.fillRect(mid - roadW / 2, 0, roadW, S);
  g.fillRect(0, mid - roadW / 2, S, roadW);
  // Kerb lines.
  g.fillStyle = 'rgba(200,196,185,0.55)';
  for (const off of [-roadW / 2, roadW / 2]) {
    g.fillRect(mid + off - 1.5, 0, 3, S);
    g.fillRect(0, mid + off - 1.5, S, 3);
  }
  // Dashed centre lines.
  g.fillStyle = '#e8c547';
  for (let p = 0; p < S; p += 36) {
    g.fillRect(mid - 1.5, p, 3, 20);
    g.fillRect(p, mid - 1.5, 20, 3);
  }
  // Zebra crossings on the four approaches.
  g.fillStyle = 'rgba(235,235,230,0.85)';
  const zb = roadW / 2 + 14;
  for (let k = -roadW / 2 + 6; k < roadW / 2 - 4; k += 12) {
    g.fillRect(mid + k, mid - zb - 18, 7, 18);
    g.fillRect(mid + k, mid + zb, 7, 18);
    g.fillRect(mid - zb - 18, mid + k, 18, 7);
    g.fillRect(mid + zb, mid + k, 18, 7);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Painted rooftop pad: ring with a centre mark ("S" start, star for summit). */
export function makePadTexture(label: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = color;
  g.lineWidth = 12;
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.arc(128, 128, 118, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = color;
  g.font = 'bold 110px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 128, 134);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft outlined rounded square used for the "you can jump here" rings. */
export function makeRingTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  const r = 18;
  const path = (inset: number): void => {
    g.beginPath();
    g.roundRect(inset, inset, S - inset * 2, S - inset * 2, r);
  };
  g.shadowColor = '#fff';
  g.shadowBlur = 14;
  g.strokeStyle = '#fff';
  g.lineWidth = 8;
  path(14);
  g.stroke();
  g.shadowBlur = 0;
  g.lineWidth = 3;
  path(14);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Straight street strip: asphalt, kerb lines and a dashed centre line. Tiles along its length (v). */
export function makeStreetTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b2e34';
  g.fillRect(0, 0, W, H);
  const rand = mulberry32(5);
  for (let i = 0; i < 1400; i++) {
    const v = 34 + Math.floor(rand() * 30);
    g.fillStyle = `rgba(${v},${v},${v + 4},0.6)`;
    g.fillRect(Math.floor(rand() * W), Math.floor(rand() * H), 2, 2);
  }
  g.fillStyle = 'rgba(210,205,190,0.55)';
  g.fillRect(3, 0, 2, H);
  g.fillRect(W - 5, 0, 2, H);
  g.fillStyle = '#d9b43c';
  for (let y = 0; y < H; y += 64) g.fillRect(W / 2 - 1.5, y + 8, 3, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Soft warm light pool for the ground under street lamps (additive). */
export function makeGlowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}