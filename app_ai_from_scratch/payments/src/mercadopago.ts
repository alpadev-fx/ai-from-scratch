import type { Config } from './config.ts';
import { CURRENCY, PRICE_MINOR, providerAmount } from './price.ts';
import type { RemotePayment } from './reconcile.ts';

export interface CheckoutActor { userId: number; email: string }
export interface CheckoutOffer { totalMinor: number; couponRedemptionId?: number }
export type CheckoutMode = 'one_time' | 'subscription';

/**
 * Lo que el Payment Brick entrega en `onSubmit`, ya validado por la ruta.
 *
 * NO lleva importe. El Brick manda uno y se ignora: el precio lo pone el
 * servidor (ver `cardPayment`). Que este tipo no tenga el campo es
 * deliberado -- asi no se puede colar por descuido.
 */
export interface CardCharge {
  /** Token de un solo uso de la tarjeta. La plataforma nunca ve el numero. */
  token: string;
  paymentMethodId: string;
  issuerId?: string;
  installments: number;
  payerEmail: string;
  identification?: { type: string; number: string };
}

/**
 * Un rechazo de Mercado Pago, con su codigo y su cuerpo separados del mensaje.
 *
 * Antes esto era un `Error` con todo concatenado, la ruta lo relanzaba y
 * Fastify lo servia como 500 con el texto del proveedor dentro: el navegador
 * recibia literalmente `mercadopago 400: {"message":"Cannot pay an amount lower
 * than $ 1600.00"}`. Ni el codigo era nuestro ni ese detalle es del publico.
 */
export class MercadoPagoError extends Error {
  readonly status: number;
  readonly body: string;
  /** Lo que enviamos, para que el rechazo se pueda diagnosticar sin adivinar. */
  readonly sent: string;
  constructor(status: number, body: string, sent = '') {
    super(`mercadopago ${status}`);
    this.name = 'MercadoPagoError';
    this.status = status;
    this.body = body;
    this.sent = sent;
  }
}

/**
 * Mercado Pago preference expiration fields reject the trailing `Z` and want a
 * numeric UTC offset (`+00:00`). `toISOString()` alone produced undated
 * preferences that never expired, which is how a discounted checkout link
 * stayed payable next month.
 */
export function mercadoPagoIso(date: Date): string {
  return date.toISOString().replace(/Z$/, '+00:00');
}

export class MercadoPago {
  // Campo explicito, no parameter property. `node --experimental-strip-types`
  // (el propio script `dev` de este servicio) no compila `constructor(private
  // readonly config: Config)`: aborta con ERR_INVALID_TYPESCRIPT_SYNTAX y el
  // servicio no arranca, asi que el checkout entero quedaba muerto.
  private readonly config: Config;
  constructor(config: Config) { this.config = config; }

