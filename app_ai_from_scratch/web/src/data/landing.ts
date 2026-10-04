// Landing content — typed source of truth (TS 7 / Go-native compiler).
//
// BILINGÜE, y la traducción es ADAPTACIÓN, no calco. Tres reglas que ya costaron
// una revisión en el carrusel y valen igual aquí:
//   · las escalas de número se reescriben: «70.000.000.000» no es "70,000,000,000"
//     en una tarjeta, es "70 billion";
//   · los ejemplos con gracia se localizan: «Sr. Mostacho» es "Mr. Whiskers", no
//     "Mr. Mustache";
//   · el ejemplo de tokens: «Cartagena es hermosa» y "Cartagena is beautiful" son
//     3 palabras y 4 tokens o200k cada una (Cart|agena| es| hermosa y
//     Cart|agena| is| beautiful, medido con tiktoken). La tarjeta dice el conteo
//     REAL (decidido el 2026-10-04; antes decia 5 para cuadrar con el especimen);
//     el especimen A corta con una heuristica de 5 y 4 letras: lleva ILUSTRATIVO.
//
// Antes este archivo era solo español y la landing declaraba hreflang="en"
// apuntando a la misma URL en español, que es una promesa falsa a Google y a
// cualquier asistente que la cite.
import type { Lang } from '../lib/i18n';

export interface Module { n: string; eb: string; h: string; d: string; k: string; kc: string; }
export interface Candidate { name: string; logit: number; }
export interface Faq { q: string; a: string; }

const MODULES_ES: Module[] = [
  { n:"01", eb:"LA IA", h:"Aprende con ejemplos", d:"No recibe reglas escritas: encuentra patrones entre miles de ejemplos etiquetados.", k:"100.000", kc:"fotos de gatos ayudan a aprender qué distingue a un gato. A ti te bastan unas pocas para reconocerlo." },
  { n:"02", eb:"CÓMO MEJORA", h:"Juega frío y caliente", d:"Mejorar, para ella, es una sola cosa: que el número de “qué tan lejos quedé” baje.", k:"94 → 23 → 4", kc:"así baja el error con la práctica. Entrenar = hacerlo bajar." },
  { n:"03", eb:"DÓNDE LO GUARDA", h:"Todo queda en perillas", d:"Lo aprendido no son fotos ni frases: son millones de números ajustados.", k:"70.000.000.000", kc:"perillas puede tener un modelo grande. Cada una, por sí sola, es solo un número." },
  { n:"04", eb:"POR QUÉ NO CAMBIA", h:"Contigo no aprende", d:"Estudiar y responder son dos momentos separados. Cuando le hablas, el estudio ya terminó.", k:"1 vez", kc:"se entrena, y cuesta millones. Responder cuesta centavos." },
  { n:"05", eb:"CÓMO LEE", h:"Lee pedacitos: tokens", d:"No ve palabras ni letras. Parte tu texto en trozos y trabaja con esos.", k:"3 palabras = 4 tokens", kc:"todo se mide y se cobra en tokens." },
  { n:"06", eb:"CÓMO ESCRIBE", h:"Elige el siguiente token", d:"Calcula opciones, elige un token y vuelve a calcular con el texto nuevo.", k:"31 de 100", kc:"las probabilidades de todas las opciones suman 100." },
  { n:"07", eb:"CÓMO PEDIRLE", h:"La fórmula del buen pedido", d:"No adivina lo que tienes en la cabeza. Tu explicación es todo lo que recibe.", k:"qué + para quién + cómo", kc:"esa es toda la fórmula. Lo que no digas, lo rellena genérico." },
  { n:"08", eb:"SU MEMORIA", h:"La mesa se llena", d:"Solo puede mantener presente una cantidad limitada de conversación a la vez.", k:"CONTEXTO", kc:"se mide en tokens y cambia según el modelo. Lo más antiguo puede quedar fuera." },
  { n:"09", eb:"SU PERILLA", h:"Seria o creativa: tú eliges", d:"La temperatura decide cuánto azar acepta al elegir entre sus opciones.", k:"TEMPERATURA", kc:"baja para respuestas consistentes; más alta para explorar ideas." },
  { n:"10", eb:"SU PELIGRO", h:"Puede inventar con seguridad", d:"Si le falta un dato, puede completar con algo que suena convincente, pero es falso.", k:"suena ≠ cierto", kc:"una respuesta fluida no demuestra que sea cierta: verifica la fuente." },
  { n:"11", eb:"SU FECHA", h:"Su conocimiento tiene fecha", d:"Aprendió hasta un día concreto. Para saber lo reciente necesita una fuente actual.", k:"FUENTE ACTUAL", kc:"la aplicación puede buscarla y entregársela como contexto." },
  { n:"12", eb:"EMPIEZA HOY", h:"Copia, pega y listo", d:"Es una herramienta para pensar y producir más rápido. No decide por ti.", k:"5 min al día", kc:"bastan para agarrarle la mano." }
];

