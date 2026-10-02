// The two interactive specimens, exactly as index.astro runs them (same
// tokenizer, same softmax, same markup per row). Pure functions + a mount() for
// the browser, so the Δ chapter and the SSR page share ONE tokenizer: the five
// tokens the chapter animates are the five the specimen prints.
import type { Candidate } from '../data/landing';

/** index.astro's tokenizer, verbatim. */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  (s || '').trim().split(/\s+/).filter(Boolean).forEach((w) => {
    if (w.length <= 4) { out.push(w); return; }
    let i = 0;
    while (i < w.length) { const take = i === 0 ? 5 : 4; out.push(w.slice(i, i + take)); i += take; }
  });
  return out.slice(0, 26);
}

/** The published context of specimen B: the first sentence of its description («Le pediste un nombre para tu
 *  perro.» / «You asked it to name your dog.»). The candidates are answers to THIS context, so the Δ chapter
 *  shows them after it and never after the specimen-A sentence. No new string: it is a cut of `bD`. */
export function ctxOf(s: string): string {
  const t = (s || '').trim(), i = t.indexOf('. ');
  return i > 0 ? t.slice(0, i + 1) : t;
}

/** Probabilities (0..1) of every candidate at temperature T (slider/100). */
export function softmax(c: Candidate[], T: number): number[] {
  const ex = c.map((x) => Math.exp(x.logit / Math.max(0.08, T)));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / sum);
}
export const pctText = (p: number) => { const pct = p * 100; return pct >= 9.5 ? Math.round(pct) + '%' : pct < 0.5 ? '~0%' : pct.toFixed(1) + '%'; };
const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function candRowsHTML(c: Candidate[], T: number) {
  const pr = softmax(c, T);
  return c.map((x, i) => {
    const p = pr[i], pct = p * 100, w = Math.max(1.2, pct) + '%';
    const color = i === 0 ? 'var(--l1)' : p > 0.08 ? 'var(--l2)' : 'var(--l3)';
    return `<div class="crow"><div class="cn" style="color:${color}">${esc(x.name)}</div><div class="cb"><i style="width:${w};background:${i === 0 ? 'var(--ac)' : 'var(--l3)'}"></i></div><div class="cp" style="color:${color}">${pctText(p)}</div></div>`;
  }).join('');
}

export function mountSpecimens(D: { candidatos: Candidate[]; txt: Record<string, string> }) {
  const tokin = document.getElementById('tokin') as HTMLInputElement | null;
  const tokens = document.getElementById('tokens');
  if (tokin && tokens) {
    const render = () => {
      const txt = tokin.value, toks = tokenize(txt);
      tokens.innerHTML = toks.map((t) => `<div class="tokc">${esc(t)}</div>`).join('');
      document.getElementById('tokenCount')!.textContent = String(toks.length);
      document.getElementById('wordCount')!.textContent = txt.trim() ? String(txt.trim().split(/\s+/).length) : '0';
      document.getElementById('charCount')!.textContent = String(txt.replace(/\s/g, '').length);
    };
    tokin.addEventListener('input', render); render();
  }
  const tempin = document.getElementById('tempin') as HTMLInputElement | null;
  const cands = document.getElementById('cands');
  if (tempin && cands) {
    const render = () => {
      const T = +tempin.value / 100;
      cands.innerHTML = candRowsHTML(D.candidatos, T);
      document.getElementById('tempLabel')!.textContent = T.toFixed(2);
      document.getElementById('tempVerdict')!.textContent = T < 0.5 ? D.txt.predecible : T < 1.05 ? D.txt.equilibrada : D.txt.impredecible;
    };
    tempin.addEventListener('input', render); render();
  }
}
