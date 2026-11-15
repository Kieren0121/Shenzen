import * as THREE from 'three';

export type LabelKind = 'info' | 'water' | 'pump' | 'warn' | 'green' | 'muted';

export interface LabelSpec {
  id: string;
  text: string;
  sub?: string;
  kind?: LabelKind;
  /** World-space anchor; return null to hide. Called every frame. */
  anchor: () => THREE.Vector3 | null;
  visible?: () => boolean;
  priority?: number;
  /** Stem length in px (label sits above its anchor). */
  stem?: number;
}

interface LabelEntry {
  spec: LabelSpec;
  el: HTMLDivElement;
  textEl: HTMLDivElement;
  subEl: HTMLDivElement | null;
  w: number;
  h: number;
  shown: boolean;
  lastText: string;
}

/**
 * Projected HTML labels: crisp text at any resolution, positioned over 3D
 * anchors every frame, with simple priority-based overlap avoidance so labels
 * never pile on top of each other on the projector.
 */
export class LabelLayer {
  readonly root: HTMLDivElement;
  private entries: LabelEntry[] = [];
  private v = new THREE.Vector3();
  enabled = true;
  private exclusionFn: (() => DOMRect[]) | null = null;
  private exclusions: DOMRect[] = [];
  private exclusionAge = -1e9;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'label-layer';
    parent.appendChild(this.root);
  }

  add(spec: LabelSpec): void {
    const el = document.createElement('div');
    el.className = `label3d kind-${spec.kind ?? 'info'}`;
    el.dataset.labelId = spec.id;
    const box = document.createElement('div');
    box.className = 'label-box';
    const textEl = document.createElement('div');
    textEl.className = 'label-text';
    textEl.textContent = spec.text;
    box.appendChild(textEl);
    let subEl: HTMLDivElement | null = null;
    if (spec.sub) {
      subEl = document.createElement('div');
      subEl.className = 'label-sub';
      subEl.textContent = spec.sub;
      box.appendChild(subEl);
    }
    const stem = document.createElement('div');
    stem.className = 'label-stem';
    stem.style.height = `${spec.stem ?? 34}px`;
    const dot = document.createElement('div');
    dot.className = 'label-dot';
    const inner = document.createElement('div');
    inner.className = 'label-inner';
    inner.append(box, stem, dot);
    el.appendChild(inner);
    this.root.appendChild(el);
    this.entries.push({ spec, el, textEl, subEl, w: 0, h: 0, shown: false, lastText: spec.text });
  }

  setText(id: string, text: string, sub?: string): void {
    const e = this.entries.find((x) => x.spec.id === id);
    if (!e) return;
    if (e.lastText !== text) {
      e.textEl.textContent = text;
      e.lastText = text;
      e.w = 0;
    }
    if (sub !== undefined && e.subEl && e.subEl.textContent !== sub) {
      e.subEl.textContent = sub;
      e.w = 0;
    }
  }

  setKind(id: string, kind: LabelKind): void {
    const e = this.entries.find((x) => x.spec.id === id);
    if (!e) return;
    const cls = `label3d kind-${kind}`;
    if (e.el.className !== cls) e.el.className = cls;
  }

  /** Interface panels that labels must not be drawn underneath. */
  setExclusions(fn: () => DOMRect[]): void {
    this.exclusionFn = fn;
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  update(camera: THREE.Camera, width: number, height: number): void {
    if (!this.enabled) return;
    type Cand = { e: LabelEntry; x: number; y: number; pr: number };
    const cands: Cand[] = [];
    for (const e of this.entries) {
      const vis = e.spec.visible ? e.spec.visible() : true;
      const a = vis ? e.spec.anchor() : null;
      if (!a) {
        this.hide(e);
        continue;
      }
      this.v.copy(a).project(camera);
      if (this.v.z > 1 || this.v.z < -1 || Math.abs(this.v.x) > 1.05 || Math.abs(this.v.y) > 1.05) {
        this.hide(e);
        continue;
      }
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      cands.push({ e, x, y, pr: e.spec.priority ?? 0 });
    }
    cands.sort((a, b) => b.pr - a.pr);
    // panel rectangles are re-measured a few times a second (cheap, avoids layout thrash)
    const now = performance.now();
    if (this.exclusionFn && now - this.exclusionAge > 250) {
      this.exclusions = this.exclusionFn();
      this.exclusionAge = now;
    }
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = this.exclusions.map((r) => ({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }));
    for (const c of cands) {
      const e = c.e;
      if (e.w === 0) {
        // measure once (and again whenever the text changes)
        const box = e.el.querySelector('.label-box') as HTMLElement;
        e.w = box.offsetWidth;
        e.h = box.offsetHeight;
      }
      const stem = e.spec.stem ?? 34;
      const x0 = c.x - e.w / 2, x1 = c.x + e.w / 2;
      const y1 = c.y - stem, y0 = y1 - e.h;
      const pad = 6;
      const overlaps = placed.some((r) => !(x1 + pad < r.x0 || x0 - pad > r.x1 || y1 + pad < r.y0 || y0 - pad > r.y1));
      const dotHidden = placed.some((r) => c.x > r.x0 && c.x < r.x1 && c.y > r.y0 && c.y < r.y1);
      if (overlaps || dotHidden || y0 < 64 || x0 < 4 || x1 > width - 4) {
        this.hide(e);
        continue;
      }
      placed.push({ x0, y0, x1, y1 });
      e.el.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0)`;
      if (!e.shown) {
        e.el.classList.add('shown');
        e.shown = true;
      }
    }
  }

  private hide(e: LabelEntry): void {
    if (e.shown) {
      e.el.classList.remove('shown');
      e.shown = false;
    }
  }

  /** For automated tests: ids of labels currently displayed. */
  shownIds(): string[] {
    return this.entries.filter((e) => e.shown).map((e) => e.spec.id);
  }

  dispose(): void {
    this.root.remove();
    this.entries = [];
  }
}
