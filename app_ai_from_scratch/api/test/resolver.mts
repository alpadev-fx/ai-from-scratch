// La respuesta que /admin/soluciones ofrece enviar tiene que ACERTAR.
//
// POR QUE ESTA PRUEBA ES LA QUE SOSTIENE EL BOTON.
// El boton «Resolver» manda esa respuesta a POST /api/labs/:id/attempt, la ruta
// real, con la sesion del admin. Si la forma es la equivocada el grader dice que
// no y queda un INTENTO FALLIDO en attempts, indistinguible de un fallo de
// verdad: el boton no se romperia de forma visible, ensuciaria el progreso.
//
// Y la forma se equivoca con facilidad, porque `solution` y `answer` NO son la
// misma cosa. Un `choice` guarda {"value":"texto"} y se corrige con
// String(answer) === String(sol.value): hay que mandar el texto pelado. Enviar
// el objeto entero devuelve correct:false, medido contra el api en marcha.
//
// Por eso no se prueban «unos cuantos casos»: se recorren TODAS las filas que
// haya en la base, las 36 y las 54, y cada respuesta derivada se pasa por el
// mismo grade() que corrige a los estudiantes. Un lab nuevo con una mecanica sin
// cubrir cae aqui, no en produccion.
import assert from 'node:assert/strict';
import { grade, answerFor } from '../src/grading.ts';
import { many } from '../src/data.ts';
import { pool } from '../src/db.ts';

type Lab = { id: string; kind: string; solution: string; draft: number };
type Question = { id: string; solution: string };

try {
  const labs = await many<Lab>('lab.solutions_all');
  const questions = await many<Question>('question.solutions_all');
  assert.ok(labs.length > 0, 'no llego ningun lab');
  assert.ok(questions.length > 0, 'no llego ninguna pregunta');

  const sinDerivar: string[] = [];
  for (const l of labs) {
    const respuesta = answerFor(l.kind, l.solution);
    if (respuesta === null) { sinDerivar.push(`${l.id} (${l.kind})`); continue; }
    assert.equal(grade({ kind: l.kind, solution: l.solution }, respuesta), true,
      `el lab ${l.id} (${l.kind}) no se acierta con la respuesta que ofrece el panel: ` +
      `${JSON.stringify(respuesta)} contra ${l.solution}`);
  }
  for (const q of questions) {
    const respuesta = answerFor('choice', q.solution);
    assert.notEqual(respuesta, null, `la pregunta ${q.id} no pudo derivar respuesta: ${q.solution}`);
    assert.equal(grade({ kind: 'choice', solution: q.solution }, respuesta), true,
      `la pregunta ${q.id} no se acierta con ${JSON.stringify(respuesta)} contra ${q.solution}`);
  }

  // Lo que NO se deriva tiene que ser solo `build` sin `accept`. Cualquier otra
  // mecanica apareciendo aqui es una que el panel dejo de saber resolver, y el
  // sintoma seria un boton apagado sin que nadie lo hubiera decidido.
  for (const id of sinDerivar) {
    const l = labs.find((x) => id.startsWith(x.id))!;
    assert.equal(l.kind, 'build',
      `${id} no se pudo derivar y no es un build: el panel dejo de saber resolver esa mecanica`);
    const sol = JSON.parse(l.solution) as { accept?: unknown };
    assert.equal(sol.accept, undefined,
      `${id} es un build CON accept y aun asi no se derivo: la derivacion tiene un fallo`);
  }

  // Una mecanica que no existe no se inventa una respuesta.
  assert.equal(answerFor('inventada', '{"value":"x"}'), null);
  // Un JSON roto tampoco tumba nada.
  assert.equal(answerFor('choice', 'no soy json'), null);

  console.log(`resolver: ${labs.length} labs y ${questions.length} preguntas verdes` +
    (sinDerivar.length ? ` · ${sinDerivar.length} build sin accept, boton apagado: ${sinDerivar.join(', ')}` : ''));
} finally {
  await pool.end();
}
