import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { assessPayment } from './assess.ts';
import type { OrderFacts, PaymentFacts } from './assess.ts';
import { loadConfig } from './config.ts';
import { Store } from './db.ts';
import { MercadoPago, MercadoPagoError } from './mercadopago.ts';
import { MetaConversions, MetaError, purchaseEvent, sanitizeContext } from './meta.ts';
import { CURRENCY, PRICE_MINOR } from './price.ts';
import { diffPayments } from './reconcile.ts';
import { serviceAuthorized, verifyMercadoPagoSignature } from './security.ts';
import { classifyWebhook } from './webhook.ts';

const config = loadConfig();
const store = new Store(config.databaseUrl);
const provider = new MercadoPago(config);
// null = not configured. Purchases still grant access; they just never reach Meta.
const meta = config.metaPixelId && config.metaCapiToken
  ? new MetaConversions(config.metaPixelId, config.metaCapiToken, config.metaTestEventCode)
  : null;
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

const authorized = (request: { headers: Record<string, unknown> }): boolean =>
  serviceAuthorized(request.headers.authorization, config.serviceSecret);

const assessEnv = { production: config.production, priceMinor: PRICE_MINOR, currency: CURRENCY };

/**
 * La concesion rechazada, con su codigo separado del mensaje.
 *
 * Antes sendEntitlement lanzaba un `Error` con el cuerpo del api concatenado, la
 * ruta lo relanzaba y Fastify lo servia como 500 con el detalle dentro: el
 * navegador recibia literalmente `entitlement callback 400: {"code":"refused",
 * "message":"data refused auth.entitlement_..."}`. Ni el codigo era nuestro ni
 * ese detalle es del publico.
 */
export class EntitlementError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`entitlement callback ${status}`);
    this.name = 'EntitlementError';
    this.status = status;
    this.body = body;
  }
}

async function sendEntitlement(userId: number, source: string, externalId: string, deliveryId: number): Promise<void> {
  // The state of THIS grant, never the user's whole access. The api keeps the latest
  // state per (source, externalId) and ORs them. Reporting the aggregate under one
  // key left a cancelled subscription's key saying "active until <the charge's end>",
  // which outlived the refund of that charge: paid stayed 1 with nothing paid for.
  const kind = source === 'mercadopago.subscription' ? 'subscription' : 'payment';
  const { active, periodEnd } = await store.entitlementStateFor(userId, kind, externalId);
  // Stable across retries of this delivery, distinct across real state changes.
  const eventKey = `${source}:${externalId}:${deliveryId}:${active}`;
  // periodEnd is what lets the api EXPIRE the access (its lapse sweep only touches rows
  // with a date). Before it travelled, every grant landed as period_end NULL = forever.
  const response = await fetch(config.entitlementsUrl, {
    method: 'POST', headers: { authorization: `Bearer ${config.entitlementsSecret}`, 'content-type': 'application/json' },
    body: JSON.stringify({ eventKey, userId, active, source, externalId, occurredAt: new Date().toISOString(),
      ...(periodEnd ? { periodEnd } : {}) }),
  });
  if (!response.ok) throw new EntitlementError(response.status, (await response.text()).slice(0, 300));
  await store.markDelivered(eventKey, userId, active);
}

