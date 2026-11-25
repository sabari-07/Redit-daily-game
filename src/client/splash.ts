import * as THREE from 'three';
import { buildCity } from '../shared/city.js';
import { utcDayKey } from '../shared/date.js';
import type { City, InitResponse, RawPost } from '../shared/types.js';
import { CityView } from './scene/cityView.js';
import { installUiScale } from './ui/uiScale.js';
import { isMockMode, getMockInitResponse } from './mock.js';

function generateFixturePosts(n: number): RawPost[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t3_fixture_${i + 1}`,
    title: `Community post about interesting topic number ${i + 1}`,
    score: Math.floor((n - i) * 450 + Math.pow(i + 1, 1.5) * 20),
    numComments: Math.floor(i * 12 + 5),
    permalink: `/r/community/comments/fixture${i + 1}/post_title/`,
  }));
}

/** Requests the expanded game view via Devvit postMessage */
function requestExpand(): void {
  try {
    window.parent.postMessage({ type: 'devvit-request-expand', entrypoint: 'game' }, '*');
  } catch {
    // Fallback: direct navigation (not in Devvit context)
    window.location.href = './game.html';
  }
}

async function fetchInitData(): Promise<InitResponse> {
  if (isMockMode()) return getMockInitResponse();
  const res = await fetch('/api/init');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<InitResponse>;
}

function fallbackCity(): City {
  return buildCity(generateFixturePosts(20), 'community', utcDayKey());
}

interface MiniScene { scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; radius: number; midY: number }

/** Low-cost version of the game scene: same sky, ground and buildings, no post-processing. */
function buildMiniScene(city: City): MiniScene {
  const canvas = document.getElementById('splash-canvas') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);

  const view = new CityView();
  view.buildFromCity(city, { tier: 'low', setupComposer: () => {} });

  const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 1000);
  let maxR = 0;
  let sumH = 0;
  for (const b of city.buildings) {
    maxR = Math.max(maxR, Math.hypot(b.x, b.z) + b.size / 2);
    sumH += b.height * 1.6;
  }
  const vHalf = (camera.fov * Math.PI) / 360;
  const limiting = Math.min(vHalf, Math.atan(Math.tan(vHalf) * Math.max(0.2, camera.aspect)));
  // The text block covers the lower part of the view, so aim a little low and frame a bit wider.
  const radius = Math.min(260, (maxR / Math.tan(limiting)) * 1.15 + 6);
  return { scene: view.scene, renderer, camera, radius, midY: (sumH / city.buildings.length) * 0.5 };
}
async function main(): Promise<void> {
  installUiScale();
  // Show CSS gradient + title immediately (never block on 3D)
  const splashEl = document.getElementById('splash')!;
  splashEl.style.display = 'flex';

  // Load API data
  let initData: InitResponse | null = null;
  try {
    initData = await fetchInitData();
  } catch {
    // Show play button anyway — game will retry on expand
  }

  // Update UI with real data
  if (initData) {
    const city = initData.city;
    const summitTitle = city.buildings[city.summitIndex]?.title ?? '';
    const teaserEl = document.getElementById('splash-teaser');
    if (teaserEl && summitTitle) {
      teaserEl.innerHTML = '';
      const prefix = document.createTextNode('Reach: ');
      const strong = document.createElement('strong');
      strong.textContent = `"${summitTitle}"`;
      teaserEl.append(prefix, strong);
    }

    const statsEl = document.getElementById('splash-stats');
    if (statsEl && initData.streak > 0) {
      statsEl.innerHTML = '';
      const streakSpan = document.createElement('span');
      streakSpan.textContent = `🔥 ${initData.streak} day streak`;
      statsEl.appendChild(streakSpan);
    }

    if (initData.hasFinished && initData.myBest) {
      const playBtn = document.getElementById('play-btn') as HTMLButtonElement | null;
      if (playBtn) {
        playBtn.textContent = 'View results';
        const pts = document.getElementById('splash-points');
        if (pts) pts.textContent = `${initData.myBest.points} pts`;
      }
    }

    // Attribution
    const attrEl = document.getElementById('splash-attribution');
    if (attrEl) {
      attrEl.textContent = `City built from r/${city.subreddit}'s day`;
    }

    // Date
    const dateEl = document.getElementById('splash-date');
    if (dateEl) {
      dateEl.textContent = city.dayKey;
    }
  }

  // Build 3D scene after UI is painted. Uses today's real city when available.
  const cityForScene: City = initData?.city ?? fallbackCity();
  requestAnimationFrame(() => {
    let mini: MiniScene;
    try {
      mini = buildMiniScene(cityForScene);
    } catch {
      return; // UI and Play button still work without 3D
    }
    const { scene, renderer, camera, radius, midY } = mini;
    let angle = 0.6;
    let frameCount = 0;
    let running = true;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const elevation = 0.62; // radians above the horizon

    const place = (): void => {
      const horiz = Math.cos(elevation) * radius;
      camera.position.set(Math.cos(angle) * horiz, midY + Math.sin(elevation) * radius, Math.sin(angle) * horiz);
      camera.lookAt(0, midY * 0.6, 0);
    };
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = 0.3 / Math.max(40, radius);
    place();
    renderer.render(scene, camera); // static first frame immediately

    const loop = (): void => {
      if (!running) return;
      requestAnimationFrame(loop);
      frameCount++;
      if (frameCount % 2 !== 0) return; // 30 fps cap
      if (!reduceMotion) angle += 0.004;
      place();
      renderer.render(scene, camera);
    };
    requestAnimationFrame(loop);

    window.addEventListener('beforeunload', () => { running = false; });
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) requestAnimationFrame(loop);
    });
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
  });
  // Play button
  const playBtn = document.getElementById('play-btn');
  playBtn?.addEventListener('click', requestExpand);
}

main().catch(() => {
  // Splash UI still works even if 3D fails
  const playBtn = document.getElementById('play-btn');
  playBtn?.addEventListener('click', requestExpand);
});