const MODULES_EN: Module[] = [
  { n:"01", eb:"WHAT AI IS", h:"It learns from examples", d:"Nobody writes it rules: it finds the pattern across thousands of labelled examples.", k:"100,000", kc:"cat photos to learn what makes a cat a cat. A few are enough for you." },
  { n:"02", eb:"HOW IT IMPROVES", h:"It plays hot and cold", d:"Improving, for it, is one single thing: making the “how far off was I” number go down.", k:"94 → 23 → 4", kc:"that is the error dropping with practice. Training = pushing it down." },
  { n:"03", eb:"WHERE IT KEEPS IT", h:"It all lives in dials", d:"What it learned is not photos or sentences: it is millions of tuned numbers.", k:"70 billion", kc:"dials is what a big model can carry. Each one, alone, is just a number." },
  { n:"04", eb:"WHY IT DOESN'T CHANGE", h:"It doesn't learn from you", d:"Studying and answering are two separate moments. By the time you talk to it, studying is over.", k:"once", kc:"it trains, and it costs millions. Answering costs cents." },
  { n:"05", eb:"HOW IT READS", h:"It reads chunks: tokens", d:"It sees neither words nor letters. It splits your text into pieces and works with those.", k:"3 words = 4 tokens", kc:"everything is measured and billed in tokens." },
  { n:"06", eb:"HOW IT WRITES", h:"It picks the next token", d:"It scores the options, picks one token, then scores again with the new text.", k:"31 out of 100", kc:"the odds of every option add up to 100." },
  { n:"07", eb:"HOW TO ASK", h:"The formula for a good ask", d:"It cannot guess what is in your head. Your explanation is everything it gets.", k:"what + for whom + how", kc:"that is the whole formula. Whatever you leave out, it fills in generic." },
  { n:"08", eb:"ITS MEMORY", h:"The table fills up", d:"It can only hold a limited amount of the conversation in front of it at once.", k:"CONTEXT", kc:"measured in tokens, and it varies by model. The oldest part can fall off." },
  { n:"09", eb:"ITS DIAL", h:"Serious or creative: you choose", d:"Temperature decides how much chance it accepts when picking among its options.", k:"TEMPERATURE", kc:"low for consistent answers; higher to go exploring." },
  { n:"10", eb:"ITS DANGER", h:"It can invent, confidently", d:"When a fact is missing it may fill the gap with something convincing and false.", k:"fluent ≠ true", kc:"a smooth answer is no proof it is right: check the source." },
  { n:"11", eb:"ITS CUTOFF", h:"Its knowledge has a date", d:"It learned up to one specific day. For anything recent it needs a live source.", k:"LIVE SOURCE", kc:"the app can fetch it and hand it over as context." },
  { n:"12", eb:"START TODAY", h:"Copy, paste, done", d:"It is a tool for thinking and producing faster. It does not decide for you.", k:"5 min a day", kc:"is all it takes to get the hang of it." }
];

// El candidato con logit bajo es el chiste de la lección 9: la opción rara que
// solo gana con la temperatura arriba. «Sr. Mostacho» → "Mr. Whiskers", que es
// el nombre gracioso de gato en inglés; "Mr. Mustache" no le hace gracia a nadie.
const CANDS_ES: Candidate[] = [
  { name:"Max", logit:5.2 }, { name:"Luna", logit:4.7 }, { name:"Rocky", logit:3.9 },
  { name:"Coco", logit:3.4 }, { name:"Sr. Mostacho", logit:1.1 }, { name:"Nube", logit:0.7 }
];

const CANDS_EN: Candidate[] = [
  { name:"Max", logit:5.2 }, { name:"Luna", logit:4.7 }, { name:"Rocky", logit:3.9 },
  { name:"Coco", logit:3.4 }, { name:"Mr. Whiskers", logit:1.1 }, { name:"Cloud", logit:0.7 }
];

