import { SCORE_RULES } from '../../shared/scoring.js';
import { GLIDE_GAP, GRAPPLE_GAP, WALK_GAP, WALK_RISE } from '../../shared/rules.js';
import { openModal } from './modal.js';

/** The How-to-play sheet. (In-game help is the single Hint per level, see main.ts.) */
export class HintsManager {
  showRulesSheet(): void {
    const m = openModal({ id: 'rules-sheet', title: 'How to play' });
    const p = (text: string): HTMLElement => {
      const e = document.createElement('p');
      e.className = 'rules-text';
      e.textContent = text;
      return e;
    };
    const h = (text: string): HTMLElement => {
      const e = document.createElement('div');
      e.className = 'rules-heading';
      e.textContent = text;
      return e;
    };
    const table = (rows: Array<[string, string]>): HTMLElement => {
      const t = document.createElement('div');
      t.className = 'rules-table';
      for (const [a, b] of rows) {
        const k = document.createElement('span');
        k.textContent = a;
        const v = document.createElement('span');
        v.textContent = b;
        t.append(k, v);
      }
      return t;
    };
    m.body.append(
      p("Every building is one of today's community posts: more Buzz = taller, more Chatter = more lit windows. A new city is built every day. Get your hero from the START roof to the gold-star SUMMIT in as few jumps and as little time as you can."),
      h('Jumping'),
      p('1. Pick a tool at the bottom (Walk is selected by default).  2. Tap a roof to check it.  3. Tap the same roof again to jump. Glide and Grapple are never used unless you pick them, and the tool goes back to Walk after each jump.'),
      table([
        ['Walk (free)', `up to ${WALK_GAP} tiles away and at most ${WALK_RISE} floors up or down`],
        ['Glide', `up to ${GLIDE_GAP} tiles, only to a roof the same height or lower`],
        ['Grapple', `up to ${GRAPPLE_GAP} tiles, any height (the only way up a tall tower)`],
      ]),
      p('Tools are limited each day (fewer on harder days). Distance is measured between the roof edges; the inspector shows the exact tiles and floors for any roof you tap.'),
      h('Rings'),
      table([
        ['Bright', 'reachable with the tool you picked'],
        ['Faint coloured', 'reachable only with another tool (cyan Walk, purple Glide, orange Grapple)'],
        ['White', 'where you could go next after the roof you selected'],
        ['Red', 'out of reach (the card says why and what would work)'],
      ]),
      h('Watch out'),
      table([
        ['Damaged roofs', 'cracked walls and a red light. They collapse after you leave, so plan a route that does not come back.'],
        ['Gold coins', 'worth points, but a detour costs jumps and time.'],
      ]),
      h('Time and scoring'),
      p('The clock starts the first time you press Start, pick a tool, rotate or zoom the city, or tap a roof, so looking around counts as playing. It keeps running through Undo and Restart. Your first finish of the day is ranked; later runs are practice.'),
      table([
        ['Reach the Summit', `+${SCORE_RULES.summit}`],
        ['Each jump under par', `+${SCORE_RULES.perMoveUnderPar}`],
        ['Each jump over par', `-${SCORE_RULES.perMoveOverPar}`],
        ['Finish at or under par', `+${SCORE_RULES.perfectRoute}`],
        ['Speed', `+${SCORE_RULES.speedMax}, minus ${SCORE_RULES.speedPerSecond} per second`],
        ['Each gold coin', `+${SCORE_RULES.perGold}`],
        ['Each unused tool', `+${SCORE_RULES.perToolSaved}`],
      ]),
      h('Stuck?'),
      p('You get ONE Hint per level. Press Hint and the next roof of the best route blinks, together with the tool to pick.'),
      p('Leaderboard: most points first; equal points go to the faster time.'),
    );
  }

  dispose(): void {
    document.getElementById('rules-sheet')?.remove();
  }
}
