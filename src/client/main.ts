import * as THREE from 'three';
import type { Tool, RunResult } from '../shared/types.js';
import { SceneRenderer } from './scene/renderer.js';
import { CityView } from './scene/cityView.js';
import { CameraController } from './scene/camera.js';
import { Hero } from './scene/hero.js';
import { ArcPreview } from './scene/arcs.js';
import { EffectsManager, Tweener } from './scene/effects.js';
import { GameState } from './state.js';
import { GameHUD } from './ui/hud.js';
import { InspectorPanel } from './ui/inspector.js';
import { ResultCard } from './ui/result.js';
import { LeaderboardPanel } from './ui/leaderboard.js';
import { HintsManager } from './ui/hints.js';
import { closeModal } from './ui/modal.js';
import { installUiScale } from './ui/uiScale.js';
import { showErrorState, showToast } from './ui/toast.js';
import { init as apiInit, submitRun, startClock } from './api.js';
import {
  installAudioUnlock, playJump, playLand, playGlide, playGrapple, playGoldChime,
  playCollapse, playWin, playLose, playSelect, playStart, playError,
} from './audio.js';
import { solveRoute, nextStep } from '../shared/solver.js';
import { trackAppReady, trackJourneyStart, trackJump, trackAbandon } from './telemetry.js';

const FLOOR_HEIGHT = 1.6;
const ROOF_TOP = 0.46;
const roofY = (height: number): number => height * FLOOR_HEIGHT + ROOF_TOP;