// El FAQ sigue el brief del embudo (scratchpad/funnel/creative-brief.md §3):
// programar, tiempo, qué incluye, cancelar, renovación. Es superficie
// contractual, así que la promesa de contenido nuevo se dice sin cadencia («lo
// que se vaya publicando»), no «cada mes». Ningún string promete un aviso por
// correo antes de un cobro: la plataforma no tiene remitente.
const FAQS_ES: Faq[] = [
  { q:"¿Necesito saber programar?", a:"No. Ni una línea de código ni una fórmula. Todo se explica con cosas que ya usas: un chat, una perilla de volumen, una mesa que se llena." },
  { q:"¿Cuánto tiempo me toma?", a:"Cada lección es corta y se hace desde el celular. Una en el bus, otra en el almuerzo. Vas a tu ritmo y el avance se guarda donde lo dejes." },
  { q:"¿Sirve si ya uso ChatGPT todos los días?", a:"Sí, y quienes ya la usan suelen aprovecharlo más. Usar la IA no es lo mismo que entenderla: aquí vas a ver por qué se inventa datos, por qué se pone rara a mitad del chat y por qué el mismo pedido a veces sale genérico." },
  { q:"¿Qué incluye la suscripción?", a:"Todo lo que hay hoy y todo lo que se vaya publicando: tutoriales, labs y cursos nuevos se suman a tu suscripción sin costo extra mientras esté activa. Yo los sigo produciendo; tú no vuelves a pagar por ellos." },
  { q:"¿Qué es el harness que incluyes?", a:"Es mi entorno de trabajo con Claude Code, el mismo que uso: la configuración (skills, hooks, slash commands y settings), los agentes y workflows que tengo armados, y los 9 prompts con sus plantillas. Va en un repo al que tienes acceso: cuando lo actualizo, lo vuelves a descargar mientras tu acceso esté activo. No necesitas saber programar para usar los prompts; la parte de configuración es para cuando quieras dar el siguiente paso." },
  { q:"¿Puedo cancelar?", a:"Sí, cuando quieras, desde tu perfil, en un clic y sin dar explicaciones. No hay permanencia ni cobro de salida. Sigues entrando hasta el final del mes que ya pagaste." },
  { q:"¿Qué pasa con la renovación automática?", a:"Viene apagada. Si la dejas así, a los 30 días el acceso se pausa, tu avance se guarda y no se cobra nada más. Si la activas, Mercado Pago cobra 39.990 COP cada mes hasta que la canceles desde tu perfil, en un clic." },
  { q:"¿Y si no me sirve?", a:"Tienes 14 días para escribirme y recibir un reembolso completo de los $39.990. Sin formularios ni preguntas." }
];

const FAQS_EN: Faq[] = [
  { q:"Do I need to know how to code?", a:"No. Not one line of code, not one formula. Everything is explained with things you already use: a chat, a volume dial, a table that fills up." },
  { q:"How long does it take?", a:"Each lesson is short and works on your phone. One on the bus, another at lunch. Go at your own pace; your progress is saved where you leave it." },
  { q:"Is it worth it if I already use ChatGPT daily?", a:"Yes, and daily users usually get more out of it. Using AI is not the same as understanding it: here you will see why it invents facts, why it gets strange halfway through a chat, and why the same request sometimes comes back generic." },
  { q:"What does the subscription include?", a:"Everything that is here today and everything published from now on: new tutorials, labs and courses are added to your subscription at no extra cost while it is active. I keep producing them; you never pay extra for them." },
  { q:"What is the harness you include?", a:"It is my working setup for Claude Code, the same one I use: the configuration (skills, hooks, slash commands and settings), the agents and workflows I have wired up, and the 9 prompts with their templates. It lives in a repo you get access to: when I update it, you download it again while your access is active. You do not need to code to use the prompts; the configuration part is there for when you want to take the next step." },
  { q:"Can I cancel?", a:"Yes, anytime, from your profile, in one click and with no explanation needed. No minimum term, no exit fee. You keep access until the end of the month you already paid for." },
  { q:"What about auto-renewal?", a:"It is off by default. Leave it off and after 30 days access pauses, your progress is saved and nothing else is charged. Turn it on and Mercado Pago charges 39,990 COP every month until you cancel from your profile, in one click." },
  { q:"What if it is not for me?", a:"You have 14 days to email me and get the full 39,990 COP back. No forms, no questions." }
];

