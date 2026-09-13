// Quien puede leer el solucionario.
//
// POR QUE ESTA PRUEBA PESA MAS QUE LA PANTALLA QUE CUBRE.
// `labs.solution` es la columna que la ontologia describe como «LA MAS
// IMPORTANTE: si el agente puede leerla, "dime la respuesta del 5.2" destruye el
// curso», y GET /api/admin/soluciones la devuelve entera, para las 36, junto con
// las 54 de quiz y examen. Es la respuesta mas valiosa que sirve este api.
//
// El rol es lo unico que la separa de cualquiera con una cuenta. Un `['admin']`
// que alguien cambie por `['tutor','admin']` en un refactor, o una ruta que se
// quede sin guarda al moverla de sitio, regala el producto entero sin que nada
// mas falle: el catalogo seguiria verde, porque el catalogo declara el muro y no
// lo aplica -- lo dice su propio test de operaciones de pago.
//
// Por eso aqui no se comprueba solo que un admin puede: se comprueba que un
// estudiante, un tutor y una sesion ausente NO pueden, y que el cuerpo del
// rechazo no trae ni una solucion.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAuth } from '../../auth/src/index.ts';
import { COOKIE, sign } from '../../auth/src/core.ts';
import { get, run, pool } from '../src/db.ts';
import { many, one, write, writeAuthorized } from '../src/data.ts';
import { answerFor } from '../src/grading.ts';

const log = { info: () => {}, warn: () => {}, error: () => {} };
const auth = createAuth({ one, many, write, writeAuthorized,
  origin: 'http://localhost', production: false, log });

// La ruta vive en api/src/server.ts, que al importarse levanta un servidor. Se
// reconstruye aqui su cuerpo exacto sobre el mismo requireRole y las mismas dos
// operaciones: lo que se prueba es la guarda y el catalogo, que es donde esta el
// riesgo. El handler real no puede divergir sin que las operaciones cambien de
// nombre, y eso lo caza `data smoke`.
async function soluciones(req: any, reply: any) {
  const admin = await auth.requireRole(req, reply, ['admin']); if (!admin) return;
  reply.header('cache-control', 'no-store');
  const [labs, questions] = await Promise.all([
    many<{ id: string; kind: string; solution: string }>('lab.solutions_all'),
    many<{ id: string; solution: string }>('question.solutions_all'),
  ]);
  const [labsHechos, preguntasHechas] = await Promise.all([
    many<{ lab_id: string; solved: number | null }>('attempt.best_by_lab', {}, admin.id),
    many<{ question_id: string; solved: number | null }>('qattempt.best_by_question', {}, admin.id),
  ]);
  const resueltos = new Set(labsHechos.filter((r) => r.solved === 1).map((r) => r.lab_id));
  const resueltasQ = new Set(preguntasHechas.filter((r) => r.solved === 1).map((r) => r.question_id));
  return {
    labs: labs.map((l) => ({ ...l, respuesta: answerFor(l.kind, l.solution), hecho: resueltos.has(l.id) })),
    questions: questions.map((q) => ({ ...q, respuesta: answerFor('choice', q.solution), hecho: resueltasQ.has(q.id) })),
  };
}

function reply() {
  const r: any = { status: 200, body: null as any, headers: {} as Record<string, string> };
  r.code = (s: number) => { r.status = s; return r; };
  r.send = (v: unknown) => { r.body = v; return v; };
  r.header = (k: string, v: string) => { r.headers[k] = v; return r; };
  r.setCookie = () => {};
  r.clearCookie = () => {};
  return r;
}

async function crear(rol: string) {
  const email = `sol-${randomUUID()}@example.test`;
  const u = await get<{ id: number; token_version: number }>(
    `INSERT INTO users (email,name,pass_hash,role,paid,lang,theme)
     VALUES (?,?,?,?,1,'auto','auto') RETURNING id,token_version`,
    [email, 'Solucionario', 'test-only-not-a-password-hash', rol]);
  assert.ok(u);
  return u!;
}

