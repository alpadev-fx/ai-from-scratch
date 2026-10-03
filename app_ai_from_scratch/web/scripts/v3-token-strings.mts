// Prints, as JSON, every string /v3 shows as a token chip, per language: { es: [{ id, text }], en: [...] }. It is the input of v3-tokens.py (the generator), and it reads the
// strings from the same modules the page reads (i18n.ts, landing.ts, price.ts) through the same list the page and the guard test use (src/aegis/token-strings.ts).
//   node --experimental-strip-types scripts/v3-token-strings.mts
import { STR } from '../src/lib/i18n.ts';
import { PRECIO_VISUAL } from '../src/lib/price.ts';
import { modulos } from '../src/data/landing.ts';
import { ctxOf } from '../src/aegis/specimens.ts';
import { chipStrings } from '../src/aegis/token-strings.ts';

const out: Record<string, Array<{ id: string; text: string }>> = {};
for (const lang of ['es', 'en'] as const) {
  const P = STR[lang].pub.land, V = STR[lang].pub.v3;
  out[lang] = chipStrings({ P, V, mods: modulos(lang), price: PRECIO_VISUAL[lang], ctx: ctxOf(P.bD) });
}
process.stdout.write(JSON.stringify(out));
