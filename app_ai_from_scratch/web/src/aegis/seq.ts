// Frame sequences: WebP files fetched progressively (nearest the playhead first),
// decoded to ImageBitmaps on demand inside a small window. Compressed blobs stay
// in memory (~20 KB each); decoded bitmaps are bounded so a phone never holds
// 72 full-size frames at once.
export class Seq {
  n: number; parts: Array<[string, number]>; variant: 'd' | 'm';
  blobs: (Blob | null)[]; bmp = new Map<number, ImageBitmap>();
  pend = new Set<number>(); queued = false; started = false; loaded = 0;
  focus = 0; cap: number; fetching = 0;
  onProgress?: () => void;
  /** parts: clips played back to back, e.g. [['n1', 72], ['n2', 72]] (mobile packs have 48 each). */
  constructor(parts: Array<[string, number]>, variant: 'd' | 'm') {
    this.parts = parts; this.n = parts.reduce((a, p) => a + p[1], 0); this.variant = variant; this.cap = variant === 'm' ? 8 : 10;
    this.blobs = new Array(this.n).fill(null);
  }
  url(i: number) {
    for (const [id, len] of this.parts) { if (i < len) return `/v3/seq/${id}/${this.variant}/${String(i + 1).padStart(4, '0')}.webp`; i -= len; }
    return '';
  }
  warm() { if (this.started) return; this.started = true; this.pump(); }
  /** Pull frames nearest to `focus` first, 4 requests at a time. */
  private pump() {
    while (this.fetching < 4) {
      let best = -1, bd = 1e9;
      for (let i = 0; i < this.n; i++) if (!this.blobs[i] && !this.pend.has(i)) { const d = Math.abs(i - this.focus) + (i < this.focus ? 0.5 : 0); if (d < bd) { bd = d; best = i; } }
      if (best < 0) return;
      this.pend.add(best); this.fetching++;
      fetch(this.url(best)).then(r => (r.ok ? r.blob() : Promise.reject(r.status))).then(b => { this.blobs[best] = b; this.loaded++; })
        .catch(() => { /* a missing frame is skipped; nearest() covers it */ })
        .finally(() => { this.pend.delete(best); this.fetching--; this.onProgress && this.onProgress(); this.pump(); });
    }
  }
  /** How many of the first `k` frames are in. */
  head(k: number) { let c = 0; for (let i = 0; i < Math.min(k, this.n); i++) if (this.blobs[i]) c++; return c; }
  has(i: number) { return this.bmp.has(i); }
  take(i: number) { return this.bmp.get(i) || null; }
  decode(i: number) {
    if (i < 0 || i >= this.n || this.bmp.has(i) || !this.blobs[i] || this.pend.has(-1 - i)) return;
    this.pend.add(-1 - i);
    createImageBitmap(this.blobs[i]!).then(b => { this.bmp.set(i, b); this.trim(); }).catch(() => {}).finally(() => this.pend.delete(-1 - i));
  }
  private trim() {
    while (this.bmp.size > this.cap) {
      let far = -1, fd = -1; this.bmp.forEach((_, k) => { const d = Math.abs(k - this.focus); if (d > fd) { fd = d; far = k; } });
      if (far < 0) break; const b = this.bmp.get(far); this.bmp.delete(far); try { b!.close(); } catch { /* */ }
    }
  }
  nearest(i: number) { let best = -1, bd = 1e9; this.bmp.forEach((_, k) => { const d = Math.abs(k - i); if (d < bd) { bd = d; best = k; } }); return best; }
  setFocus(f: number) { this.focus = f; }
}