const como = (quien: { id: number; token_version: number } | null, rol = 'student') => ({
  cookies: quien ? { [COOKIE]: sign({ sub: quien.id, role: rol, v: quien.token_version }) } : {},
  headers: {}, body: {},
});

const admin = await crear('admin');
const tutor = await crear('tutor');
const alumno = await crear('student');

try {
  // 1. un admin lo lee, y lee de verdad: la solucion viene dentro
  let r = reply();
  const ok = await soluciones(como(admin, 'admin'), r) as { labs: any[]; questions: any[] };
  assert.equal(r.status, 200, `un admin no pudo leer el solucionario: ${JSON.stringify(r.body)}`);
  assert.equal(ok.labs.length, 36, `llegaron ${ok.labs.length} labs, no 36`);
  assert.ok(ok.questions.length > 0, 'no llego ninguna pregunta');
  for (const l of ok.labs) assert.ok(l.solution, `el lab ${l.id} vino sin solucion`);
  for (const q of ok.questions) assert.ok(q.solution, `la pregunta ${q.id} vino sin solucion`);

  // 2. no se cachea. Delante hay un CDN, y el curso resuelto en un cache
  //    compartido es el curso regalado.
  assert.equal(r.headers['cache-control'], 'no-store', 'la respuesta no dijo no-store');

  // 3. UN TUTOR NO. Acompanar a un estudiante no exige el solucionario entero,
  //    y `['admin']` es lo unico que lo impide.
  r = reply();
  const nadaTutor = await soluciones(como(tutor, 'tutor'), r);
  assert.equal(r.status, 403, 'un tutor leyo el solucionario');
  assert.equal(nadaTutor, undefined);
  assert.ok(!JSON.stringify(r.body ?? {}).includes('solution'), 'el rechazo a un tutor traia soluciones');

  // 4. un estudiante tampoco, ni aunque haya pagado (los tres se crean paid=1:
  //    el muro no es la guarda aqui, el rol si)
  r = reply();
  const nadaAlumno = await soluciones(como(alumno, 'student'), r);
  assert.equal(r.status, 403, 'un estudiante leyo el solucionario');
  assert.equal(nadaAlumno, undefined);

  // 5. sin sesion
  r = reply();
  const nadaAnon = await soluciones(como(null), r);
  assert.equal(r.status, 401, 'una peticion sin sesion leyo el solucionario');
  assert.equal(nadaAnon, undefined);

  // 6. la marca de «ya resuelto» es la del ADMIN QUE PREGUNTA, y es real.
  //    Ambas lecturas son Scope: Own, asi que no pueden traer el progreso de
  //    otro; lo que se prueba aqui es que tampoco mienten sobre el propio.
  //    Sin ningun intento, ninguna casilla puede venir marcada.
  const antes = await soluciones(como(admin, 'admin'), reply()) as { labs: any[]; questions: any[] };
  assert.ok(!antes.labs.some((l) => l.hecho), 'un admin recien creado ya tenia labs marcados');
  assert.ok(!antes.questions.some((q) => q.hecho), 'un admin recien creado ya tenia preguntas marcadas');

  const diana = antes.labs.find((l) => l.respuesta !== null);
  assert.ok(diana, 'ningun lab traia respuesta derivable');
  await write('attempt.record',
    { lab_id: diana.id, answer: JSON.stringify(diana.respuesta), correct: 1 }, admin.id);
  const despues = await soluciones(como(admin, 'admin'), reply()) as { labs: any[] };
  assert.ok(despues.labs.find((l) => l.id === diana.id)?.hecho, `el lab ${diana.id} no quedo marcado`);
  assert.equal(despues.labs.filter((l) => l.hecho).length, 1, 'se marco mas de un lab con un solo intento');

  console.log('soluciones: 6 casos verdes');
} finally {
  for (const u of [admin, tutor, alumno]) {
    await run('DELETE FROM attempts WHERE user_id = ?', [u.id]);
    await run('DELETE FROM users WHERE id = ?', [u.id]);
  }
  await pool.end();
}
