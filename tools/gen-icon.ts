/**
 * Generates assets/icon.png (1024x1024) with a Skyline silhouette.
 * Run with: npx tsx tools/gen-icon.ts
 * Requires: canvas package (npm i -D canvas)
 */

import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'assets', 'icon.png');
const SIZE = 1024;

function main(): void {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  // Background gradient — deep midnight sky
  const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
  bg.addColorStop(0, '#060d1f');
  bg.addColorStop(1, '#1a1040');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const starPositions = [
    [120, 80], [300, 50], [480, 130], [650, 60], [820, 90], [950, 150],
    [200, 180], [550, 200], [750, 170], [900, 220],
    [80, 250], [420, 260], [680, 230], [870, 280],
  ] as const;
  for (const [x, y] of starPositions) {
    const r = 1.5 + Math.random() * 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Moon
  const moonGrad = ctx.createRadialGradient(820, 160, 0, 820, 160, 55);
  moonGrad.addColorStop(0, '#fffbe0');
  moonGrad.addColorStop(0.6, '#d0d8f0');
  moonGrad.addColorStop(1, 'rgba(180,190,220,0)');
  ctx.fillStyle = moonGrad;
  ctx.beginPath();
  ctx.arc(820, 160, 55, 0, Math.PI * 2);
  ctx.fill();

  // Atmospheric glow behind skyline
  const glow = ctx.createRadialGradient(512, SIZE * 0.72, 0, 512, SIZE * 0.72, 400);
  glow.addColorStop(0, 'rgba(100,80,220,0.35)');
  glow.addColorStop(0.5, 'rgba(60,30,160,0.15)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ── Skyline silhouette ───────────────────────────────────────────────
  // Buildings: [x, y_base, width, height] — y measured from bottom
  const groundY = SIZE * 0.78;
  interface BuildingDef {
    x: number; w: number; h: number;
    windows?: boolean; summit?: boolean; antenna?: boolean;
  }
  const buildings: BuildingDef[] = [
    { x: 20,  w: 55,  h: 160 },
    { x: 85,  w: 80,  h: 240, windows: true },
    { x: 170, w: 60,  h: 180 },
    { x: 235, w: 100, h: 320, windows: true, antenna: true },
    { x: 340, w: 70,  h: 200 },
    { x: 415, w: 130, h: 460, windows: true, summit: true }, // summit building
    { x: 550, w: 90,  h: 280, windows: true },
    { x: 645, w: 65,  h: 210 },
    { x: 715, w: 110, h: 350, windows: true, antenna: true },
    { x: 830, w: 75,  h: 190 },
    { x: 910, w: 85,  h: 250, windows: true },
    { x: 1000, w: 50, h: 140 },
  ];

  // Shadow pass
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (const b of buildings) {
    const top = groundY - b.h;
    ctx.fillRect(b.x + 6, top + 6, b.w, b.h);
  }

  for (const b of buildings) {
    const top = groundY - b.h;

    // Building body
    if (b.summit) {
      const grad = ctx.createLinearGradient(b.x, top, b.x + b.w, groundY);
      grad.addColorStop(0, '#6a30c8');
      grad.addColorStop(0.5, '#3a1a80');
      grad.addColorStop(1, '#1a0a50');
      ctx.fillStyle = grad;
    } else {
      const lum = 0.08 + (b.h / 460) * 0.12;
      ctx.fillStyle = `hsl(230, 40%, ${Math.round(lum * 100)}%)`;
    }
    ctx.fillRect(b.x, top, b.w, b.h);

    // Window grid
    if (b.windows) {
      const cols = Math.floor(b.w / 16);
      const rows = Math.floor(b.h / 20);
      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          const lit = Math.random() > 0.4;
          if (!lit) continue;
          const wx = b.x + 6 + col * 16;
          const wy = top + 8 + row * 20;
          const alpha = 0.4 + Math.random() * 0.5;
          ctx.fillStyle = `rgba(255, 240, 160, ${alpha})`;
          ctx.fillRect(wx, wy, 8, 10);
        }
      }
    }

    // Summit beacon
    if (b.summit) {
      const beamGrad = ctx.createRadialGradient(b.x + b.w / 2, top, 0, b.x + b.w / 2, top, 80);
      beamGrad.addColorStop(0, 'rgba(255,100,200,0.9)');
      beamGrad.addColorStop(0.4, 'rgba(200,60,180,0.4)');
      beamGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(b.x - 50, top - 80, b.w + 100, 90);

      // Crown
      ctx.fillStyle = '#ff64c8';
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, top - 10, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Antenna
    if (b.antenna) {
      ctx.strokeStyle = '#8899cc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x + b.w / 2, top);
      ctx.lineTo(b.x + b.w / 2, top - 40);
      ctx.stroke();
      ctx.fillStyle = '#ff4466';
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, top - 42, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ground / horizon glow
  const horizGrad = ctx.createLinearGradient(0, groundY - 30, 0, groundY + 60);
  horizGrad.addColorStop(0, 'rgba(80,50,180,0.6)');
  horizGrad.addColorStop(0.5, 'rgba(30,10,80,0.8)');
  horizGrad.addColorStop(1, '#060310');
  ctx.fillStyle = horizGrad;
  ctx.fillRect(0, groundY - 20, SIZE, SIZE - groundY + 20);

  // Courier character on summit roof (tiny silhouette)
  const sb = buildings.find((b) => b.summit)!;
  const sbTop = groundY - sb.h;
  ctx.fillStyle = '#fff';
  // Body
  ctx.beginPath();
  ctx.ellipse(sb.x + sb.w / 2, sbTop - 24, 7, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.arc(sb.x + sb.w / 2, sbTop - 40, 7, 0, Math.PI * 2);
  ctx.fill();

  // "SKYLINE" wordmark at bottom
  ctx.font = `bold ${SIZE * 0.065}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Glow
  ctx.shadowColor = '#8060ff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#c8b0ff';
  ctx.fillText('SKYLINE', SIZE / 2, SIZE * 0.91);
  ctx.shadowBlur = 0;

  // Write PNG
  mkdirSync(dirname(OUT), { recursive: true });
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(OUT, buffer);
  console.log(`Icon written to ${OUT} (${buffer.length} bytes)`);
}

main();
