import type { Building } from '../../shared/types.js';
import type { JumpCheck } from '../../shared/rules.js';

function openThread(permalink: string): void {
  if (!permalink) return;
  try {
    window.parent.postMessage({ type: 'devvit-navigate', url: permalink }, '*');
  } catch {
    window.open(`https://reddit.com${permalink}`, '_blank', 'noopener');
  }
}

function formatNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const TOOL_NAME = { walk: 'Walk', glide: 'Glide', grapple: 'Grapple' } as const;

/** Card for the selected roof: the post, the jump numbers, and what to do next. */
export class InspectorPanel {
  private el: HTMLElement;
  private titleEl: HTMLElement;
  private statsEl: HTMLElement;
  private tagsEl: HTMLElement;
  private jumpEl: HTMLElement;
  private actionEl: HTMLElement;
  private openBtn: HTMLButtonElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'inspector panel hidden';
    this.el.setAttribute('role', 'complementary');
    this.el.setAttribute('aria-label', 'Selected roof');

    const close = document.createElement('button');
    close.className = 'close-x';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', () => this.onClose?.());

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'inspector-title';
    this.statsEl = document.createElement('div');
    this.statsEl.className = 'inspector-stats';
    this.tagsEl = document.createElement('div');
    this.tagsEl.className = 'tag-chips';
    this.jumpEl = document.createElement('div');
    this.jumpEl.className = 'validity-line';
    this.actionEl = document.createElement('div');
    this.actionEl.className = 'inspector-action';
    this.openBtn = document.createElement('button');
    this.openBtn.className = 'btn-text';
    this.openBtn.textContent = 'Open the post';

    this.el.append(close, this.titleEl, this.statsEl, this.tagsEl, this.jumpEl, this.actionEl, this.openBtn);
    parent.appendChild(this.el);
  }

  onClose: (() => void) | null = null;

  show(building: Building, check: JumpCheck | null): void {
    this.titleEl.textContent = building.title;
    this.statsEl.textContent = `${formatNum(building.score)} Buzz · ${formatNum(building.numComments)} Chatter · ${building.height} floors`;

    this.tagsEl.replaceChildren();
    const label: Record<string, string> = { summit: 'Summit (goal)', start: 'Start', gold: 'Gold +100', cracked: 'Damaged: collapses after you leave' };
    for (const tag of building.tags) {
      const chip = document.createElement('span');
      chip.className = `tag-chip ${tag}`;
      chip.textContent = label[tag] ?? tag;
      this.tagsEl.appendChild(chip);
    }

    if (check) {
      const rise = check.rise ?? 0;
      const dist = check.gap !== undefined ? `${check.gap.toFixed(1)} tiles away` : '';
      const h = rise === 0 ? 'same height' : `${Math.abs(rise)} floor${Math.abs(rise) === 1 ? '' : 's'} ${rise > 0 ? 'up' : 'down'}`;
      this.jumpEl.className = `validity-line ${check.valid ? 'valid' : 'invalid'}`;
      this.jumpEl.textContent = check.valid
        ? `${dist}, ${h}: ${TOOL_NAME[check.tool]} reaches it${check.tool === 'walk' ? ' (free)' : ' (uses 1)'}.`
        : (check.reason ?? 'Out of reach.');
      this.actionEl.textContent = check.valid ? 'Tap the roof again to jump.' : check.suggest ? '' : 'Try another roof first.';
      this.actionEl.hidden = this.actionEl.textContent === '';
    } else {
      this.jumpEl.className = 'validity-line';
      this.jumpEl.textContent = 'You are here.';
      this.actionEl.hidden = true;
    }

    this.openBtn.hidden = !building.permalink;
    this.openBtn.onclick = () => openThread(building.permalink);

    this.el.classList.remove('hidden');
    this.el.classList.add('visible');
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.el.classList.remove('visible');
  }

  dispose(): void {
    this.el.remove();
  }
}