async function main(): Promise<void> {
  installAudioUnlock();
  installUiScale();

  // The page must never zoom: only the city camera does. Safari sends gesture* events for
  // pinches and ignores user-scalable=no, and a pinch starting on the HUD would zoom the page.
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    // A quick double tap outside the city would zoom the page on some phones.
    const now = Date.now();
    if (now - lastTouchEnd < 300 && !(e.target instanceof HTMLCanvasElement)) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const hud = document.getElementById('hud');
  if (!canvas || !hud) throw new Error('Missing game elements');

  const renderer = new SceneRenderer(canvas);
  renderer.resize();
  window.addEventListener('resize', () => renderer.resize());

  let initData: Awaited<ReturnType<typeof apiInit>>;
  try {
    initData = await apiInit();
  } catch {
    showErrorState("Today's city could not be loaded. Check your connection.", () => window.location.reload());
    return;
  }
  const { city, username, streak, hasFinished, myBest, dayNumber } = initData;

  const cityView = new CityView();
  cityView.buildFromCity(city, renderer);
  const tweener = new Tweener();
  const state = new GameState();
  state.startGame(city, initData.clockStartedAt, initData.serverNow);

  const camera = new CameraController(renderer.camera, canvas);
  camera.fitToCity(city);
  window.addEventListener('resize', () => camera.fitToCity(city));

  const hero = new Hero(cityView.scene);
  const arc = new ArcPreview(cityView.scene);
  const effects = new EffectsManager(cityView.scene, tweener);
  const startB = city.buildings[city.startIndex];
  const summitB = city.buildings[city.summitIndex];
  hero.placeOnBuilding(startB.x, startB.z, startB.height);
  hero.lookToward(summitB.x, summitB.z);

  const focusHero = (): void => {
    const b = state.run ? city.buildings[state.run.pos] : startB;
    camera.focusBuilding(b.x, roofY(b.height), b.z);
  };
  camera.introFlyIn(undefined, new THREE.Vector3(startB.x, roofY(startB.height), startB.z));

  let rankedPoints: number | undefined = myBest?.points;
  let tools: Tool[] = [];

  const inspector = new InspectorPanel(hud);
  const resultCard = new ResultCard();
  const leaderboard = new LeaderboardPanel(username);
  const hints = new HintsManager();

  // ---------- The clock ----------
  // Starts on the FIRST of: Start, picking a tool, rotating/zooming the city, tapping a roof.
  // So looking around before playing counts as playing.
  let startPending = false;
  const ensureStarted = (): void => {
    if (state.clockStartedAt !== null || startPending) return;
    startPending = true;
    const est = Date.now();
    state.clockStarted(est, est); // show the running clock immediately
    playStart();
    trackJourneyStart();
    startClock().then(
      ({ startedAt, serverNow }) => state.clockStarted(startedAt, serverNow),
      () => showToast('Could not reach the server. Your time may not be saved.', 'error')
    );
  };
  camera.onUserInput = ensureStarted;

  const gameHUD = new GameHUD(hud, state, {
    onStart: ensureStarted,
    onJump: () => executeJump(),
    onUndo: () => { resultCard.hide(); canvas.style.filter = ''; state.undo(); },
    onReset: () => { resultCard.hide(); canvas.style.filter = ''; state.reset(); },
    onRecenter: focusHero,
    onToggleLeaderboard: () => leaderboard.toggle(),
    onShowRules: () => hints.showRulesSheet(),
    onHint: () => useHint(),
  });

  // ---------- One hint per level ----------
  // Blinks the next roof of a shortest route from where the hero stands, plus the tool to pick.
  const hintKey = `sky:hint:${city.dayKey}`;
  const readHintUsed = (): boolean => {
    try { return localStorage.getItem(hintKey) === '1'; } catch { return false; }
  };
  let hintUsed = readHintUsed();
  gameHUD.setHintsLeft(hintUsed ? 0 : 1);
  const clearHint = (): void => {
    cityView.setHint(null);
    gameHUD.blinkTool(null);
  };
  function useHint(): void {
    if (hintUsed) {
      showToast("You have used this level's hint.", 'info');
      return;
    }
    if (!state.run || (state.phase !== 'playing' && state.phase !== 'ready')) return;
    ensureStarted();
    const r = state.run;
    const step = nextStep(city, { pos: r.pos, glideLeft: r.glideLeft, grappleLeft: r.grappleLeft, collapsed: r.collapsed });
    if (!step) {
      showToast('No route to the Summit from here. Undo or Restart first (your hint is kept).', 'error');
      return;
    }
    hintUsed = true;
    try { localStorage.setItem(hintKey, '1'); } catch { /* the hint still works this session */ }
    gameHUD.setHintsLeft(0);
    state.select(null);
    cityView.setHint(step.to);
    gameHUD.blinkTool(step.tool === 'walk' ? null : step.tool);
    const t = city.buildings[step.to];
    camera.focusBuilding(t.x, roofY(t.height), t.z);
    showToast(step.tool === 'walk'
      ? 'Hint: Walk to the blinking roof.'
      : `Hint: pick ${step.tool === 'glide' ? 'Glide' : 'Grapple'} (blinking), then tap the blinking roof.`, 'info');
  }
  gameHUD.updateStreak(streak);
  inspector.onClose = () => state.select(null);

  // ---------- Rings and floor tags ----------
  const refreshReach = (): void => {
    if (state.phase !== 'playing' && state.phase !== 'ready') {
      cityView.setReach(null, 'walk', null, null, null);
      cityView.setFloorLabels(null, new Set());
      return;
    }
    cityView.setReach(state.reachable(), state.currentTool, state.reachableWithOtherTool(), null, null);
    cityView.setFloorLabels(state.run?.pos ?? null, state.run?.collapsed ?? new Set());
  };
  refreshReach();

  // Dev-only hook (mock mode) so automated browser checks can find roofs on screen.
  if (new URLSearchParams(window.location.search).has('mock')) {
    (window as unknown as { __sky: unknown }).__sky = {
      state,
      hero,
      camera,
      cityView,
      route: solveRoute(city),
      screenOf: (i: number): [number, number] => {
        const b = city.buildings[i];
        if (!b) return [-1, -1];
        const v = new THREE.Vector3(b.x, roofY(b.height) - 0.3, b.z).project(renderer.camera);
        return [Math.round(((v.x + 1) / 2) * window.innerWidth), Math.round(((1 - v.y) / 2) * window.innerHeight)];
      },
    };
  }

  state.on('tool-change', () => {
    if (state.selectedIndex === null) refreshReach();
  });

  state.on('selection-change', ({ index, check }) => {
    for (let i = 0; i < city.buildings.length; i++) cityView.showSign(i, false);
    if (index === null) {
      arc.hide();
      inspector.hide();
      refreshReach();
      return;
    }
    const b = city.buildings[index];
    inspector.show(b, check);
    cityView.showSign(index, true);
    const from = state.run ? city.buildings[state.run.pos] : null;
    if (check?.valid && from) {
      arc.show(from, b, check);
      playSelect();
    } else {
      arc.hide();
      if (check) playError();
    }
    cityView.setReach(
      state.reachable(),
      state.currentTool,
      state.reachableWithOtherTool(),
      check?.valid ? state.lookahead(index) : null,
      check ? { index, valid: check.valid, tool: check.tool } : null
    );
  });

  state.on('move', ({ state: run, move }) => {
    clearHint();
    tools.push(move.tool);
    arc.hide();
    inspector.hide();
    cityView.setReach(null, 'walk', null, null, null);
    cityView.setFloorLabels(null, new Set());
    for (let i = 0; i < city.buildings.length; i++) cityView.showSign(i, false);

    const prevIdx = run.path[run.path.length - 2];
    const prevB = city.buildings[prevIdx];
    const toB = city.buildings[run.pos];
    if (move.tool === 'glide') playGlide();
    else if (move.tool === 'grapple') playGrapple();
    else playJump();
    hero.animateJump(prevB.x, prevB.z, prevB.height, toB.x, toB.z, toB.height, move.tool, tweener, () => {
      playLand();
      effects.spawnLandingDust(toB.x, roofY(toB.height), toB.z);
      const before = state.moveHistory[state.moveHistory.length - 1]?.before;
      if (run.goldCollected.has(run.pos) && before && !before.goldCollected.has(run.pos)) {
        cityView.setCollected(run.goldCollected); // the coin is picked up and disappears
        effects.spawnGoldSparkles(toB.x, roofY(toB.height), toB.z);
        effects.spawnFloatingText(toB.x, roofY(toB.height), toB.z, '+100 GOLD');
        playGoldChime();
      }
      if (run.collapsed.has(prevIdx)) {
        effects.spawnCollapse(prevB.x, prevB.z, 0, roofY(prevB.height));
        playCollapse();
      }
      camera.focusBuilding(toB.x, roofY(toB.height), toB.z);
      refreshReach();
    });
    trackJump(run.moveCount, city.par, move.tool);
    gameHUD.updateFromState();
  });

  state.on('undo', () => {
    if (!state.run) return;
    const b = city.buildings[state.run.pos];
    hero.placeOnBuilding(b.x, b.z, b.height);
    cityView.setCollected(state.run.goldCollected); // Undo puts the coin back
    clearHint();
    arc.hide();
    inspector.hide();
    tools.pop();
    gameHUD.updateFromState();
    refreshReach();
  });

  state.on('reset', () => {
    hero.placeOnBuilding(startB.x, startB.z, startB.height);
    hero.lookToward(summitB.x, summitB.z);
    hero.clearPath();
    cityView.setCollected(new Set());
    clearHint();
    arc.hide();
    inspector.hide();
    tools = [];
    gameHUD.updateFromState();
    refreshReach();
    focusHero();
  });

  const showResult = (result: RunResult, rank: number, finalStreak: number, practice: boolean): void => {
    resultCard.show({
      result,
      city,
      dayNumber,
      tools,
      streak: finalStreak,
      rank,
      username,
      practice,
      ...(rankedPoints !== undefined ? { rankedPoints } : {}),
      onRetry: () => { canvas.style.filter = ''; state.reset(); },
      onClose: () => {},
    });
  };

  state.on('win', ({ result }) => {
    playWin();
    camera.winCinematic();
    const s = city.buildings[city.summitIndex];
    effects.spawnWinConfetti(s.x, roofY(s.height), s.z);
    renderer.setBloomStrength(0.8);
    setTimeout(() => renderer.setBloomStrength(0.22), 1500);

    void (async () => {
      let shown = result;
      let rank = 0;
      let finalStreak = streak;
      let practice = rankedPoints !== undefined;
      try {
        // The server re-checks the moves and scores them with ITS clock; show its numbers.
        const r = await submitRun(state.getMoves(), state.clockStartedAt);
        shown = { ...result, points: r.points, elapsedMs: r.elapsedMs ?? result.elapsedMs ?? 0 };
        rank = r.rank;
        finalStreak = r.streak;
        practice = r.practice;
        if (!practice) rankedPoints = r.points;
      } catch {
        showToast('Your run could not be saved. Check your connection.', 'error');
      }
      setTimeout(() => showResult(shown, rank, finalStreak, practice), 1100);
    })();
  });

  state.on('lose', ({ reason }) => {
    playLose();
    canvas.style.filter = 'saturate(0.75)';
    resultCard.show({
      result: { won: false, moves: state.run?.moveCount ?? 0, goldCollected: 0, points: 0, path: [] },
      city,
      dayNumber,
      tools,
      streak,
      rank: 0,
      username,
      practice: false,
      loseReason: reason,
      onUndo: () => { canvas.style.filter = ''; state.undo(); },
      onRetry: () => { canvas.style.filter = ''; state.reset(); },
      onClose: () => { canvas.style.filter = ''; },
    });
  });

  function executeJump(): void {
    if (state.phase !== 'playing' || state.selectedIndex === null) return;
    if (!state.jump()) {
      const check = state.checkJump(state.selectedIndex);
      if (check && !check.valid) {
        gameHUD.showInvalidMove(check.reason ?? 'Out of reach');
        playError();
      }
    }
  }

  // ---------- Tapping roofs ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt: { x: number; y: number } | null = null;

  const tmp = new THREE.Vector3();
  const toScreen = (x: number, y: number, z: number, rect: DOMRect): [number, number] => {
    tmp.set(x, y, z).project(renderer.camera);
    return [rect.left + ((tmp.x + 1) / 2) * rect.width, rect.top + ((1 - tmp.y) / 2) * rect.height];
  };

  /**
   * Which roof did the player mean? Taps snap to the nearest ROOF on screen (tall towers in
   * front no longer steal the tap), preferring roofs that are reachable right now.
   */
  function roofAt(clientX: number, clientY: number): number | null {
    const rect = canvas!.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, renderer.camera);
    let rayHit: number | null = null;
    for (const hit of raycaster.intersectObjects(cityView.scene.children, true)) {
      const idx = hit.object.userData['buildingIndex'] as unknown;
      if (typeof idx === 'number') {
        rayHit = idx;
        break;
      }
    }
    const reachable = state.reachable();
    const other = state.reachableWithOtherTool();
    let best: number | null = null;
    let bestScore = Infinity;
    for (const b of city.buildings) {
      const y = roofY(b.height);
      const [cx, cy] = toScreen(b.x, y, b.z, rect);
      const h = b.size / 2;
      let radius = 0;
      for (const [dx, dz] of [[h, h], [-h, h], [h, -h], [-h, -h]] as const) {
        const [sx, sy] = toScreen(b.x + dx, y, b.z + dz, rect);
        radius = Math.max(radius, Math.hypot(sx - cx, sy - cy));
      }
      radius = Math.max(radius, 18); // small far roofs stay tappable on phones
      const d = Math.hypot(clientX - cx, clientY - cy) / radius;
      if (d > 1.1) continue;
      let score = d;
      if (reachable.has(b.index)) score -= 0.5;
      else if (other.has(b.index)) score -= 0.3;
      if (b.index === rayHit) score -= 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = b.index;
      }
    }
    return best ?? rayHit;
  }

  function handleTap(clientX: number, clientY: number): void {
    const idx = roofAt(clientX, clientY);
    if (idx === null) {
      state.select(null);
      return;
    }
    ensureStarted();
    if (state.phase !== 'playing' || !state.run) return;
    camera.skipTween();
    if (state.selectedIndex === idx) {
      executeJump(); // second tap on the same roof = jump
      return;
    }
    state.select(idx === state.run.pos ? null : idx);
  }

  // A tap is a press and release that barely moved (a drag is a camera rotate).
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y);
    downAt = null;
    if (moved < 8) handleTap(e.clientX, e.clientY);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.phase === 'playing' && (state.run?.moveCount ?? 0) > 0) trackAbandon();
  }, { once: true });

  trackAppReady();
  gameHUD.updateFromState();

  if (hasFinished && myBest) {
    // Already finished today: show the ranked result; further runs are practice.
    setTimeout(() => {
      closeModal();
      showResult(
        { won: true, moves: myBest.moves, goldCollected: 0, points: myBest.points, path: myBest.path, elapsedMs: myBest.timeMs },
        0,
        streak,
        false
      );
    }, 600);
  }

  let last = 0;
  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    const dt = last ? Math.min(100, now - last) : 16;
    last = now;
    camera.update(dt);
    tweener.update(dt);
    hero.update(dt);
    arc.update(dt);
    cityView.update(now, dt);
    // Haze scales with camera distance: the city stays crisp at any zoom (phones sit farther back),
    // while the distant skyline still fades into the horizon.
    if (cityView.scene.fog instanceof THREE.FogExp2) cityView.scene.fog.density = 0.3 / Math.max(40, renderer.camera.position.length());
    gameHUD.tick();
    renderer.render(cityView.scene, now);
  };
  requestAnimationFrame(frame);
}

main().catch((err: unknown) => {
  console.error('Fatal game error:', err);
  showErrorState('The game failed to start. Please reload.', () => window.location.reload());
});
