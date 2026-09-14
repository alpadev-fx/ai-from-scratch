// DATOS FALSOS. Nada de esto viene del servidor todavía.
//
// Vive en web/src/data/ junto a landing.ts y seller.ts porque es contenido de
// pantalla, no estado: cuando exista el endpoint real, lo único que cambia es
// quién llama a `tutoriales()` — la forma que devuelve es la que tendrá la
// respuesta del API, a propósito, para que sustituirlo sea cambiar una línea y
// no reescribir la vista.
//
// Los comentarios de ejemplo llevan `adjunto` con rutas que NO existen: se
// pintan como una tarjeta de archivo, nunca como <img src>. Un <img> roto en
// una demo se lee como un fallo del producto, y además el repo no sirve
// imágenes remotas (ver components/MetaPixel.astro, el único <img> externo).

import type { Lang } from '../lib/i18n';

export type TipoAdjunto = 'imagen' | 'gif' | 'texto';

export interface Adjunto {
  tipo: TipoAdjunto;
  /** Nombre tal y como lo subiría una persona. No es una ruta servible. */
  nombre: string;
  /** Tamaño en bytes, para pintar «1,2 MB» sin inventarlo en la vista. */
  bytes: number;
}

export interface Comentario {
  id: string;
  autor: string;
  /** Minutos transcurridos. Relativo a propósito: una fecha fija envejece mal
   *  en una demo y `Date.now()` en el servidor rompería la hidratación. */
  haceMin: number;
  texto: { es: string; en: string };
  adjunto?: Adjunto;
}

export interface Tutorial {
  slug: string;
  titulo: { es: string; en: string };
  resumen: { es: string; en: string };
  /** Duración en minutos. */
  min: number;
  nivel: 'facil' | 'medio' | 'dificil';
  etiqueta: { es: string; en: string };
  cuerpo: { es: string[]; en: string[] };
  comentarios: Comentario[];
}

