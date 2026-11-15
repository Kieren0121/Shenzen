import type { SceneId } from './SceneTypes';

export interface KeyWord {
  term: string;
  def: string;
}

export interface Caption {
  kicker?: string;
  title: string;
  body: string;
  words?: KeyWord[];
  tone?: 'default' | 'water' | 'pump' | 'warn' | 'green';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The classroom interface shell. Scenes add their own control strip, side
 * panel and "chain" (cause → effect) content once at build time; switching
 * scenes only toggles visibility, so no listeners are ever duplicated.
 */
export class PresentationUI {
  readonly root: HTMLElement;
  readonly viewport: HTMLDivElement;
  readonly overlay: HTMLDivElement;
  readonly controlsHost: HTMLElement;
  readonly panelHost: HTMLElement;
  readonly chainHost: HTMLElement;
  private captionEl: HTMLElement;
  private capKicker: HTMLElement;
  private capTitle: HTMLElement;
  private capBody: HTMLElement;
  private capWords: HTMLElement;
  private captionKey = '';
  private tabs = new Map<SceneId, HTMLButtonElement>();
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private loadingEl: HTMLElement;
  private loadingBar: HTMLElement;
  private loadingStep: HTMLElement;
  readonly presentBtn: HTMLButtonElement;
  onSceneSelect: ((id: SceneId) => void) | null = null;
  onPresentToggle: (() => void) | null = null;
  private peekTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('ebn-app');

    this.viewport = el('div', 'viewport');
    this.overlay = el('div', 'overlay');
    const vignette = el('div', 'vignette');

    const top = el('header', 'topbar');
    const brand = el('div', 'brand');
    brand.append(el('span', 'brand-ebn', 'EBN GEOGRAPHY'), el('span', 'brand-sep', '|'), el('span', 'brand-week', 'CHINA — WEEK 3'));
    const nav = el('nav', 'scene-tabs');
    nav.setAttribute('aria-label', 'Choose simulation');
    const mk = (id: SceneId, num: string, label: string) => {
      const b = el('button', 'tab');
      b.type = 'button';
      b.dataset.scene = id;
      b.append(el('span', 'tab-num', num), el('span', 'tab-label', label));
      b.addEventListener('click', () => {
        b.blur();
        this.onSceneSelect?.(id);
      });
      this.tabs.set(id, b);
      nav.appendChild(b);
    };
    mk('shenzhen', '1', 'SHENZHEN');
    mk('groundwater', '2', 'GROUNDWATER');
    const actions = el('div', 'top-actions');
    this.presentBtn = el('button', 'btn ghost present-btn');
    this.presentBtn.type = 'button';
    this.presentBtn.title = 'Full-screen presentation (F)';
    this.presentBtn.innerHTML = '<span class="ico">⛶</span><span>Present</span><kbd>F</kbd>';
    this.presentBtn.addEventListener('click', () => {
      this.presentBtn.blur();
      this.onPresentToggle?.();
    });
    actions.appendChild(this.presentBtn);
    top.append(brand, nav, actions);

    this.captionEl = el('section', 'caption');
    this.captionEl.setAttribute('aria-live', 'polite');
    this.capKicker = el('div', 'cap-kicker');
    this.capTitle = el('h1', 'cap-title');
    this.capBody = el('p', 'cap-body');
    this.capWords = el('div', 'cap-words');
    this.captionEl.append(this.capKicker, this.capTitle, this.capBody, this.capWords);

    this.chainHost = el('div', 'chain-host');
    this.panelHost = el('aside', 'panel-host');
    this.controlsHost = el('footer', 'controls');
    this.toastEl = el('div', 'toast');
    this.toastEl.setAttribute('role', 'status');

