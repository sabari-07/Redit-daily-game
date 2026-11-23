let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/** Shows a toast message for 2.5 seconds */
export function showToast(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  // Safe: textContent never reaches innerHTML
  toast.textContent = message;
  const c = getContainer();
  c.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 300ms';
    toast.style.opacity = '0';
    setTimeout(() => { c.removeChild(toast); }, 300);
  }, 2500);
}

/** Shows a full-screen error state */
export function showErrorState(message: string, onRetry?: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'error-state';

  const h2 = document.createElement('h2');
  h2.textContent = 'Something went wrong';

  const p = document.createElement('p');
  p.textContent = message;

  el.appendChild(h2);
  el.appendChild(p);

  if (onRetry) {
    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = 'Try again';
    btn.addEventListener('click', onRetry);
    el.appendChild(btn);
  }

  document.body.appendChild(el);
  return el;
}
