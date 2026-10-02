// The owner's two hard copy rules for /v3, as a function that THROWS.
//   · no city (Medellín, Cartagena, Bogotá) — except inside the tokenizer example
//     "Cartagena es hermosa" / "Cartagena is beautiful", which is a sentence the
//     course tokenizes, not a claim about a place;
//   · never «cursos» / «courses» in the plural.
// Nothing is filtered silently: a string that breaks a rule stops the render.
const CITY = /Medell|Cartagena|Bogot/i;
const PLURAL = /\bcursos\b|\bcourses\b/i;

export function guard<T extends string>(where: string, s: T): T {
  const t = s.replace(/Cartagena (es hermosa|is beautiful)/g, '');
  if (CITY.test(t) || PLURAL.test(t)) throw new Error(`[v3 copy] ${where}: forbidden city or plural in "${s.slice(0, 90)}"`);
  return s;
}

/** The narrative lines carry ", en Medellín" / ", in Medellín" for the Colombian market; v3 renders them without the city. */
export const withoutCity = (s: string) => s.replace(/,\s*(en|in) Medell[ií]n/, '');
