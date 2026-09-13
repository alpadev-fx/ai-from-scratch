// Activar y cortar el acceso a mano desde /admin.
//
// POR QUE ESTA PRUEBA EXISTE, Y POR QUE LA QUINTA ES LA QUE IMPORTA.
// El acceso de pago se deriva de `entitlement_events` con un OR: concede si
// CUALQUIER fuente concede. Con esa regla sola, «cortarle el acceso a alguien»
// no era expresable -- mientras hubiera un cobro vivo en Mercado Pago, esa fila
// seguia concediendo y el corte del admin no se notaba en ninguna parte. Por eso
// el corte es una fuente aparte (`admin_block`) que se RESTA, y por eso el caso
// 5 comprueba justo eso: cancelar a alguien con un cobro vivo.
//
// La ultima comprueba lo contrario y es igual de importante: una concesion a
// mano CADUCA. Si no lo hiciera, «activar un mes» seria acceso gratis para
// siempre escrito a mano, que es el agujero que el muro existe para no tener.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAuth } from '../../auth/src/index.ts';
import { COOKIE, sign } from '../../auth/src/core.ts';
import { get, run, pool } from '../src/db.ts';
import { many, one, write, writeAuthorized } from '../src/data.ts';

const log = { info: () => {}, warn: () => {}, error: () => {} };
const auth = createAuth({ one, many, write, writeAuthorized,
  origin: 'http://localhost', production: false, log });

/** App falsa: de las veintitantas rutas aqui solo interesan dos. */
let suscripcion: ((req: any, reply: any) => Promise<unknown>) | null = null;
let listar: ((req: any, reply: any) => Promise<unknown>) | null = null;
const nada = () => {};
const app: any = { post: nada, delete: nada, put: nada,
  get: (ruta: string, handler: any) => { if (ruta === '/api/admin/users') listar = handler; },
  patch: (ruta: string, handler: any) => {
    if (ruta === '/api/admin/users/:id/suscripcion') suscripcion = handler;
  } };
auth.registerRoutes(app);
assert.ok(suscripcion, 'no se registro PATCH /api/admin/users/:id/suscripcion');
assert.ok(listar, 'no se registro GET /api/admin/users');

// El handler DEVUELVE el cuerpo en el camino bueno y solo usa reply.send() para
// los errores, asi que `llamar` guarda las dos formas en el mismo sitio. Leer
// solo r.body dejaba `body` a null tras un 200 y la prueba petaba por su culpa,
// no por la del codigo.
function reply() {
  const r: any = { status: 200, body: null as any };
  r.code = (s: number) => { r.status = s; return r; };
  r.send = (v: unknown) => { r.body = v; return v; };
  r.setCookie = nada;
  r.clearCookie = nada;
  return r;
}

async function llamar(req: any): Promise<{ status: number; body: any }> {
  const r = reply();
  const devuelto = await suscripcion!(req, r);
  return { status: r.status, body: r.body ?? devuelto };
}

async function crear(rol: string) {
  const email = `sus-${randomUUID()}@example.test`;
  const u = await get<{ id: number; token_version: number }>(
    `INSERT INTO users (email,name,pass_hash,role,paid,lang,theme)
     VALUES (?,?,?,?,0,'auto','auto') RETURNING id,token_version`,
    [email, 'Suscripcion', 'test-only-not-a-password-hash', rol]);
  assert.ok(u);
  return u!;
}

const como = (quien: { id: number; token_version: number }, rol: string, id: number, body: unknown) => ({
  cookies: { [COOKIE]: sign({ sub: quien.id, role: rol, v: quien.token_version }) },
  headers: {}, params: { id: String(id) }, body,
});

const paidDe = async (id: number) =>
  (await get<{ paid: number }>('SELECT paid FROM users WHERE id = ?', [id]))?.paid;

/** Un cobro firmado de Mercado Pago, vivo `dias` dias. Lo que llega por webhook. */
async function cobroVivo(userId: number, dias: number) {
  await write('auth.entitlement_record', {
    event: `mp-test-${randomUUID()}`, active: true, source: 'mercadopago',
    external: `pref-${randomUUID()}`, occurred: new Date().toISOString(),
    period: new Date(Date.now() + dias * 86_400_000).toISOString(),
  }, userId);
  await one('auth.entitlement_apply', {}, userId);
}

const admin = await crear('admin');
const pelado = await crear('student');     // nunca ha pagado
const comprador = await crear('student');  // con cobro vivo
const intruso = await crear('student');