const TUTORIALES: Tutorial[] = [
  {
    slug: 'tu-primer-prompt-que-sirve',
    titulo: { es: 'Tu primer prompt que sirve', en: 'Your first prompt that works' },
    resumen: {
      es: 'Qué pides, para quién y cómo. Tres partes: quita una y el resultado se cae.',
      en: 'What you ask, who for, and how. Three parts: drop one and the answer falls apart.',
    },
    min: 9,
    nivel: 'facil',
    etiqueta: { es: 'Fundamentos', en: 'Basics' },
    cuerpo: {
      es: [
        'Un prompt no es una pregunta: es un encargo. Un encargo lleva qué quieres, para quién es y en qué forma lo quieres.',
        'Quita «para quién» y te contesta a un público inventado. Quita «cómo» y te devuelve tres párrafos cuando querías una lista.',
        'Hazlo en este orden y verás el cambio en el primer intento.',
      ],
      en: [
        'A prompt is not a question: it is a commission. A commission carries what you want, who it is for, and the shape you want it in.',
        'Drop "who for" and it answers an invented audience. Drop "how" and you get three paragraphs when you wanted a list.',
        'Do it in that order and you will see the change on the first try.',
      ],
    },
    comentarios: [
      {
        id: 'c1',
        autor: 'Marcela Ruiz',
        haceMin: 42,
        texto: {
          es: 'Lo de poner «para quién» al principio me cambió el resultado entero. Dejo captura de lo que me devolvía antes.',
          en: 'Putting "who for" first changed the whole answer. Leaving a screenshot of what I used to get.',
        },
        adjunto: { tipo: 'imagen', nombre: 'antes-y-despues.png', bytes: 412_000 },
      },
      {
        id: 'c2',
        autor: 'Daniel Ossa',
        haceMin: 18,
        texto: {
          es: '¿La forma va al final siempre? A mí me funciona mejor al principio cuando pido tablas.',
          en: 'Does the shape always go last? It works better up front for me when I ask for tables.',
        },
      },
    ],
  },
  {
    slug: 'por-que-inventa-cosas',
    titulo: { es: 'Por qué inventa cosas', en: 'Why it makes things up' },
    resumen: {
      es: 'Suena seguro y está equivocado. No es una avería: es cómo funciona por dentro.',
      en: 'It sounds certain and it is wrong. Not a fault: that is how it works inside.',
    },
    min: 12,
    nivel: 'medio',
    etiqueta: { es: 'Criterio', en: 'Judgement' },
    cuerpo: {
      es: [
        'El modelo no consulta nada: predice la siguiente palabra. Cuando no sabe, la palabra más probable sigue existiendo, y sale con el mismo tono de siempre.',
        'Por eso el error no viene marcado. Suena igual de bien que un acierto.',
        'La defensa no es pedirle que no invente: es pedirle de dónde lo saca y comprobarlo tú.',
      ],
      en: [
        'The model looks nothing up: it predicts the next word. When it does not know, the most likely word still exists, and it comes out in the usual tone.',
        'That is why the error arrives unmarked. It sounds exactly as good as a correct answer.',
        'The defence is not asking it to stop inventing: it is asking where it got that, and checking yourself.',
      ],
    },
    comentarios: [
      {
        id: 'c3',
        autor: 'Paula Cárdenas',
        haceMin: 210,
        texto: {
          es: 'Me pasó con una cita de un libro que no existe. Subo el gif de mi cara al comprobarlo.',
          en: 'Happened to me with a quote from a book that does not exist. Uploading the gif of my face when I checked.',
        },
        adjunto: { tipo: 'gif', nombre: 'cara-de-susto.gif', bytes: 1_250_000 },
      },
    ],
  },
  {
    slug: 'el-contexto-se-acaba',
    titulo: { es: 'El contexto se acaba', en: 'Context runs out' },
    resumen: {
      es: 'Qué pasa en una conversación larga y por qué de repente olvida lo del principio.',
      en: 'What happens in a long conversation and why it suddenly forgets the start.',
    },
    min: 7,
    nivel: 'facil',
    etiqueta: { es: 'Fundamentos', en: 'Basics' },
    cuerpo: {
      es: [
        'Cada conversación cabe en una ventana. Cuando se llena, lo viejo sale por el otro lado.',
        'No te avisa. Solo empieza a contestar como si no hubieras dicho lo de antes.',
        'Si algo importa, repítelo cuando vuelva a hacer falta. Es más barato que pelearse.',
      ],
      en: [
        'Every conversation fits in a window. When it fills up, the old part falls out the other side.',
        'It does not warn you. It just starts answering as if you had never said the earlier thing.',
        'If something matters, say it again when it matters again. Cheaper than arguing.',
      ],
    },
    comentarios: [
      {
        id: 'c4',
        autor: 'Iván Betancur',
        haceMin: 1_440,
        texto: {
          es: 'Dejo mis notas del tutorial en txt por si a alguien le sirven.',
          en: 'Leaving my notes from the tutorial as txt in case they help anyone.',
        },
        adjunto: { tipo: 'texto', nombre: 'notas-contexto.txt', bytes: 3_400 },
      },
    ],
  },
];

/** Lo que un día devolverá el endpoint. Hoy lo devuelve un array en memoria. */
export const tutoriales = (): Tutorial[] => TUTORIALES;

export const tutorialPorSlug = (slug: string): Tutorial | undefined =>
  TUTORIALES.find((x) => x.slug === slug);

// `Lang` declara 'fr' y 'pt' pero solo hay diccionario de 'es' y 'en', y t()
// cae a español para el resto (lib/i18n.ts). Aquí se hace lo MISMO en vez de
// indexar por el idioma: indexar daría `undefined` y la vista pintaría vacío
// para un usuario en portugués, que es un fallo silencioso.
const cual = <T,>(m: { es: T; en: T }, lang: Lang): T => (lang === 'en' ? m.en : m.es);

/** Aplana un tutorial al idioma pedido: la vista no debería saber que hay dos. */
export const enIdioma = (x: Tutorial, lang: Lang) => ({
  slug: x.slug,
  titulo: cual(x.titulo, lang),
  resumen: cual(x.resumen, lang),
  min: x.min,
  nivel: x.nivel,
  etiqueta: cual(x.etiqueta, lang),
  cuerpo: cual(x.cuerpo, lang),
  comentarios: x.comentarios.map((c) => ({
    id: c.id, autor: c.autor, haceMin: c.haceMin, texto: cual(c.texto, lang), adjunto: c.adjunto,
  })),
});

export type TutorialPlano = ReturnType<typeof enIdioma>;
export type ComentarioPlano = TutorialPlano['comentarios'][number];
