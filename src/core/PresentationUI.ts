import type { SceneId } from './SceneTypes';

export interface KeyWord {
  term: string;
  def: string;
  /** Worksheet "KEY WORDS · LEARN THESE TWO" (yellow highlight) rather than "WORDS YOU NEED FIRST" (blue). */
  key?: boolean;
}

/** A question from the worksheet's pink YOUR TASK zone. */
export interface TaskPrompt {
  n: string; // '1'..'4' or '★'
  q: string;
  start?: string;
  cmd: string; // RECALL, DESCRIBE, EXPLAIN, CONNECT ...
}

export interface Caption {
  /** Worksheet lesson label, e.g. 'LESSON 1 · CHINA'. */
  lesson: string;
  /** Worksheet stage badge number (Blue 1 / Blue 2). */
  badge: string;
  bigQuestion: string;
  /** Numbered section head: marker + text (e.g. 'A', 'FACTORIES AND JOBS'). */
  step?: { mark: string; text: string };
  title: string;
  body: string;
  words?: KeyWord[];
  task?: TaskPrompt;
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
  private capQuestion: HTMLElement;
  private capLesson: HTMLElement;
  private capBadge: HTMLElement;
  private capStep: HTMLElement;
  private capTitle: HTMLElement;
  private capBody: HTMLElement;
  private capWords: HTMLElement;
  private capTask: HTMLElement;
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
    const crumb = el('div', 'brand-crumb', 'GEOGRAPHY · AUTUMN 2 · WEEK 3 · 1.3.3 + 3.3.2');
    const line = el('div', 'brand-line');
    line.append(el('span', 'brand-ebn', 'EBN GEOGRAPHY'), el('span', 'brand-sep', '|'), el('span', 'brand-week', 'CHINA · WEEK 3'), el('span', 'brand-3d', '3D MODEL'));
    brand.append(crumb, line);
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
    // the resource pack's stage pills: this model sits with the Blue sheets
    const stages = el('div', 'stage-pills');
    stages.setAttribute('aria-label', 'Week 3 resource pack stages');
    for (const st of ['STARTER', 'BLUE', 'WHITE', 'YELLOW', 'WRITING', 'GCSE']) stages.appendChild(el('span', st === 'BLUE' ? 'pill on' : 'pill', st));
    const actions = el('div', 'top-actions');
    this.presentBtn = el('button', 'btn ghost present-btn');
    this.presentBtn.type = 'button';
    this.presentBtn.title = 'Full-screen presentation (F)';
    this.presentBtn.innerHTML = '<span class="ico">⛶</span><span>Present</span><kbd>F</kbd>';
    this.presentBtn.addEventListener('click', () => {
      this.presentBtn.blur();
      this.onPresentToggle?.();
    });
    actions.append(stages, this.presentBtn);
    top.append(brand, nav, actions);

    this.captionEl = el('section', 'caption');
    this.captionEl.setAttribute('aria-live', 'polite');
    // START HERE strip, exactly as on the worksheets
    const start = el('div', 'cap-start');
    const sh = el('div', 'cap-start-tag');
    sh.append(el('span', '', 'START'), el('b', '', 'HERE'));
    this.capQuestion = el('div', 'cap-question');
    start.append(sh, this.capQuestion);
    const head = el('div', 'cap-head');
    const headText = el('div', 'cap-head-text');
    this.capLesson = el('div', 'cap-lesson');
    this.capStep = el('div', 'cap-step');
    this.capTitle = el('h1', 'cap-title');
    headText.append(this.capLesson, this.capStep, this.capTitle);
    this.capBadge = el('div', 'cap-badge');
    head.append(headText, this.capBadge);
    const main = el('div', 'cap-main');
    this.capBody = el('p', 'cap-body');
    this.capWords = el('div', 'cap-words');
    this.capTask = el('div', 'cap-task');
    main.append(this.capBody, this.capWords);
    this.captionEl.append(start, head, main, this.capTask);

    this.chainHost = el('div', 'chain-host');
    this.panelHost = el('aside', 'panel-host');
    this.controlsHost = el('footer', 'controls');
    this.toastEl = el('div', 'toast');
    this.toastEl.setAttribute('role', 'status');

    this.loadingEl = el('div', 'loading');
    const lc = el('div', 'loading-card');
    lc.append(el('div', 'loading-brand', 'GEOGRAPHY · AUTUMN 2 · WEEK 3 · 1.3.3 + 3.3.2'), el('div', 'loading-title', 'The world’s factory · Taking too much water'), el('div', 'loading-sub', 'EBN GEOGRAPHY · 3D MODEL · BLUE 1 + 2'));
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
      this.capQuestion.innerHTML = '';
      this.capQuestion.append(el('b', '', 'Big question: '), document.createTextNode(c.bigQuestion));
      this.capLesson.textContent = c.lesson;
      this.capBadge.replaceChildren(el('span', '', 'BLUE'), el('b', '', c.badge));
      this.capStep.replaceChildren();
      this.capStep.style.display = c.step ? '' : 'none';
      if (c.step) this.capStep.append(el('span', 'num', c.step.mark), el('span', '', c.step.text));
      this.capTitle.textContent = c.title;
      this.capBody.textContent = c.body;
      this.capWords.replaceChildren();
      for (const w of c.words ?? []) {
        const chip = el('div', w.key ? 'word key' : 'word');
        chip.append(el('span', 'word-term', w.term), el('span', 'word-def', w.def));
        this.capWords.appendChild(chip);
      }
      this.capTask.replaceChildren();
      this.capTask.style.display = c.task ? '' : 'none';
      if (c.task) {
        const t = c.task;
        const hd = el('div', 'task-head');
        hd.append(el('span', '', 'YOUR TASK'), el('span', 'task-book', 'ANSWER IN YOUR BOOK'));
        const row = el('div', 'task-row');
        const q = el('div', 'task-q');
        q.append(el('b', '', t.q));
        if (t.start) q.append(el('span', '', t.start));
        row.append(el('span', t.n === '★' ? 'task-n star' : 'task-n', t.n), q, el('span', 'task-cmd', t.cmd));
        this.capTask.append(hd, row);
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
    card.append(el('div', 'loading-brand', 'EBN GEOGRAPHY · CHINA · WEEK 3'), el('h2', '', title), el('p', '', body));
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
