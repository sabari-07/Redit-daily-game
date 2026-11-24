import * as THREE from 'three';
import type { City } from '../../shared/types.js';

const EASING = (t: number): number => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

interface Tween {
  from: { phi: number; theta: number; dist: number; target: THREE.Vector3 };
  to: { phi: number; theta: number; dist: number; target: THREE.Vector3 };
  duration: number;
  elapsed: number;
  onDone?: () => void;
}

export class CameraController {
  private readonly homeTarget = new THREE.Vector3(0, 0, 0);
  private focusDist = 40;
  private readonly homePhi = (56 * Math.PI) / 180;
  private phi = (56 * Math.PI) / 180; // angle from vertical: lower value = more top-down
  private theta = (35 * Math.PI) / 180; // azimuth
  private dist = 60;
  private target = new THREE.Vector3(0, 0, 0);
  private tween: Tween | null = null;
  private isDragging = false;
  private lastMouse = { x: 0, y: 0 };
  private pinchDist = 0;
  private touchCount = 0;

  /** Called on the player's first camera gesture (rotate, zoom, keys): starts the clock. */
  onUserInput: (() => void) | null = null;
  private dragMoved = 0;

  // Bounds
  private readonly MIN_PHI = (25 * Math.PI) / 180;
  private readonly MAX_PHI = (75 * Math.PI) / 180;
  private minDist = 10;
  private maxDist = 120;