  private async request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    if (!this.config.mpAccessToken) throw new Error('MP_ACCESS_TOKEN is not configured');
    const response = await fetch(`https://api.mercadopago.com${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.config.mpAccessToken}`,
        'content-type': 'application/json', ...init.headers },
    });
    if (!response.ok) {
      throw new MercadoPagoError(response.status, (await response.text()).slice(0, 400),
        typeof init.body === 'string' ? init.body.slice(0, 600) : '');
    }
    return await response.json() as Record<string, unknown>;
  }

  /**
   * `orderKey` is the idempotency of this checkout: it is `external_reference`
   * and `metadata.order_key`, so a webhook that lost `user_id` can still find
   * the row in `checkout_orders`. Preferences expire in 24 h; without that a
   * coupon link is a forever-discount.
   */
  async checkout(actor: CheckoutActor, mode: CheckoutMode, orderKey: string, offer?: CheckoutOffer): Promise<Record<string, unknown>> {
    const webhookOrigin = this.config.webhookPublicOrigin;
    const webhook = webhookOrigin.startsWith('https://')
      ? { notification_url: `${webhookOrigin}/api/payments/mercadopago/webhook?source_news=webhooks` }
      : {};
    if (mode === 'subscription') {
      const result = await this.request('/preapproval', { method: 'POST', body: JSON.stringify({
        reason: 'IA desde cero · membresía mensual', external_reference: orderKey,
        payer_email: actor.email,
        back_url: `${this.config.publicOrigin}/pago/gracias`,
        // El importe y la moneda salen de price.ts. Con USD 9.99 este endpoint
        // respondia 400 «Cannot pay an amount lower than $ 1600.00»: MP Colombia
        // tasa el preapproval contra el minimo en COP y no honra el USD, aunque
        // /checkout/preferences si lo acepte. Medido contra la cuenta real.
        auto_recurring: { frequency: 1, frequency_type: 'months',
          transaction_amount: providerAmount(PRICE_MINOR), currency_id: CURRENCY },
        status: 'pending',
        metadata: { user_id: actor.userId, order_key: orderKey },
        ...webhook,
      }) });
      return { mode, subscriptionId: result.id ?? null, initPoint: result.init_point ?? null };
    }
    const now = new Date();
    const result = await this.request('/checkout/preferences', { method: 'POST', body: JSON.stringify({
      items: [{ title: 'IA desde cero · Fundamentos Vol. 1', quantity: 1,
        unit_price: providerAmount(offer?.totalMinor ?? PRICE_MINOR), currency_id: CURRENCY }],
      payer: { email: actor.email }, metadata: { user_id: actor.userId, order_key: orderKey,
        ...(offer?.couponRedemptionId ? { coupon_redemption_id: offer.couponRedemptionId } : {}) },
      external_reference: orderKey,
      expires: true,
      expiration_date_from: mercadoPagoIso(now),
      expiration_date_to: mercadoPagoIso(new Date(now.getTime() + 86_400_000)),
      back_urls: { success: `${this.config.publicOrigin}/pago/gracias`,
        pending: `${this.config.publicOrigin}/pago/gracias?estado=pendiente`,
        failure: `${this.config.publicOrigin}/pago/error` },
      ...(this.config.publicOrigin.startsWith('https://') ? { auto_return: 'approved' } : {}),
      ...webhook,
    }) });
    return { mode, preferenceId: result.id ?? null, initPoint: result.init_point ?? null,
      sandboxInitPoint: result.sandbox_init_point ?? null, publicKey: this.config.mpPublicKey };
  }

  /**
   * Cobro con tarjeta SIN salir de la pagina. El Payment Brick tokeniza la
   * tarjeta dentro del iframe de Mercado Pago y nos entrega un `token` de un
   * solo uso; aqui se cambia ese token por un pago real.
   *
   * EL IMPORTE NO VIENE DEL NAVEGADOR. Sale de `price.ts` igual que en
   * `checkout()`, o del cupon que el servidor ya reservo. Es la unica defensa
   * que hay: si `transaction_amount` se tomara de lo que manda el cliente,
   * cualquiera edita el cuerpo de la peticion y compra el curso por un peso.
   * El Brick manda tambien su propio `transaction_amount` y se DESCARTA a
   * proposito -- no se lee de `charge` en ninguna rama.
   *
   * `x-idempotency-key` es `orderKey`: si el navegador reintenta (red mala, el
   * usuario pulsa dos veces) Mercado Pago devuelve el MISMO pago en vez de
   * cobrar dos veces. Sin eso un doble clic son dos cargos a la tarjeta.
   */
  async cardPayment(actor: CheckoutActor, orderKey: string, charge: CardCharge,
    offer?: CheckoutOffer): Promise<Record<string, unknown>> {
    const webhookOrigin = this.config.webhookPublicOrigin;
    const webhook = webhookOrigin.startsWith('https://')
      ? { notification_url: `${webhookOrigin}/api/payments/mercadopago/webhook?source_news=webhooks` }
      : {};
    const result = await this.request('/v1/payments', {
      method: 'POST',
      headers: { 'x-idempotency-key': orderKey },
      body: JSON.stringify({
        transaction_amount: providerAmount(offer?.totalMinor ?? PRICE_MINOR),
        token: charge.token,
        installments: charge.installments,
        payment_method_id: charge.paymentMethodId,
        ...(charge.issuerId ? { issuer_id: charge.issuerId } : {}),
        description: 'IA desde cero · Fundamentos Vol. 1',
        external_reference: orderKey,
        metadata: { user_id: actor.userId, order_key: orderKey,
          ...(offer?.couponRedemptionId ? { coupon_redemption_id: offer.couponRedemptionId } : {}) },
        payer: { email: charge.payerEmail,
          ...(charge.identification ? { identification: charge.identification } : {}) },
        ...webhook,
      }),
    });
    return result;
  }

  payment(id: string): Promise<Record<string, unknown>> { return this.request(`/v1/payments/${encodeURIComponent(id)}`); }
  /**
   * Recurring charge resource. Mercado Pago documents both a nested
   * `payment.id` and a top-level `id`; callers must read whichever is present.
   */
  authorizedPayment(id: string): Promise<Record<string, unknown>> {
    return this.request(`/authorized_payments/${encodeURIComponent(id)}`);
  }
  subscription(id: string): Promise<Record<string, unknown>> { return this.request(`/preapproval/${encodeURIComponent(id)}`); }
  cancelSubscription(id: string): Promise<Record<string, unknown>> {
    return this.request(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
  }

  /**
   * Payments Mercado Pago updated in a window. Used by reconcileOnce so a
   * missed webhook is not the last word on an approved charge.
   */
  async searchPayments(beginIso: string, endIso: string): Promise<RemotePayment[]> {
    const query = new URLSearchParams({
      range: 'date_last_updated',
      begin_date: beginIso,
      end_date: endIso,
      sort: 'date_last_updated',
      criteria: 'desc',
      limit: '100',
    });
    const data = await this.request(`/v1/payments/search?${query.toString()}`);
    const results = Array.isArray(data.results) ? data.results as Record<string, unknown>[] : [];
    return results.map((row) => ({
      id: String(row.id ?? ''),
      status: String(row.status ?? 'unknown'),
      dateLastUpdated: String(row.date_last_updated ?? ''),
    })).filter((row) => row.id !== '');
  }
}
