import assert from 'node:assert/strict';
import test from 'node:test';
import { Store } from '../../src/db.ts';

const dsn = process.env.PAYMENTS_TEST_DATABASE_URL;

if (!dsn) {
  console.error('payments/test/db/store.test.ts: SKIPPED (PAYMENTS_TEST_DATABASE_URL unset). Unproved: migrate() twice is a no-op; concurrent consumeOrder admits one winner; orphan approved payment lands dead with last_error starting orphan_payment:; one buyer retrying does not exhaust a capped coupon; quoteCoupon and reserveCoupon agree on the cap, and a refusal names which gate it was.');
} else {
  const store = new Store(dsn);

  test('migrate() called twice is a no-op', async () => {
    await store.migrate();
    await store.migrate();
  });

  /**
   * La regresion: un comprador que reintenta se agotaba su propio cupon.
   *
   * reserveCoupon insertaba una fila `reserved` por intento, todas del mismo
   * usuario, y cada una gastaba un cupo. Con tope 3, al cuarto clic en
   * «Pagar» su propio cupon respondia «no valido» -- y seguia asi 30 minutos,
   * hasta que la barrida soltaba las reservas.
   */
  test('one buyer retrying does not exhaust a capped coupon', async () => {
    await store.migrate();
    const code = `RETRY${Date.now()}`;
    const creado = await store.createCoupon(code, 50, 3, 7);
    assert.ok(creado, 'the coupon must be created');
    const userId = 900_000 + (Date.now() % 1000);

    const uno = await store.reserveCoupon(code, userId);
    assert.ok(uno, 'first reservation');
    const dos = await store.reserveCoupon(code, userId);
    assert.ok(dos, 'a retry by the same buyer must still reserve');
    assert.equal(dos.id, uno.id, 'and it must REUSE the same reservation, not open a second');

    // El cupo real: tres intentos del mismo comprador ocupan UNO, no tres.
    const tres = await store.reserveCoupon(code, userId);
    assert.ok(tres, 'a third retry still works');
    assert.equal(tres.id, uno.id);

    // Y quedan dos cupos para OTRAS personas.
    const otro = await store.reserveCoupon(code, userId + 1);
    assert.ok(otro, 'a different buyer still fits');
    assert.notEqual(otro.id, uno.id);
  });

  /**
   * Cotizar y reservar tienen que decir lo mismo. Si cotizar cuenta el cupo de
   * otra forma, el boton «Aplicar» dice «cupon no valido» sobre un cupon que
   * el cobro habria aceptado -- o al reves, promete un descuento que al pagar
   * se cae.
   */
  test('quoteCoupon and reserveCoupon agree on the cap, and a refusal names the gate', async () => {
    await store.migrate();
    const code = `QUOTE${Date.now()}`;
    assert.ok(await store.createCoupon(code, 95, 2, 7));
    const userId = 910_000 + (Date.now() % 1000);

    const antes = await store.quoteCoupon(code, userId);
    assert.ok(antes.ok, 'a fresh coupon quotes');
    assert.equal(antes.offer.percent, 95);

    // La reserva PROPIA no puede hacer que el cupon se vea agotado para uno mismo.
    assert.ok(await store.reserveCoupon(code, userId));
    const despues = await store.quoteCoupon(code, userId);
    assert.ok(despues.ok, 'my own live reservation must not make the coupon look used up to me');
    assert.equal(despues.offer.totalMinor, antes.offer.totalMinor);

    // Un cupon revocado no se cotiza, igual que no se reserva, Y DICE POR QUE.
    await store.setCouponActive(code, false);
    const revocado = await store.quoteCoupon(code, userId);
    assert.equal(revocado.ok, false);
    assert.equal(revocado.ok === false && revocado.reason, 'revocado');
    assert.equal(await store.reserveCoupon(code, userId + 1), null);

    // Un codigo que no existe no se confunde con uno revocado: es la
    // distincion que costo tres rondas de «no me sirve el cupon».
    const fantasma = await store.quoteCoupon('NOEXISTE' + Date.now(), userId);
    assert.equal(fantasma.ok, false);
    assert.equal(fantasma.ok === false && fantasma.reason, 'no_existe');
  });

  test('two concurrent consumeOrder calls on the same order admit exactly one winner', async () => {
    await store.migrate();
    const orderKey = `race-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await store.createOrder({
      orderKey, userId: 1, mode: 'one_time', expectedMinor: 39_900, currency: 'COP',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const [a, b] = await Promise.all([
      store.consumeOrder(orderKey, 'pay-a'),
      store.consumeOrder(orderKey, 'pay-b'),
    ]);
    assert.equal([a, b].filter(Boolean).length, 1, 'exactly one consumeOrder must win');
    const row = await store.order(orderKey);
    assert.ok(row?.consumedBy === 'pay-a' || row?.consumedBy === 'pay-b');
    assert.equal(await store.consumeOrder(orderKey, row!.consumedBy!), true, 'same payment id re-delivered still wins');
  });

  test('an orphan approved payment lands dead exactly once with last_error starting orphan_payment:', async () => {
    await store.migrate();
    const providerId = `orphan-${Date.now()}`;
    await store.upsertPayment({
      providerId, userId: null, status: 'approved', amount: 39_900, currency: 'COP',
      raw: { id: providerId, status: 'approved' }, eligible: false, ineligibleReason: 'no_user', liveMode: true,
    });
    const key = `evt-${providerId}`;
    assert.equal(await store.recordEvent(key, providerId, 'payment'), true);
    const taken = await store.takeEvent();
    assert.ok(taken);
    assert.equal(taken.providerId, providerId);
    await store.failEvent(taken.id, 8, 'orphan_payment:' + providerId);
    const counts = await store.queueCounts();
    assert.ok(counts.dead >= 1);
    assert.ok(counts.orphanedApproved >= 1);
    const again = await store.pool.query(
      `SELECT state, last_error FROM payment_webhook_events WHERE id=$1`, [taken.id]);
    assert.equal(again.rows[0].state, 'dead');
    assert.match(String(again.rows[0].last_error), /^orphan_payment:/);
    await store.failEvent(taken.id, 8, 'orphan_payment:' + providerId);
    const still = await store.pool.query(
      `SELECT COUNT(*)::int AS n FROM payment_webhook_events WHERE provider_id=$1 AND state='dead'`, [providerId]);
    assert.equal(Number(still.rows[0].n), 1);
  });

  test.after(async () => { await store.close(); });
}
