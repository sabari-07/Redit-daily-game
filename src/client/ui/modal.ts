/**
 * One popup style for the whole game: anchored at the TOP of the screen, a visible × close
 * button, Esc and click-outside to close, and the card scrolls as a whole if a phone is short
 * (never a small inner scroll box).
 */
export interface Modal {
  card: HTMLElement;
  body: HTMLElement;
  close: () => void;
}

let open: Modal | null = null;

export function openModal(opts: { id: string; title: string; label?: string; wide?: boolean; onClose?: () => void }): Modal {
  open?.close();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = opts.id;

  const card = document.createElement('div');
  card.className = `modal-card panel${opts.wide ? ' wide' : ''}`;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', opts.label ?? opts.title);

  const head = document.createElement('div');
  head.className = 'modal-head';
  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = opts.title;
  const x = document.createElement('button');
  x.className = 'close-x';
  x.setAttribute('aria-label', 'Close');
  x.textContent = '×';
  head.append(title, x);

  const body = document.createElement('div');
  body.className = 'modal-body';
  card.append(head, body);
  overlay.append(card);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  const close = (): void => {
    overlay.remove();
    window.removeEventListener('keydown', onKey);
    if (open?.card === card) open = null;
    opts.onClose?.();
  };
  x.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  window.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  x.focus();
  const m: Modal = { card, body, close };
  open = m;
  return m;
}

export function closeModal(): void {
  open?.close();
}

export function setModalTitle(m: Modal, text: string): void {
  const t = m.card.querySelector('.modal-title');
  if (t) t.textContent = text;
}
