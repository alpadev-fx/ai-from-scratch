/**
 * El registro: lo que ha cambiado aqui dentro, con su fecha.
 *
 * POR QUE EXISTE. El cobro es mensual desde el 2026-09-09 (payments/src/price.ts),
 * y la landing vendia un producto terminado. Un dolor que se cura una vez no
 * sostiene una suscripcion: curado, cancelar es lo racional. Este registro
 * sustituye una promesa sobre el futuro por un rastro verificable del pasado, que
 * es lo unico honesto que se puede ofrecer con UN curso en el catalogo y sin
 * ninguna frecuencia de publicacion comprometida.
 *
 * POR QUE ESTA A MANO Y NO GENERADO. Se intentaron las dos fuentes automaticas y
 * ninguna sirve:
 *
 *   1. La base de datos. `lessons`, `labs` y `lesson_text` no tienen timestamps.
 *      El unico `updated_at` de api/prisma/schema.prisma esta en `auth_throttles`.
 *   2. El historial de git. Solo dos commits tocan api/src/content.ts, labs.ts y
 *      quizzes.ts, y los dos son refactors de infraestructura. El mensaje de un
 *      commit describe ingenieria, no lo que cambio para quien estudia.
 *
 * Asi que las entradas se escriben aqui, a mano, y cada una llega por un commit:
 * fechada, revisable y no falsificable sin dejar rastro. La pudricion se ve sola,
 * porque la pagina publica la fecha de la entrada mas reciente en su cabecera: si
 * lleva tres meses sin moverse, lo dice ella.
 *
 * REGLAS, y las dos primeras no son de estilo:
 *
 *   - NUNCA una fecha futura ni un "proximamente". En el momento en que el
 *     registro mira adelante deja de ser evidencia y pasa a ser una promesa, que
 *     es justo lo que no se puede cumplir.
 *   - NUNCA una cifra inventada. El curso entero enseña a desconfiar de numeros
 *     que suenan seguros.
 *   - En primera persona y en lenguaje hablado, como el resto del producto.
 *   - Si el array esta vacio, la seccion no se renderiza. Un registro vacio es
 *     peor que ninguno.
 */

/** Que clase de cosa cambio. Se pinta como etiqueta, en mono y en mayusculas. */
export type TipoEntrada = 'leccion' | 'lab' | 'tutorial' | 'correccion' | 'harness' | 'pdf';

export interface Entrada {
  /** ISO 8601, solo fecha: '2026-09-19'. Nunca en el futuro. */
  fecha: string;
  tipo: TipoEntrada;
  /** Una frase, primera persona, sin jerga. Es lo que lee el alumno. */
  es: string;
  en: string;
}

/**
 * Las entradas, de la mas reciente a la mas antigua.
 *
 * Esta vacio a proposito. No lo sembre con historia inventada: no se que se
 * cambio ni cuando, y escribirlo habria sido exactamente el error que el producto
 * enseña a no cometer. Lo rellena quien publica.
 *
 * Ejemplo de la forma que tiene una entrada real:
 *
 *   {
 *     fecha: '2026-09-17',
 *     tipo: 'correccion',
 *     es: 'Reescribi el lab 3 de la leccion 08: el enunciado inducia al error equivocado.',
 *     en: 'Rewrote lab 3 of lesson 08: the prompt was leading people to the wrong mistake.',
 *   },
 */
export const REGISTRO: readonly Entrada[] = [];

/** Cuantas se enseñan en la landing antes de cortar. */
export const REGISTRO_EN_PORTADA = 6;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Las entradas validas, ordenadas, ya recortadas.
 *
 * Falla cerrado y en voz alta: una fecha con formato raro o en el futuro no se
 * dibuja a medias ni se ignora en silencio, se cae el build. Una entrada con
 * fecha invalida en la seccion que vende la honestidad del producto es peor que
 * no tener seccion.
 */
export function entradas(hoy = new Date()): readonly Entrada[] {
  for (const e of REGISTRO) {
    if (!FECHA.test(e.fecha)) {
      throw new Error(`registro: fecha con formato invalido: ${JSON.stringify(e.fecha)} (se espera AAAA-MM-DD)`);
    }
    if (new Date(`${e.fecha}T00:00:00Z`) > hoy) {
      throw new Error(`registro: ${e.fecha} esta en el futuro. El registro mira atras; una fecha futura lo convierte en una promesa.`);
    }
  }
  return [...REGISTRO].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

/** La entrada mas reciente, o null si no hay ninguna. La usa el hero. */
export function ultima(hoy = new Date()): Entrada | null {
  return entradas(hoy)[0] ?? null;
}

/**
 * La fecha que va en la cabecera de la pagina, ya formateada.
 *
 * Sale de la entrada mas reciente y de ningun otro sitio: si se cogiera de
 * `Date.now()` diria "actualizado hoy" cada dia sin que nadie hubiera tocado
 * nada, que es una mentira con formato de dato.
 */
export function actualizada(lang: 'es' | 'en', hoy = new Date()): string | null {
  const e = ultima(hoy);
  if (!e) return null;
  const [a, m, d] = e.fecha.split('-').map(Number) as [number, number, number];
  const MESES = lang === 'es'
    ? ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    : ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return `${String(d).padStart(2, '0')} ${MESES[m - 1]} ${a}`;
}