  constructor(private readonly camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    // On the window, so a wheel/trackpad pinch over the header or footer zooms the city too.
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onZoomKey);
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd);
    window.addEventListener('keydown', this.onKeyDown);
  }

  fitToCity(city: City): void {
    if (city.buildings.length === 0) return;
    // Find bounding box of all buildings
    let maxR = 0;
    let sumH = 0;
    for (const b of city.buildings) {
      maxR = Math.max(maxR, Math.sqrt(b.x * b.x + b.z * b.z) + b.size / 2);
      sumH += b.height * 1.6;
    }
    // Aim at the middle of the skyline, not the ground, so towers are not cut off at the top.
    this.homeTarget.set(0, (sumH / city.buildings.length) * 0.5, 0);
    this.target.copy(this.homeTarget);
    // Fit the city inside BOTH the vertical and horizontal field of view. Portrait phones are
    // narrow, so the horizontal FOV is the limiting one there (this is what hid the city on mobile).
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.2, this.camera.aspect));
    const limiting = Math.min(vHalf, hHalf);
    this.dist = Math.min(260, (maxR / Math.tan(limiting)) * 0.9 + 6);
    this.maxDist = this.dist * 1.8;
    this.focusDist = Math.max(34, Math.min(80, this.dist * 0.78));
    this.minDist = 10;
    this.updateCamera();
  }

  /** Animated intro fly-in from high above */
  introFlyIn(onDone?: () => void, focus?: THREE.Vector3): void {
    // Start a little higher and closer (not far out in the haze), so the look never changes tone.
    const fromPhi = (34 * Math.PI) / 180;
    const fromDist = this.dist * 1.12;
    this.tween = {
      from: { phi: fromPhi, theta: this.theta, dist: fromDist, target: this.target.clone() },
      // End framed on the robot (so it is never at the screen edge), at the normal play distance.
      to: focus
        ? { phi: this.phi, theta: this.theta, dist: this.focusDist, target: this.focusTarget(focus) }
        : { phi: this.phi, theta: this.theta, dist: this.dist, target: this.target.clone() },
      duration: 1800,
      elapsed: 0,
      ...(onDone !== undefined ? { onDone } : {}),
    };
    this.phi = fromPhi;
    this.dist = fromDist;
  }

  /**
   * Aim between the robot and the city centre so the robot AND the way ahead stay on screen.
   * Portrait phones are narrow: stay closer to the robot so it never sits at the screen edge.
   */
  private focusTarget(p: THREE.Vector3): THREE.Vector3 {
    return p.clone().lerp(this.homeTarget, this.camera.aspect < 0.8 ? 0.12 : 0.35);
  }

  /** Smooth focus on a building */
  focusBuilding(x: number, y: number, z: number): void {
    const targetPos = this.focusTarget(new THREE.Vector3(x, y, z));
    this.tween = {
      from: { phi: this.phi, theta: this.theta, dist: this.dist, target: this.target.clone() },
      // Fixed play distance (not relative to the current zoom, which used to shrink on every jump).
      to: { phi: Math.min(this.phi, this.homePhi), theta: this.theta, dist: this.focusDist, target: targetPos },
      duration: 600,
      elapsed: 0,
    };
  }

  /** Cinematic win pull-out */
  winCinematic(): void {
    this.tween = {
      from: { phi: this.phi, theta: this.theta, dist: this.dist, target: this.target.clone() },
      to: { phi: (55 * Math.PI) / 180, theta: this.theta + (40 * Math.PI) / 180, dist: this.dist * 1.4, target: this.homeTarget.clone() },
      duration: 2500,
      elapsed: 0,
    };
  }

  /** Skip any active tween */
  skipTween(): void {
    if (this.tween) {
      this.phi = this.tween.to.phi;
      this.theta = this.tween.to.theta;
      this.dist = this.tween.to.dist;
      this.target.copy(this.tween.to.target);
      this.tween.onDone?.();
      this.tween = null;
      this.updateCamera();
    }
  }

  update(dt: number): void {
    if (this.tween) {
      this.tween.elapsed += dt;
      const t = Math.min(this.tween.elapsed / this.tween.duration, 1);
      const e = EASING(t);
      this.phi = this.tween.from.phi + (this.tween.to.phi - this.tween.from.phi) * e;
      this.theta = this.tween.from.theta + (this.tween.to.theta - this.tween.from.theta) * e;
      this.dist = this.tween.from.dist + (this.tween.to.dist - this.tween.from.dist) * e;
      this.target.lerpVectors(this.tween.from.target, this.tween.to.target, e);
      if (t >= 1) {
        this.tween.onDone?.();
        this.tween = null;
      }
    }
    this.updateCamera();
  }

  private updateCamera(): void {
    const p = Math.max(this.MIN_PHI, Math.min(this.MAX_PHI, this.phi));
    const x = this.dist * Math.sin(p) * Math.sin(this.theta);
    const y = this.dist * Math.cos(p);
    const z = this.dist * Math.sin(p) * Math.cos(this.theta);
    this.camera.position.set(
      this.target.x + x,
      this.target.y + y,
      this.target.z + z
    );
    this.camera.lookAt(this.target);
  }

  recenter(): void {
    this.target.copy(this.homeTarget);
    this.updateCamera();
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.dragMoved = 0;
    this.lastMouse = { x: e.clientX, y: e.clientY };
    this.tween = null;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.dragMoved += Math.abs(dx) + Math.abs(dy);
    if (this.dragMoved > 6) this.onUserInput?.();
    this.theta -= dx * 0.004;
    this.phi -= dy * 0.004;
    this.lastMouse = { x: e.clientX, y: e.clientY };
  };

  private onMouseUp = (): void => { this.isDragging = false; };

  /** Zooms the city camera. Positive = out. */
  zoomBy(amount: number): void {
    this.onUserInput?.();
    this.tween = null;
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist + amount));
  }

  /**
   * Mouse wheel / trackpad pinch (ctrl+wheel) anywhere on the game: never zoom the page.
   * Inside an open popup a plain wheel scrolls the popup instead.
   */
  private onWheel = (e: WheelEvent): void => {
    const inPopup = e.target instanceof Element && e.target.closest('.modal-overlay') !== null;
    if (inPopup && !e.ctrlKey) return;
    e.preventDefault();
    if (inPopup) return;
    // Trackpad pinches send small deltas, wheel notches ~100: scale, then cap each step.
    const step = e.ctrlKey ? e.deltaY * 0.35 : e.deltaY * 0.05;
    this.zoomBy(Math.max(-8, Math.min(8, step)));
  };

  /** Ctrl/Cmd + plus, minus, 0 zoom the city instead of the browser page. */
  private onZoomKey = (e: KeyboardEvent): void => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.zoomBy(-6);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.zoomBy(6);
    } else if (e.key === '0') {
      e.preventDefault();
    }
  };
  private onKeyDown = (e: KeyboardEvent): void => {
    const panSpeed = 2;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S', 'q', 'Q', 'e', 'E'].includes(e.key)) this.onUserInput?.();
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': this.theta -= 0.05; break;
      case 'ArrowRight': case 'd': case 'D': this.theta += 0.05; break;
      case 'ArrowUp': case 'w': case 'W': this.phi -= 0.05; break;
      case 'ArrowDown': case 's': case 'S': this.phi += 0.05; break;
      case 'q': case 'Q': this.theta -= 0.08; break;
      case 'e': case 'E': this.theta += 0.08; break;
    }
    void panSpeed;
  };

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    this.touchCount = e.touches.length;
    if (e.touches.length === 1) {
      const t = e.touches[0];
      this.lastMouse = { x: t.clientX, y: t.clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.pinchDist = Math.sqrt(dx * dx + dy * dy);
    }
    this.tween = null;
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1 && this.touchCount === 1) {
      const t = e.touches[0];
      const dx = t.clientX - this.lastMouse.x;
      const dy = t.clientY - this.lastMouse.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.onUserInput?.();
      this.theta -= dx * 0.006;
      this.phi -= dy * 0.006;
      this.lastMouse = { x: t.clientX, y: t.clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      const delta = this.pinchDist - newDist;
      this.onUserInput?.();
      this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist + delta * 0.1));
      this.pinchDist = newDist;
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    this.touchCount = e.touches.length;
  };

  dispose(canvas: HTMLCanvasElement): void {
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onZoomKey);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    canvas.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('keydown', this.onKeyDown);
  }
}