const userIdFrom = (resource: Record<string, unknown>): number | null => {
  const metadata = resource.metadata as Record<string, unknown> | undefined;
  const candidate = metadata?.user_id ?? resource.external_reference;
  const value = Number(candidate);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

const orderKeyFrom = (resource: Record<string, unknown>): string | null => {
  const metadata = resource.metadata as Record<string, unknown> | undefined;
  const fromMeta = metadata?.order_key;
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta;
  return null;
};

function paymentFacts(item: Record<string, unknown>, fallbackId: string): PaymentFacts {
  return {
    id: String(item.id ?? fallbackId),
    status: String(item.status ?? 'unknown'),
    amountMinor: Number(item.transaction_amount ?? 0),
    refundedMinor: Number(item.transaction_amount_refunded ?? 0),
    currency: String(item.currency_id ?? CURRENCY),
    liveMode: item.live_mode === true,
    dateCreated: new Date(String(item.date_created ?? 0)),
    dateApproved: item.date_approved ? new Date(String(item.date_approved)) : null,
    userIdHint: userIdFrom(item),
    orderKey: orderKeyFrom(item),
  };
}

/**
 * Shared payment path: webhook `payment` and the nested charge inside
 * `subscription_authorized_payment` both land here. Eligibility is decided
 * before any grant; an orphan (approved, no user) goes `dead` immediately —
 * retries cannot invent a user_id.
 */
async function processPaymentItem(event: { id: number; providerId: string }, item: Record<string, unknown>,
  orderOverride: OrderFacts | null | undefined): Promise<'orphan' | 'ok'> {
  const facts = paymentFacts(item, event.providerId);
  const paymentId = facts.id;
  const order = orderOverride !== undefined
    ? orderOverride
    : (facts.orderKey ? await store.order(facts.orderKey) : null);
  let verdict = assessPayment(facts, order, assessEnv);
  let eligible = verdict.eligible;
  let reason = verdict.reason;
  const userId = verdict.userId;

  await store.upsertPayment({
    providerId: paymentId, userId, status: facts.status, amount: facts.amountMinor,
    currency: facts.currency, raw: item, eligible, ineligibleReason: reason,
    orderKey: facts.orderKey ?? order?.orderKey ?? null, liveMode: facts.liveMode,
  });

  if (facts.status === 'approved' && eligible && order?.singleUse && order.orderKey) {
    const won = await store.consumeOrder(order.orderKey, paymentId);
    if (!won) {
      eligible = false;
      reason = 'order_consumed';
      await store.upsertPayment({
        providerId: paymentId, userId, status: facts.status, amount: facts.amountMinor,
        currency: facts.currency, raw: item, eligible: false, ineligibleReason: 'order_consumed',
        orderKey: order.orderKey, liveMode: facts.liveMode,
      });
    }
  }

  if (facts.status === 'approved' && userId === null) {
    await store.failEvent(event.id, 8, 'orphan_payment:' + paymentId);
    return 'orphan';
  }

  const metadata = item.metadata as Record<string, unknown> | undefined;
  const redemptionId = Number(metadata?.coupon_redemption_id);
  if (facts.status === 'approved' && eligible && Number.isSafeInteger(redemptionId) && redemptionId > 0) {
    await store.redeemCouponReservation(redemptionId, paymentId);
  }

  if (userId && eligible) await sendEntitlement(userId, 'mercadopago.payment', paymentId, event.id);
  if (userId && eligible && facts.status === 'approved' && facts.amountMinor > 0) {
    await queuePurchase(paymentId, userId, item);
  }
  return 'ok';
}

/**
 * Mercado Pago's authorized-payment payload names the nested charge
 * inconsistently (`payment.id` vs top-level `id`). Read whichever is present;
 * crash on neither is how a documentation gap became a dead letter storm.
 */
function paymentIdFromAuthorized(ap: Record<string, unknown>): string | null {
  const nested = ap.payment;
  if (nested && typeof nested === 'object') {
    const id = (nested as { id?: unknown }).id;
    if (id != null && String(id) !== '') return String(id);
  }
  if (typeof nested === 'string' || typeof nested === 'number') return String(nested);
  if (ap.id != null && String(ap.id) !== '') return String(ap.id);
  return null;
}

async function processAuthorizedPayment(event: { id: number; providerId: string }): Promise<'orphan' | 'ok'> {
  const ap = await provider.authorizedPayment(event.providerId);
  const paymentId = paymentIdFromAuthorized(ap);
  if (paymentId == null) {
    app.log.warn({ event, authorized: { keys: Object.keys(ap) } },
      'authorized_payment has neither payment.id nor id; not crashing');
    throw new Error('authorized_payment_missing_payment_id:' + event.providerId);
  }
  const item = await provider.payment(paymentId);
  const preapprovalId = ap.preapproval_id != null ? String(ap.preapproval_id) : '';
  const sub = preapprovalId ? await store.subscriptionByProviderId(preapprovalId) : null;
  const order: OrderFacts | null = sub && sub.userId != null ? {
    orderKey: preapprovalId, userId: sub.userId, expectedMinor: sub.expectedMinor,
    currency: CURRENCY, consumedBy: null, expiresAt: new Date('9999-12-31T00:00:00Z'),
    singleUse: false,
  } : null;
  return processPaymentItem({ id: event.id, providerId: paymentId }, item, order);
}

async function processOne(): Promise<boolean> {
  const event = await store.takeEvent();
  if (!event) return false;
  try {
    if (event.resourceType === 'authorized_payment') {
      const outcome = await processAuthorizedPayment(event);
      if (outcome === 'orphan') return true;
    } else if (event.resourceType.includes('subscription') || event.resourceType.includes('preapproval')) {
      const item = await provider.subscription(event.providerId);
      let userId = userIdFrom(item);
      if (userId == null) {
        const ref = String(item.external_reference ?? '');
        const order = ref ? await store.order(ref) : null;
        userId = order?.userId ?? null;
      }
      await store.upsertSubscription({ providerId: event.providerId, userId,
        status: String(item.status ?? 'unknown'),
        periodEnd: typeof item.next_payment_date === 'string' ? item.next_payment_date : null, raw: item });
      if (userId) await sendEntitlement(userId, 'mercadopago.subscription', event.providerId, event.id);
    } else {
      const item = await provider.payment(event.providerId);
      const outcome = await processPaymentItem(event, item, undefined);
      if (outcome === 'orphan') return true;
    }
    await store.finishEvent(event.id);
  } catch (error) {
    app.log.error({ error, event }, 'payment event failed');
    await store.failEvent(event.id, event.attempts, error);
  }
  return true;
}

/**
 * Queues the Purchase for Meta. Queues, does not send: the payment event has to
 * finish whether or not Meta answers, and a Meta outage must never re-run the
 * entitlement path through failEvent. Delivery has its own outbox loop below.
 * Same event_id as the thank-you page (`mp:<payment id>`), so Meta counts one
 * sale even when both arrive.
 */
async function queuePurchase(providerId: string, userId: number, item: Record<string, unknown>): Promise<void> {
  if (!meta) return;
  const saved = await store.checkoutContext(userId);
  if (saved?.context.noAds) {
    app.log.info({ userId, providerId }, 'meta purchase skipped: no_ads');
    return;
  }
  const payer = item.payer as { email?: unknown } | undefined;
  const email = saved?.email ?? (typeof payer?.email === 'string' ? payer.email : null);
  const event = purchaseEvent({ providerId, userId, email,
    eventTime: Date.parse(String(item.date_approved ?? '')) / 1000,
    amount: Number(item.transaction_amount), currency: String(item.currency_id ?? CURRENCY),
    context: saved?.context ?? null, fallbackUrl: `${config.publicOrigin}/pago` });
  const queued = await store.queueMetaEvent({ eventId: event.event_id, eventName: event.event_name, userId, providerId, payload: event });
  if (queued) app.log.info({ eventId: event.event_id, userId, matched: Boolean(saved) }, 'meta purchase queued');
}

async function deliverMetaOne(): Promise<boolean> {
  if (!meta) return false;
  const pending = await store.takeMetaEvent();
  if (!pending) return false;
  try {
    const receipt = await meta.send([pending.payload]);
    await store.metaSent(pending.eventId, receipt.fbtraceId);
    app.log.info({ eventId: pending.eventId, fbtraceId: receipt.fbtraceId }, 'meta purchase delivered');
  } catch (error) {
    const detail = error instanceof MetaError ? { status: error.status, body: error.body } : { error: String(error) };
    app.log.error({ eventId: pending.eventId, attempts: pending.attempts, ...detail }, 'meta conversions api rejected event');
    await store.metaFailed(pending.eventId, pending.attempts, error instanceof MetaError ? `${error.status} ${error.body}` : error);
  }
  return true;
}

async function healthBody(): Promise<Record<string, unknown>> {
  const queue = await store.queueCounts();
  // `ok` is process liveness. Checkout needs a token: without it /v1/checkout
  // already answers 501 provider_not_configured (same sentinel as the webhook
  // secret). Surface that here so /api/payments/estado does not tell /pago
  // that a payment can be created when it cannot.
  const provider = config.mpAccessToken ? 'configured' : 'not_configured';
  return {
    ok: true, compiler: 'tsgo', service: 'payments',
    provider,
    // La clave PUBLICA de Mercado Pago. Va aqui porque /pago tiene que montar el
    // Payment Brick ANTES de que el comprador pulse nada, y hasta ahora la unica
    // forma de conseguirla era crear una preferencia -- es decir, al reves.
    // Es publica por diseno: viaja al navegador de todos modos, solo sirve para
    // tokenizar una tarjeta contra esta cuenta y no autoriza ningun cobro. La
    // que cobra es MP_ACCESS_TOKEN y esa no sale de este proceso.
    publicKey: config.mpPublicKey ?? null,
    meta: meta ? 'enabled' : 'disabled',
    mode: config.production ? 'live' : (config.mpAccessToken ? 'test' : 'off'),
    queue,
    alerts: {
      deadEvents: queue.dead,
      stalePendingOver15m: queue.pendingOver15m,
      orphanedApproved: queue.orphanedApproved,
    },
  };
}

/**
 * Compare Mercado Pago's last 24 h of updates with what we stored, and
 * re-enqueue the ids that drifted. 24 h matches the preference expiry; older
 * misses surface via /health.orphanedApproved for a human, not a blind replay.
 */
async function reconcileOnce(): Promise<string[]> {
  const end = new Date();
  const begin = new Date(end.getTime() - 86_400_000);
  const beginIso = begin.toISOString();
  const endIso = end.toISOString();
  const remote = await provider.searchPayments(beginIso, endIso);
  const local = await store.localPaymentsSince(beginIso);
  const flagged = diffPayments(remote, local);
  for (const id of flagged) {
    const inserted = await store.recordEvent('reconcile:' + id + ':' + Date.now(), id, 'payment');
    if (inserted) setImmediate(() => { void processOne(); });
  }
  return flagged;
}

app.get('/health', async () => healthBody());

/**
 * Cuanto queda a pagar con un cupon, SIN reservarlo ni cobrar nada.
 *
 * Existe porque el boton «Aplicar» de /pago mentia: pintaba «Cupon listo para
 * redimir» en verde para cualquier texto, sin preguntarle al servidor. El
 * comprador escribia un codigo invalido, veia verde, metia la tarjeta y solo
 * al final se enteraba -- o peor, pagaba el precio entero creyendo el descuento
 * aplicado.
 *
 * No reserva a proposito (ver Store.quoteCoupon): cotizar no gasta cupo.
 */
app.post<{ Body: { userId?: unknown; couponCode?: unknown } }>('/v1/coupons/quote',
  async (request, reply) => {
  if (!authorized(request)) return reply.code(401).send({ error: 'unauthorized' });
  const userId = Number(request.body?.userId);
  if (!Number.isSafeInteger(userId) || userId < 1) return reply.code(400).send({ error: 'invalid_actor' });
  const code = typeof request.body?.couponCode === 'string' ? request.body.couponCode : '';
  if (code.trim() === '') return reply.code(400).send({ error: 'missing_coupon' });
  const offer = await store.quoteCoupon(code, userId);
  if (!offer) return reply.code(422).send({ error: 'invalid_coupon' });
  return { code: offer.code, discountPercent: offer.percent,
    discountMinor: offer.discountMinor, totalMinor: offer.totalMinor, currency: CURRENCY };
});

app.post<{ Body: { userId?: unknown; email?: unknown; mode?: unknown; couponCode?: unknown;
  context?: unknown; termsVersion?: unknown } }>('/v1/checkout', async (request, reply) => {
  if (!authorized(request)) return reply.code(401).send({ error: 'unauthorized' });
  const userId = Number(request.body?.userId);
  const email = String(request.body?.email ?? '').trim().toLowerCase();
  const mode = request.body?.mode === 'subscription' ? 'subscription' : 'one_time';
  const couponCode = typeof request.body?.couponCode === 'string' ? request.body.couponCode : '';
  if (!Number.isSafeInteger(userId) || userId < 1 || !email.includes('@')) {
    return reply.code(400).send({ error: 'invalid_actor' });
  }
  // Terms first, before any write: a checkout that reserved a coupon and then
  // bounced on terms would burn a redemption slot the buyer never agreed to.
  const termsVersion = request.body?.termsVersion;
  if (typeof termsVersion !== 'string' || termsVersion.length < 1 || termsVersion.length > 32) {
    return reply.code(400).send({ error: 'terms_required' });
  }
  // Cupón en suscripción: SÍ aplica desde 2026-09-07 (antes bloqueado a
  // propósito con coupon_not_applicable). totalMinor descontado llega igual a
  // MercadoPago.checkout -> auto_recurring.transaction_amount
  // (mercadopago.ts:83-94), así que el cobro RECURRENTE queda al precio del
  // cupón cada mes, no solo el primero -- eso es lo que pidió el dueño.
  // One live preapproval per account. /pago renders the full checkout for a paying
  // user too, so without this a subscriber who toggled renewal again created a
  // second preapproval: two monthly charges, and /perfil can only cancel one.
  if (mode === 'subscription') {
    const current = await store.subscription(userId) as { status?: string } | null;
    if (current?.status === 'authorized') return reply.code(409).send({ error: 'already_subscribed' });
  }
  // Browser facts the api forwarded (cookies, IP, UA, utm). Validated here, kept
  // for the Purchase event the webhook will send later. Not a reason to refuse
  // a checkout: an empty context only lowers Meta's match quality.
  await store.saveCheckoutContext(userId, email, sanitizeContext(request.body?.context), { version: termsVersion });
  const reservation = couponCode ? await store.reserveCoupon(couponCode, userId) : null;
  if (couponCode && !reservation) return reply.code(422).send({ error: 'invalid_coupon' });
  const orderKey = randomUUID();
  const expiresAt = new Date(Date.now() + 86_400_000);
  const expectedMinor = reservation ? reservation.offer.totalMinor : PRICE_MINOR;
  try {
    await store.createOrder({ orderKey, userId, mode, expectedMinor, currency: CURRENCY,
      couponRedemptionId: reservation?.id, expiresAt });
    if (reservation?.offer.totalMinor === 0) {
      // EL ORDEN ES EL ARREGLO, no un detalle de estilo.
      //
      // Antes esto marcaba la redencion como `redeemed` ANTES de llamar a
      // sendEntitlement. Si la concesion fallaba -- el servicio de datos caido, un
      // 400 del api -- la ruta respondia 500 y la fila se quedaba en `redeemed`
      // para siempre: releaseCoupon solo toca `state='reserved'` (db.ts), y el
      // indice unico coupon_user_redeemed impide que ese usuario lo reintente. El
      // cupon quedaba quemado, un cupo de los 25 consumido, el usuario sin acceso,
      // y la unica salida era editar Postgres a mano. Medido: user 4001 / ALXN100
      // / state=redeemed / respuesta 500 / sin derecho concedido.
      //
      // Ahora lo irreversible va ultimo. Si la concesion falla, la fila sigue
      // `reserved`, el catch la libera y el reintento funciona.
      //
      // providerId DETERMINISTA, no `coupon:${reservation.id}`: la reserva cambia
      // de id en cada reintento, asi que aquel formato dejaba un pago aprobado
      // nuevo por intento fallido. upsertPayment tiene la clave en providerId, asi
      // que con este el reintento reescribe la misma fila.
      const providerId = `coupon:${reservation.offer.code}:${userId}`;
      await store.attachOrderRef(orderKey, providerId);
      await store.consumeOrder(orderKey, providerId);
      await store.upsertPayment({ providerId, userId, status: 'approved', amount: 0,
        currency: CURRENCY, raw: { source: 'coupon', coupon: reservation.offer.code, order_key: orderKey },
        eligible: true, ineligibleReason: null, orderKey, liveMode: config.production });
      await sendEntitlement(userId, 'coupon', providerId, reservation.id);
      await store.redeemCouponReservation(reservation.id, providerId);
      return { mode, coupon: reservation.offer.code, discountPercent: reservation.offer.percent,
        discountMinor: reservation.offer.discountMinor, totalMinor: 0, granted: true, orderKey };
    }
    if (!config.mpAccessToken) {
      if (reservation) await store.releaseCoupon(reservation.id);
      return reply.code(501).send({ error: 'provider_not_configured' });
    }
    const result = await provider.checkout({ userId, email }, mode, orderKey, reservation ? {
      totalMinor: reservation.offer.totalMinor, couponRedemptionId: reservation.id,
    } : undefined);
    const providerId = String(result.preferenceId ?? result.subscriptionId ?? '');
    if (providerId) await store.attachOrderRef(orderKey, providerId);
    if (reservation && providerId) await store.attachCoupon(reservation.id, providerId);
    return { ...result, orderKey, ...(reservation ? { discountPercent: reservation.offer.percent,
      discountMinor: reservation.offer.discountMinor, totalMinor: reservation.offer.totalMinor } : {}) };
  } catch (error) {
    if (reservation) await store.releaseCoupon(reservation.id);
    // Un 4xx de Mercado Pago no es un fallo nuestro de 500: es el proveedor
    // rechazando el cobro (cuenta en otra moneda, monto por debajo del minimo,
    // token sin permiso). El detalle va al log, al cliente va un codigo.
    if (error instanceof MercadoPagoError) {
      app.log.error({ status: error.status, body: error.body, sent: error.sent, userId, mode },
        'mercadopago rejected checkout');
      return reply.code(502).send({ error: 'provider_rejected' });
    }
    // La concesion la rechazo el api, no nosotros. La reserva ya quedo liberada
    // arriba, asi que el cupon vuelve a estar disponible y el reintento sirve:
    // por eso el codigo dice que se puede repetir y no «error interno».
    if (error instanceof EntitlementError) {
      app.log.error({ status: error.status, body: error.body, userId, mode },
        'entitlement callback refused the grant');
      return reply.code(502).send({ error: 'grant_failed' });
    }
    throw error;
  }
});

/**
 * Cobro con tarjeta SIN salir de la pagina. El Payment Brick tokeniza la tarjeta
 * dentro del iframe de Mercado Pago y manda aqui un token de un solo uso: el
 * numero de la tarjeta no pasa por este proceso ni por el api ni por el web.
 *
 * ESTA RUTA NO CONCEDE ACCESO, a proposito. Mercado Pago emite webhook tambien
 * para un pago directo, con el mismo `external_reference` y el mismo
 * `metadata.user_id`, asi que `processPaymentItem` lo recoge por el camino de
 * siempre. Duplicar la concesion aqui daria DOS sitios donde decidir si un pago
 * da derecho, y el dia que uno cambie el otro miente. Lo que devuelve esta ruta
 * es solo lo que hace falta para que la pagina reaccione en el momento.
 *
 * El desfase entre «aprobado» y «acceso concedido» no es nuevo: el flujo de
 * redireccion ya tiene exactamente el mismo, porque MP devuelve al comprador
 * mas o menos cuando dispara el webhook.
 */
app.post<{ Body: { userId?: unknown; email?: unknown; termsVersion?: unknown;
  couponCode?: unknown; context?: unknown; card?: Record<string, unknown> } }>('/v1/checkout/card',
  async (request, reply) => {
  if (!authorized(request)) return reply.code(401).send({ error: 'unauthorized' });
  const userId = Number(request.body?.userId);
  const email = String(request.body?.email ?? '').trim().toLowerCase();
  if (!Number.isSafeInteger(userId) || userId < 1 || !email.includes('@')) {
    return reply.code(400).send({ error: 'invalid_actor' });
  }
  const termsVersion = request.body?.termsVersion;
  if (typeof termsVersion !== 'string' || termsVersion.length < 1 || termsVersion.length > 32) {
    return reply.code(400).send({ error: 'terms_required' });
  }
  const couponCode = typeof request.body?.couponCode === 'string' ? request.body.couponCode : '';
  if (!config.mpAccessToken) return reply.code(501).send({ error: 'provider_not_configured' });

  const card = request.body?.card ?? {};
  const token = typeof card.token === 'string' ? card.token.trim() : '';
  const paymentMethodId = typeof card.paymentMethodId === 'string' ? card.paymentMethodId.trim() : '';
  const installments = Number(card.installments);
  if (!token || token.length > 128 || !paymentMethodId || paymentMethodId.length > 64) {
    return reply.code(400).send({ error: 'invalid_card_payload' });
  }
  // 1..36: el maximo que ofrece MP Colombia. Sin techo, un `installments`
  // absurdo se lo come el proveedor y devuelve un 400 que aqui seria un 502.
  if (!Number.isSafeInteger(installments) || installments < 1 || installments > 36) {
    return reply.code(400).send({ error: 'invalid_card_payload' });
  }
  const issuerId = typeof card.issuerId === 'string' && card.issuerId.trim() !== ''
    ? card.issuerId.trim() : undefined;
  const ident = card.identification as { type?: unknown; number?: unknown } | undefined;
  const identification = ident && typeof ident.type === 'string' && typeof ident.number === 'string'
    && ident.type.length <= 16 && ident.number.length <= 32
    ? { type: ident.type, number: ident.number } : undefined;

  await store.saveCheckoutContext(userId, email, sanitizeContext(request.body?.context), { version: termsVersion });

  // EL ORDEN IMPORTA, igual que en /v1/checkout: la validacion de la tarjeta y
  // la de los terminos ya pasaron, asi que reservar aqui no quema un cupo por
  // un formulario a medio llenar. A partir de esta linea TODA rama de salida
  // tiene que liberar la reserva -- por eso el try envuelve desde aqui.
  const reservation = couponCode ? await store.reserveCoupon(couponCode, userId) : null;
  if (couponCode && !reservation) return reply.code(422).send({ error: 'invalid_coupon' });
  const orderKey = randomUUID();

  try {
    await store.createOrder({ orderKey, userId, mode: 'one_time',
      expectedMinor: reservation ? reservation.offer.totalMinor : PRICE_MINOR,
      currency: CURRENCY, couponRedemptionId: reservation?.id,
      expiresAt: new Date(Date.now() + 86_400_000) });
    // Un cupon del 100% no deja nada que cobrar y Mercado Pago rechaza un
    // transaction_amount de 0. Ese caso ya lo resuelve /v1/checkout, que
    // concede el acceso sin proveedor; aqui se manda alli en vez de gastar un
    // token de tarjeta contra un 400 seguro.
    if (reservation?.offer.totalMinor === 0) {
      await store.releaseCoupon(reservation.id);
      return reply.code(422).send({ error: 'cupon_cubre_el_total' });
    }
    // El email del pagador sale del actor que el api ya autentico, NO del cuerpo
    // que manda el navegador: si viniera del cliente, el recibo de Mercado Pago
    // se podria emitir a nombre de otra persona.
    const result = await provider.cardPayment({ userId, email }, orderKey, {
      token, paymentMethodId, issuerId, installments, payerEmail: email, identification,
    }, reservation ? { totalMinor: reservation.offer.totalMinor,
      couponRedemptionId: reservation.id } : undefined);
    const paymentId = String(result.id ?? '');
    const status = String(result.status ?? '');
    if (paymentId) await store.attachOrderRef(orderKey, paymentId);
    // La redencion la cierra el webhook (processPaymentItem), igual que en la
    // redireccion: aqui solo se ata la reserva al id del pago para que la
    // encuentre. Si MP RECHAZO la tarjeta no hay nada que atar y la reserva se
    // libera -- un rechazo no puede gastar el cupon del comprador.
    if (reservation) {
      if (paymentId && status !== 'rejected') await store.attachCoupon(reservation.id, paymentId);
      else await store.releaseCoupon(reservation.id);
    }
    // `status_detail` es de Mercado Pago y es lo unico que distingue «fondos
    // insuficientes» de «codigo de seguridad mal». La UI lo traduce; aqui viaja
    // crudo porque inventarle un codigo propio a cada motivo del proveedor es
    // una tabla que se queda vieja sola.
    return { status, paymentId, detail: String(result.status_detail ?? ''), orderKey };
  } catch (error) {
    if (reservation) await store.releaseCoupon(reservation.id);
    if (error instanceof MercadoPagoError) {
      app.log.error({ status: error.status, body: error.body, sent: error.sent, userId },
        'mercadopago rejected card payment');
      return reply.code(502).send({ error: 'provider_rejected' });
    }
    throw error;
  }
});

app.post<{ Body: { data?: { id?: unknown }; type?: unknown; action?: unknown };
  Querystring: Record<string, string> }>('/v1/webhooks/mercadopago', async (request, reply) => {
  const dataId = String(request.query?.['data.id'] ?? request.body?.data?.id ?? '');
  if (!config.mpWebhookSecret) return reply.code(501).send({ error: 'provider_not_configured' });
  if (!dataId) return reply.code(400).send({ error: 'missing_data_id' });
  const checked = verifyMercadoPagoSignature({ dataId,
    requestId: String(request.headers['x-request-id'] ?? ''),
    signature: String(request.headers['x-signature'] ?? ''), secret: config.mpWebhookSecret,
    windowSeconds: config.webhookWindowSeconds });
  if (!checked.ok) return reply.code(401).send({ error: checked.reason === 'expired' ? 'expired_signature' : 'invalid_signature' });
  const kind = classifyWebhook(String(request.body?.type ?? request.query?.type ?? request.query?.topic ?? ''), dataId);
  if (kind === 'ignore') return reply.code(202).send({ ok: true, ignored: true });
  const resourceType = kind === 'authorized_payment' ? 'authorized_payment'
    : kind === 'subscription' ? 'subscription' : 'payment';
  const inserted = await store.recordEvent(checked.eventKey, dataId, resourceType);
  setImmediate(() => { void processOne(); });
  return reply.code(202).send({ ok: true, accepted: inserted });
});

app.get<{ Params: { userId: string } }>('/v1/subscriptions/:userId', async (request, reply) => {
  if (!authorized(request)) return reply.code(401).send({ error: 'unauthorized' });
  const userId = Number(request.params.userId);
  if (!Number.isSafeInteger(userId) || userId < 1) return reply.code(400).send({ error: 'invalid_user' });
  // periodEnd: when the current access ends (null = never, a pago-único purchase). /perfil
  // shows it as «se renueva el…» or «vence el…» depending on whether a subscription is live.
  // grantId / grantAmountMinor ride along for the thank-you page.
  return { subscription: await store.subscription(userId), ...(await store.entitlementState(userId)) };
});

app.post<{ Params: { userId: string } }>('/v1/subscriptions/:userId/cancel', async (request, reply) => {
  if (!authorized(request)) return reply.code(401).send({ error: 'unauthorized' });
  const userId = Number(request.params.userId);
  if (!Number.isSafeInteger(userId) || userId < 1) return reply.code(400).send({ error: 'invalid_user' });
  const current = await store.subscription(userId) as { provider_id?: string } | null;
  if (!current?.provider_id) return reply.code(404).send({ error: 'subscription_not_found' });
  const changed = await provider.cancelSubscription(current.provider_id);
  await store.upsertSubscription({ providerId: current.provider_id, userId,
    status: String(changed.status ?? 'cancelled'), periodEnd: null, raw: changed });
  await sendEntitlement(userId, 'mercadopago.subscription', current.provider_id, Date.now());
  return { subscription: await store.subscription(userId), ...(await store.entitlementState(userId)) };
});

app.get('/v1/admin/payments', async (request, reply) => {
  if (!authorized(request)) return reply.code(401).send({ error: 'unauthorized' });
  const queue = await store.queueCounts();
  return { payments: await store.listPayments(), metaEvents: await store.listMetaEvents(), queue,
    alerts: { deadEvents: queue.dead, stalePendingOver15m: queue.pendingOver15m, orphanedApproved: queue.orphanedApproved } };
});

/**
 * Administracion de cupones desde /admin.
 *
 * ESTO NO SUSTITUYE A scripts/coupon.mjs, lo duplica en un sitio mas debil, y
 * hay que saberlo: crear cupones por HTTP significa que la credencial pasa a
 * ser una cookie de sesion de admin en vez del acceso al host. Un XSS en
 * /admin es, a partir de aqui, una fabrica de cupones. El script sigue siendo
 * el camino fuerte y no se borra.
 *
 * Por eso las guardas del script se copian TAL CUAL, no se relajan por ser una
 * pantalla: sin tope no se crea, sin caducidad no se crea, y un 100 % con tope
 * por encima de MAX_LIBRE se rechaza. La omision de un limite leida como
 * «ilimitado» es exactamente el fallo que hizo nacer aquel script.
 */
const MAX_LIBRE = 100;

app.get('/v1/admin/coupons', async (request, reply) => {
  if (!authorized(request)) return reply.code(401).send({ error: 'unauthorized' });
  return { coupons: await store.listCoupons(), priceMinor: PRICE_MINOR, currency: CURRENCY };
});

app.post<{ Body: { code?: unknown; percent?: unknown; max?: unknown; days?: unknown } }>(
  '/v1/admin/coupons', async (request, reply) => {
  if (!authorized(request)) return reply.code(401).send({ error: 'unauthorized' });
  const code = String(request.body?.code ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const percent = Number(request.body?.percent);
  const max = Number(request.body?.max);
  const days = Number(request.body?.days);
  if (!code || code.length > 64) return reply.code(400).send({ error: 'invalid_code' });
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    return reply.code(400).send({ error: 'invalid_percent' });
  }
  // Sin valor por defecto, a proposito: un tope omitido que se lea como
  // «ilimitado» es el fallo original. Falta el dato -> no se crea.
  if (!Number.isInteger(max) || max < 1) return reply.code(400).send({ error: 'max_required' });
  if (!Number.isInteger(days) || days < 1) return reply.code(400).send({ error: 'days_required' });
  if (percent === 100 && max > MAX_LIBRE) {
    return reply.code(400).send({ error: 'free_coupon_cap', max: MAX_LIBRE });
  }
  const created = await store.createCoupon(code, percent, max, days);
  if (!created) return reply.code(409).send({ error: 'coupon_exists' });
  app.log.info({ code: created.code, percent, max, days }, 'coupon created from admin');
  return created;
});

app.post<{ Params: { code: string }; Body: { active?: unknown } }>(
  '/v1/admin/coupons/:code/state', async (request, reply) => {
  if (!authorized(request)) return reply.code(401).send({ error: 'unauthorized' });
  const active = request.body?.active === true;
  const ok = await store.setCouponActive(String(request.params.code ?? ''), active);
  if (!ok) return reply.code(404).send({ error: 'coupon_not_found' });
  app.log.info({ code: request.params.code, active }, 'coupon state changed from admin');
  return { ok: true, active };
});

app.post('/v1/admin/reconcile', async (request, reply) => {
  if (!authorized(request)) return reply.code(401).send({ error: 'unauthorized' });
  if (!config.mpAccessToken) return reply.code(501).send({ error: 'provider_not_configured' });
  const flagged = await reconcileOnce();
  return { ok: true, flagged: flagged.length, ids: flagged };
});

app.post('/v1/admin/redrive', async (request, reply) => {
  if (!authorized(request)) return reply.code(401).send({ error: 'unauthorized' });
  const revived = await store.reviveDeadEvents();
  if (revived) setImmediate(() => { void processOne(); });
  return { ok: true, revived };
});

await store.migrate();
if (!meta) app.log.warn('meta conversions api disabled: META_PIXEL_ID and META_CAPI_TOKEN unset, purchases will not be reported to Meta');
const timer = setInterval(() => { void processOne(); void deliverMetaOne(); }, 1_000);
timer.unref();
const reconcileTimer = config.mpAccessToken
  ? setInterval(() => { void reconcileOnce(); }, 15 * 60 * 1000)
  : null;
reconcileTimer?.unref();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, async () => {
  clearInterval(timer); if (reconcileTimer) clearInterval(reconcileTimer);
  await app.close(); await store.close(); process.exit(0);
});

await app.listen({ host: config.host, port: config.port });
