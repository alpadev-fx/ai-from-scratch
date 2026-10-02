// The owner's hard copy rules for /v3, as functions that THROW. Nothing is filtered silently: a string that breaks
// a rule stops the render, and the same rule table is what web/scripts/v3-copy-check.mjs applies to the rendered
// page, so the page and its gate cannot disagree about what is banned.
//
//   · no city, except inside the tokenizer example «Cartagena es hermosa» / "Cartagena is beautiful", which is a
//     sentence the course tokenizes, not a claim about a place;
//   · never «cursos» / «courses» in the plural;
//   · the forbidden list of landing-hormozi §0.4, and the EBOOK / VOL. 1 / PORTADA wording of the old cover;
//   · prod sells ONE thing, 30 days, auto-renew OFF by default: no monthly wording (the FAQ's «cada mes» for the
//     opt-in renewal is true and is not on this list);
//   · «veinte segundos» is not published anywhere;
//   · «gato» / «cat» is banned except inside the published lesson-01 text (the caller names it with `allow`);
//   · «testimonio(s)» / «testimonial(s)» only inside the one sanctioned sentence of chapter 08.

export interface Rule { id: string; re: RegExp }

/** The tokenizer example. A sentence the course cuts into tokens, so its city is not a place claim. */
export const TOKENIZER = /Cartagena (es hermosa|is beautiful)/g;
/** The ONLY text allowed to carry the word «testimonios»: «No te voy a mostrar testimonios.» (first sentence of s5H). */
export const SANCTIONED = /No te voy a mostrar testimonios\.|I won't show you testimonials\./g;

export const RULES: Rule[] = [
  { id: 'city', re: /Medell|Cartagena|Bogot|\bCali\b|Barranquilla|Bucaramanga|Madrid|Barcelona|Ciudad de M[eé]xico|Mexico City|Buenos Aires|Miami|San Francisco|Palo Alto|New York|Nueva York|Tokyo|Tokio/i },
  { id: 'plural courses', re: /\bcursos\b|\bcourses\b/i },
  { id: 'old cover wording', re: /EBOOK|VOL\. ?1|PORTADA|\bCOVER\b/ },
  { id: 'hormozi §0.4 list', re: /singularidad|singularity|kardashev|Ω|openai|anthropic|labs grandes|big labs|alumnos|estudiantes|students|countdown|cuenta regresiva|pr[oó]ximamente|coming soon|galaxia|gal[aá]ctic|galactic|intergal|hiperespacio|hyperspace|universo|universe|cosmos|c[oó]smic|cosmic|agujero negro|black hole|\bwarp\b|pago [uú]nico/i },
  { id: 'monthly wording (prod sells 30 days, renewal off)', re: /\/\s?mes\b|\bal mes\b|\bSuscribirme\b|\bSuscripci[oó]n mensual\b|\bDos formas de entrar\b|\/\s?month\b|\ba month\b|\bSubscribe\b|\bmonthly subscription\b|\bTwo ways in\b/i },
  { id: 'unpublished claim («veinte segundos»)', re: /veinte segundos|twenty seconds/i },
  { id: 'cat (only lesson 01 may say it)', re: /\bgatos?\b|\bcats?\b|\bcat's\b/i },
  { id: 'testimonial outside its one sentence', re: /testimoni(?:o|os|al|als)\b/i },
];

/** Cuts the texts a rule must not see: the tokenizer example, the sanctioned sentence, and any `allow` strings (named, exact). */
export function exempt(s: string, allow: readonly string[] = []): string {
  let t = s.replace(TOKENIZER, '').replace(SANCTIONED, '');
  for (const a of allow) if (a) t = t.split(a).join('');
  return t;
}

/** Every rule a text breaks, as `[rule id, matched text]`. Empty = clean. */
export function violations(s: string, allow: readonly string[] = []): Array<[string, string]> {
  const t = exempt(s, allow), out: Array<[string, string]> = [];
  for (const r of RULES) { const m = t.match(r.re); if (m) out.push([r.id, m[0]]); }
  return out;
}

export function guard<T extends string>(where: string, s: T, opts: { allow?: readonly string[] } = {}): T {
  const v = violations(s, opts.allow);
  if (v.length) throw new Error(`[v3 copy] ${where}: forbidden ${v.map(([id, m]) => `${id} ("${m}")`).join(', ')} in "${s.slice(0, 90)}"`);
  return s;
}

/** A view of `o` whose every string is `guard`ed at the moment it is READ. The page prints only what it reads, so no
 *  list of strings can fall behind the markup: a string that is rendered has been checked, by construction. */
export function guarded<T extends object>(o: T, path: string): T {
  return new Proxy(o, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver);
      if (typeof key === 'symbol') return v;
      if (typeof v === 'string') return guard(`${path}.${key}`, v);
      if (v && typeof v === 'object') return guarded(v as object, `${path}.${key}`);
      return v;
    },
  });
}

/** The narrative lines carry ", en Medellín" / ", in Medellín" for the Colombian market; v3 renders them without the city. */
export const withoutCity = (s: string) => s.replace(/,\s*(en|in) Medell[ií]n/, '');