try {
  // 1. activar a mano a quien no ha pagado: un mes por defecto
  let r = await llamar(como(admin, 'admin', pelado.id, { estado: 'activa' }));
  assert.equal(r.status, 200, `no se pudo activar: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.suscripcion.estado, 'activa');
  assert.equal(r.body.suscripcion.aMano, true);
  assert.equal(await paidDe(pelado.id), 1, 'se activo pero paid no subio');
  const mes = Date.parse(r.body.suscripcion.hasta) - Date.now();
  assert.ok(mes > 29 * 86_400_000 && mes < 31 * 86_400_000,
    `un mes por defecto, y dio ${Math.round(mes / 86_400_000)} dias`);

  // 2. la lista lo cuenta, y lo cuenta como concedido a mano
  const lista = await listar!(como(admin, 'admin', pelado.id, {}), reply()) as { users: any[] };
  const fila = lista.users.find((u) => u.id === pelado.id);
  assert.ok(fila, 'la cuenta activada no sale en la lista');
  assert.equal(fila.suscripcion.estado, 'activa');
  assert.equal(fila.suscripcion.aMano, true, 'la lista no distingue una concesion a mano de un cobro');

  // 3. dias a medida
  r = await llamar(como(admin, 'admin', pelado.id, { estado: 'activa', dias: 7 }));
  assert.equal(r.status, 200);
  const semana = Date.parse(r.body.suscripcion.hasta) - Date.now();
  assert.ok(semana > 6 * 86_400_000 && semana < 8 * 86_400_000,
    `siete dias, y dio ${Math.round(semana / 86_400_000)}`);

  // 4. lo que el servidor no acepta, y no acepta a medias
  for (const malo of [{ estado: 'regalado' }, { estado: 'activa', dias: 0 },
    { estado: 'activa', dias: -5 }, { estado: 'activa', dias: 1.5 },
    { estado: 'activa', dias: 4000 }, {}]) {
    r = await llamar(como(admin, 'admin', pelado.id, malo));
    assert.equal(r.status, 400, `acepto ${JSON.stringify(malo)}`);
  }
  assert.equal(await paidDe(pelado.id), 1, 'una peticion rechazada cambio el acceso');

  // 4b. ...y los dias NO se validan cuando no se esta activando. Medido en
  //     /admin: la caja conserva el valor de la accion anterior, asi que cortar
  //     con un 0 dentro devolvia 400 y el acceso se quedaba abierto. Un corte no
  //     puede depender de un campo que no participa en el.
  for (const estado of ['no_activa', 'cancelada']) {
    r = await llamar(como(admin, 'admin', pelado.id, { estado, dias: 0 }));
    assert.equal(r.status, 200, `un ${estado} con dias basura se rechazo: ${JSON.stringify(r.body)}`);
  }
  assert.equal(await paidDe(pelado.id), 0, 'el corte con dias basura no cerro el acceso');
  r = await llamar(como(admin, 'admin', pelado.id, { estado: 'activa', dias: 30 }));
  assert.equal(r.status, 200);

  // 5. EL CASO QUE MOTIVA LA FUENTE DE BLOQUEO.
  //    Cortar a alguien con un cobro vivo tiene que cerrarle el acceso. Con la
  //    derivacion por OR anterior, la fila del cobro seguia concediendo y el
  //    corte no se notaba en ninguna parte.
  await cobroVivo(comprador.id, 30);
  assert.equal(await paidDe(comprador.id), 1, 'el cobro de prueba no concedio nada');
  r = await llamar(como(admin, 'admin', comprador.id, { estado: 'cancelada' }));
  assert.equal(r.status, 200, `no se pudo cancelar: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.suscripcion.estado, 'cancelada');
  assert.equal(await paidDe(comprador.id), 0, 'se cancelo y el cobro vivo siguio abriendo el curso');

  // 6. y el barrido horario no se lo devuelve: solo cierra, nunca concede
  await write('auth.entitlement_sweep', {});
  assert.equal(await paidDe(comprador.id), 0, 'el barrido reabrio una cuenta cortada');

  // 7. «no activa» retira la concesion a mano, no el cobro: el cobro manda otra vez
  r = await llamar(como(admin, 'admin', comprador.id, { estado: 'no_activa' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.suscripcion.estado, 'activa',
    'el corte se levanto y el cobro vivo tenia que volver a conceder');
  assert.equal(r.body.suscripcion.aMano, false, 'ese acceso viene del cobro, no de un admin');
  assert.equal(await paidDe(comprador.id), 1);

  // 8. cancelar y volver a activar: el bloqueo se levanta, no se queda pegado
  r = await llamar(como(admin, 'admin', pelado.id, { estado: 'cancelada' }));
  assert.equal(await paidDe(pelado.id), 0);
  r = await llamar(como(admin, 'admin', pelado.id, { estado: 'activa', dias: 30 }));
  assert.equal(r.status, 200);
  assert.equal(await paidDe(pelado.id), 1, 'el bloqueo anterior se quedo puesto');

  // 9. un estudiante no reparte acceso
  r = await llamar(como(intruso, 'student', pelado.id, { estado: 'activa' }));
  assert.equal(r.status, 403, 'un estudiante se activo el curso solo');
  assert.equal(await paidDe(intruso.id), 0);

  // 10. una cuenta que no existe
  r = await llamar(como(admin, 'admin', 99_999_999, { estado: 'activa' }));
  assert.equal(r.status, 404);

  // 11. LA CONCESION CADUCA. Se envejece la fila a mano -- la ruta no acepta
  //     fechas pasadas a proposito -- y se pasa el barrido, que es lo que corre
  //     cada hora en produccion.
  await run(`UPDATE entitlement_events SET period_end = now() - interval '1 day'
             WHERE user_id = ? AND source = 'admin'`, [pelado.id]);
  await write('auth.entitlement_sweep', {});
  assert.equal(await paidDe(pelado.id), 0, 'una concesion a mano vencida siguio abriendo el curso');

  console.log('admin-subscription: 12 casos verdes');
} finally {
  for (const u of [admin, pelado, comprador, intruso]) {
    await run('DELETE FROM users WHERE id = ?', [u.id]);
  }
  await pool.end();
}
