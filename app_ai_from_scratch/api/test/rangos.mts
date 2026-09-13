// Un rango no pertenece a ninguna leccion, y el catalogo tiene que poder decirlo.
//
// POR QUE ESTA PRUEBA EXISTE. Habia UNA operacion para los dos casos, tomando
// lesson_n como Int. Un rango («los tres labs de la leccion, doce veces») no es
// de ninguna leccion, asi que api mandaba lesson_n: null -- y bind() rechaza un
// null para un Int, correctamente: un Int que ademas acepta null es un validador
// con un agujero. El 400 salia por POST /api/labs/:id/attempt y por GET
// /api/logros, asi que cerrar CUALQUIER leccion devolvia un error al navegador y
// nunca se escribia un rango. En produccion eso dejaba /logros y /chat en 500,
// porque las dos paginas piden /api/logros con apiFetch, que lanza si no es 2xx.
//
// Nada lo cogio porque ninguna suite habia cerrado nunca una leccion entera, y
// `data smoke` solo ejercita lecturas. Esto es esa suite.
//
// Lo que pinea: que la operacion por leccion SIGUE rechazando el null -- si
// alguien la "arregla" haciendola nullable, el agujero vuelve y este test cae --
// y que la del rango existe y escribe lesson_n NULL.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { get, run, pool } from '../src/db.ts';
import { write } from '../src/data.ts';

const email = `rango-${randomUUID()}@example.test`;
const user = await get<{ id: number }>(
  `INSERT INTO users (email,name,pass_hash,role,paid,lang,theme)
   VALUES (?,?,?,'student',0,'auto','auto') RETURNING id`,
  [email, 'Rango', 'test-only-not-a-password-hash']);
assert.ok(user);

try {
  // 1. un logro de leccion va por su operacion, con su numero de leccion
  await write('achievement.record', { code: 'l01.maestro', kind: 'leccion', lesson_n: 1 }, user!.id);

  // 2. EL CASO QUE ROMPIA. La operacion por leccion no acepta un rango, porque
  //    no acepta un null, y eso es deliberado: es la guarda, no el fallo.
  await assert.rejects(
    () => write('achievement.record', { code: 'rango.01', kind: 'rango', lesson_n: null }, user!.id),
    /lesson_n/,
    'achievement.record acepto un lesson_n nulo: el Int volvio a tener un agujero');

  // 3. el rango tiene la suya, y no toma leccion ni kind: los dos son literales
  //    en el SQL, asi que esta operacion solo puede escribir la fila que nombra.
  await write('achievement.record_rank', { code: 'rango.01' }, user!.id);

  const filas = await get<{ code: string; kind: string; lesson_n: number | null }>(
    `SELECT code,kind,lesson_n FROM achievements WHERE user_id = ? AND code = 'rango.01'`, [user!.id]);
  assert.ok(filas, 'el rango no se escribio');
  assert.equal(filas!.kind, 'rango');
  assert.equal(filas!.lesson_n, null, 'el rango quedo colgado de una leccion');

  // 4. idempotente: syncAchievements la llama cada vez que recalcula
  await write('achievement.record_rank', { code: 'rango.01' }, user!.id);
  const cuenta = await get<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM achievements WHERE user_id = ? AND code = 'rango.01'`, [user!.id]);
  assert.equal(cuenta!.n, 1, 'el rango se duplico al recalcular');

  console.log('rangos: 4 casos verdes');
} finally {
  await run('DELETE FROM users WHERE id = ?', [user!.id]);
  await pool.end();
}
