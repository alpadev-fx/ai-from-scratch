// WHICH strings /v3 shows as token chips. One list, read by the page (to render chapter 04's chips and to ship the tokens of the rest), by web/scripts/v3-token-strings.mts
// (which hands it to web/scripts/v3-tokens.py, the generator) and by the guard test: a string that is a chip and is not in src/data/v3-tokens.json is red.
// Pure, and its inputs are passed in so that the page (extensionless imports) and Node (explicit .ts imports) can both build them.

export interface ChipSources {
  /** pub.land of the language: aEjemplo (specimen A's sentence), l1H..l3D (chapter 03's three benefits), bD (specimen B's description; chapter 04 uses its first sentence) */
  P: Record<string, any>;
  /** pub.v3 of the language: s10Si / s10No (chapter 13), cierreH (chapter 16) */
  V: Record<string, any>;
  /** the twelve lessons, in order: their titles are chapter 07's stack and chapter 09's river */
  mods: ReadonlyArray<{ n: string; h: string }>;
  /** the published price, as the page prints it («$39.990» / «39,990 COP») */
  price: string;
  /** specimen B's context: the first sentence of P.bD (specimens.ts ctxOf) */
  ctx: string;
}

export interface ChipString { id: string; text: string }

export function chipStrings(S: ChipSources): ChipString[] {
  const out: ChipString[] = [
    { id: 'c04.sentence', text: S.P.aEjemplo },
    { id: 'c04.context', text: S.ctx },
  ];
  for (const k of [1, 2, 3]) out.push({ id: `c03.l${k}.head`, text: S.P[`l${k}H`] }, { id: `c03.l${k}.body`, text: S.P[`l${k}D`] });
  for (const m of S.mods) out.push({ id: `lesson.${m.n}`, text: m.h });
  (S.V.s10Si as string[]).forEach((x, i) => out.push({ id: `c13.yes.${i + 1}`, text: x }));
  (S.V.s10No as string[]).forEach((x, i) => out.push({ id: `c13.no.${i + 1}`, text: x }));
  out.push({ id: 'c14.price', text: S.price }, { id: 'c16.head', text: S.V.cierreH });
  for (const c of out) if (typeof c.text !== 'string' || !c.text) throw new Error(`v3 token strings: ${c.id} is empty`);
  return out;
}