    this.loadingEl = el('div', 'loading');
    const lc = el('div', 'loading-card');
    lc.append(el('div', 'loading-brand', 'EBN GEOGRAPHY | CHINA — WEEK 3'), el('div', 'loading-title', 'Preparing 3D models…'));
    const bar = el('div', 'loading-track');
    this.loadingBar = el('div', 'loading-bar');
    bar.appendChild(this.loadingBar);
    this.loadingStep = el('div', 'loading-step', 'Starting');
    lc.append(bar, this.loadingStep);
    this.loadingEl.appendChild(lc);

    root.append(this.viewport, vignette, this.overlay, top, this.captionEl, this.chainHost, this.panelHost, this.controlsHost, this.toastEl, this.loadingEl);

    // In presentation mode the control strip slides away and peeks back when
    // the mouse approaches the bottom edge.
    window.addEventListener('mousemove', (e) => {
      if (!document.body.classList.contains('presenting')) return;
      if (e.clientY > window.innerHeight - 150) {
        this.controlsHost.classList.add('peek');
        window.clearTimeout(this.peekTimer);
      } else if (this.controlsHost.classList.contains('peek')) {
        window.clearTimeout(this.peekTimer);
        this.peekTimer = window.setTimeout(() => this.controlsHost.classList.remove('peek'), 1400);
      }
    });
  }

  /** Screen rectangles covered by interface panels (labels avoid these). */
  occupiedRects(): DOMRect[] {
    const out: DOMRect[] = [];
    for (const e of [this.captionEl, this.chainHost, this.panelHost, this.controlsHost]) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(e).opacity !== '0') out.push(r);
    }
    return out;
  }

  setActiveTab(id: SceneId): void {
    for (const [k, b] of this.tabs) {
      b.classList.toggle('active', k === id);
      b.setAttribute('aria-pressed', String(k === id));
    }
    document.body.dataset.scene = id;
  }

  setCaption(c: Caption): void {
    const key = JSON.stringify(c);
    if (key === this.captionKey) return;
    const first = this.captionKey === '';
    this.captionKey = key;
    const apply = () => {
      this.capKicker.textContent = c.kicker ?? '';
      this.capKicker.style.display = c.kicker ? '' : 'none';
      this.capTitle.textContent = c.title;
      this.capBody.textContent = c.body;
      this.capWords.replaceChildren();
      for (const w of c.words ?? []) {
        const chip = el('div', 'word');
        chip.append(el('span', 'word-term', w.term), el('span', 'word-def', w.def));
        this.capWords.appendChild(chip);
      }
      this.captionEl.dataset.tone = c.tone ?? 'default';
      this.captionEl.classList.remove('fading');
    };
    if (first) apply();
    else {
      this.captionEl.classList.add('fading');
      window.setTimeout(apply, 180);
    }
  }

  toast(msg: string, ms = 3200): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  setLoading(p: number, step: string): void {
    this.loadingBar.style.width = `${Math.round(p * 100)}%`;
    this.loadingStep.textContent = step;
  }

  hideLoading(): void {
    this.loadingEl.classList.add('done');
    window.setTimeout(() => this.loadingEl.remove(), 700);
  }

  showError(title: string, body: string): void {
    const e = el('div', 'fatal');
    const card = el('div', 'fatal-card');
    card.append(el('div', 'loading-brand', 'EBN GEOGRAPHY | CHINA — WEEK 3'), el('h2', '', title), el('p', '', body));
    e.appendChild(card);
    this.root.appendChild(e);
    this.loadingEl.remove();
  }
}

/** Small DOM helpers shared by the scenes' control strips. */
export const dom = {
  el,
  button(label: string, opts: { cls?: string; title?: string; kbd?: string; onClick: () => void }): HTMLButtonElement {
    const b = el('button', `btn ${opts.cls ?? ''}`.trim());
    b.type = 'button';
    b.innerHTML = label + (opts.kbd ? `<kbd>${opts.kbd}</kbd>` : '');
    if (opts.title) b.title = opts.title;
    b.addEventListener('click', () => {
      b.blur(); // keep keyboard shortcuts (Space) from re-triggering the button
      opts.onClick();
    });
    return b;
  },
};