// Micro-tipografía del fondo: fragmentos, no frases. Se traducen los que son
// palabras y se dejan los que son números, símbolos o etiquetas de lección.
const MICRO_ES: string[] = ["01·LA IA","TOKENS","+","70.000.000.000","ES/EN","×","94→23→4","$39.990","//","T=0.30","12/12","CONTEXTO","suena ≠ cierto","·","100.000","FRÍO","CALIENTE","→","perillas","05·CÓMO LEE","31/100","IA","∞","1 vez","carta|gena","AD","09·PERILLA","memoria: ayer","•","internet: hoy","qué+quién+cómo","○","4:5","1080×1350","12 LECCIONES","−","error↓","no sé","□","5 min/día","06·ESCRIBE","suave 12","azul ~0","△","ES","EN","+","bueno 31","Max","Sr. Mostacho","／","3 palabras","4 tokens","·","10·PELIGRO","verifícalo","◇","08·MESA","se llena","lo viejo cae","×","07·PEDIRLE","genérico","≠","04·NO CAMBIA","libro impreso","·","02·MEJORA","frío/caliente","+","03·PERILLAS","70B","○","11·FECHA","corte","hoy","→","12·EMPIEZA","copia","pega","·","40 min","garantía 14d","+","$39.990 · 30 días","renovación opcional","×","@alxn_dev_ai","IA fácil","·","2160×2700","PNG 2×","○","carrusel","·","VOL. 1","fundamentos","+","AD"];

const MICRO_EN: string[] = ["01·WHAT AI IS","TOKENS","+","70 billion","ES/EN","×","94→23→4","39,990 COP","//","T=0.30","12/12","CONTEXT","fluent ≠ true","·","100,000","COLD","HOT","→","dials","05·HOW IT READS","31/100","AI","∞","once","beaut|iful","AD","09·THE DIAL","memory: yesterday","•","internet: today","what+who+how","○","4:5","1080×1350","12 LESSONS","−","error↓","I don't know","□","5 min/day","06·HOW IT WRITES","soft 12","blue ~0","△","ES","EN","+","good 31","Max","Mr. Whiskers","／","3 words","4 tokens","·","10·THE DANGER","check it","◇","08·THE TABLE","fills up","the old falls off","×","07·HOW TO ASK","generic","≠","04·NO CHANGE","printed book","·","02·IMPROVING","hot/cold","+","03·DIALS","70B","○","11·CUTOFF","cutoff","today","→","12·START","copy","paste","·","40 min","14-day refund","+","39,990 COP · 30 days","renewal optional","×","@alxn_dev_ai","AI made easy","·","2160×2700","PNG 2×","○","carousel","·","VOL. 1","fundamentals","+","AD"];

const TICKER_ES: string[] = ["12 LECCIONES","·","ES / EN","·","40 MIN DE LECTURA","·","1080 × 1350","·","$39.990 · 30 DÍAS","·","GARANTÍA 14 DÍAS","·","9 PROMPTS INCLUIDOS","·","MI HARNESS DE CLAUDE CODE","·","SIN CÓDIGO","·","SIN FÓRMULAS","·","RENOVACIÓN OPCIONAL","·","TUTORIALES, LABS Y CURSOS NUEVOS INCLUIDOS","·","FUNDAMENTOS · VOL. 1","·","@ALXN_DEV_AI","·"];

const TICKER_EN: string[] = ["12 LESSONS","·","ES / EN","·","40 MIN READ","·","1080 × 1350","·","39,990 COP · 30 DAYS","·","14-DAY REFUND","·","9 PROMPTS INCLUDED","·","MY CLAUDE CODE HARNESS","·","NO CODE","·","NO FORMULAS","·","RENEWAL OPTIONAL","·","NEW TUTORIALS, LABS AND COURSES INCLUDED","·","FUNDAMENTALS · VOL. 1","·","@ALXN_DEV_AI","·"];

export const modulos = (lang: Lang): Module[] => (lang === 'en' ? MODULES_EN : MODULES_ES);
export const candidatos = (lang: Lang): Candidate[] => (lang === 'en' ? CANDS_EN : CANDS_ES);
export const preguntas = (lang: Lang): Faq[] => (lang === 'en' ? FAQS_EN : FAQS_ES);
export const micro = (lang: Lang): string[] => (lang === 'en' ? MICRO_EN : MICRO_ES);
export const ticker = (lang: Lang): string[] => (lang === 'en' ? TICKER_EN : TICKER_ES);

export const LOGO = "/logo.png";
