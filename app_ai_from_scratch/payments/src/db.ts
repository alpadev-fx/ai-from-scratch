import pg from 'pg';
import type { OrderFacts } from './assess.ts';
import { deriveEntitlement } from './entitlement.ts';
import type { EntitlementSource, EntitlementState } from './entitlement.ts';
import type { CheckoutContext, MetaEvent } from './meta.ts';
import { PRICE_MINOR } from './price.ts';
import type { LocalPayment } from './reconcile.ts';

const { Pool } = pg;

export interface WebhookEvent {
  id: number;
  providerId: string;
  resourceType: string;
  attempts: number;
}

export interface CouponOffer {
  id: number;
  code: string;
  percent: number;
  // *Minor, no *Cents: COP no tiene decimales, asi que la unidad menor es el
  // peso. Un campo llamado «cents» con pesos dentro invita al `/100` que cobraba
  // la centesima parte. Ver src/price.ts.
  discountMinor: number;
  totalMinor: number;
}

export interface CouponRow {
  id: number;
  code: string;
  percent: number;
  maxRedemptions: number | null;
  active: boolean;
  /** El mismo conteo que decide si queda cupo: redimidos + reservas vivas. */
  used: number;
  /** Cuantos de esos `used` son reservas vivas, no compras. Se pueden soltar. */
  holding: number;
  startsAt: string | null;
  endsAt: string | null;
  discountMinor: number;
  totalMinor: number;
}

export interface CouponReservation {
  id: number;
  offer: CouponOffer;
}

export interface CheckoutOrder extends OrderFacts {
  mode: 'one_time' | 'subscription';
  couponRedemptionId: number | null;
  providerRef: string | null;
}

export interface QueueCounts {
  dead: number;
  pendingOver15m: number;
  orphanedApproved: number;
  ineligibleApproved: number;
}

// El precio vive en src/price.ts, no aqui: la conversion al importe del
// proveedor tiene que salir del mismo sitio que el numero.
const normalizeCode = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '');

export class Store {
  readonly pool: pg.Pool;
  constructor(url: string) { this.pool = new Pool({ connectionString: url, max: 8 }); }

  async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS payment_webhook_events (
        id BIGSERIAL PRIMARY KEY,
        event_key TEXT NOT NULL UNIQUE,
        provider_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','done','dead')),
        attempts SMALLINT NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_error TEXT,
        received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        processed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS payment_events_ready
        ON payment_webhook_events (state, next_attempt_at) WHERE state = 'pending';
      CREATE INDEX IF NOT EXISTS payment_events_reclaimable
        ON payment_webhook_events (next_attempt_at)
        WHERE state IN ('pending','processing');
      CREATE TABLE IF NOT EXISTS payments (
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id BIGINT,
        status TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        -- El default acompaña a CURRENCY en src/price.ts. Las filas viejas
        -- conservan su USD a proposito: es lo que se cobro de verdad.
        currency TEXT NOT NULL DEFAULT 'COP',
        raw JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (provider, provider_id)
      );
      CREATE INDEX IF NOT EXISTS payments_user_status ON payments (user_id, status);
      CREATE TABLE IF NOT EXISTS subscriptions (
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id BIGINT,
        status TEXT NOT NULL,
        current_period_end TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
        raw JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (provider, provider_id)
      );
      CREATE INDEX IF NOT EXISTS subscriptions_user_status ON subscriptions (user_id, status);
      CREATE TABLE IF NOT EXISTS coupons (
        id BIGSERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE CHECK (code <> ''),
        percent SMALLINT NOT NULL CHECK (percent BETWEEN 1 AND 100),
        max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
        active BOOLEAN NOT NULL DEFAULT true,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id BIGSERIAL PRIMARY KEY,
        coupon_id BIGINT NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
        user_id BIGINT NOT NULL,
        provider_id TEXT UNIQUE,
        state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','redeemed','released')),
        reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        redeemed_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS coupon_user_redeemed
        ON coupon_redemptions (coupon_id, user_id) WHERE state = 'redeemed';
      CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_state
        ON coupon_redemptions (coupon_id, state);
      -- NO SE SIEMBRAN CUPONES AQUI. Este bloque plantaba, en cada migracion y en
      -- cada entorno, un ALXN-100 al 100 % con max_redemptions NULL: sin limite de
      -- usos, sin caducidad, activo, y con el codigo escrito en un fichero del
      -- repositorio. El 100 % ademas salta Mercado Pago entero (server.ts: si
      -- totalMinor es 0 se concede el acceso directo), y /registro es publica. La
      -- ruta completa era: crear cuenta con cualquier correo, aplicar el codigo,
      -- curso completo gratis, repetir con otro correo. Es el mismo fallo que
      -- api/.env.example documenta sobre publicar un JWT_SECRET, aplicado al
      -- corpus de pago. Los cupones se crean con 'pnpm coupon crear', que exige
      -- limite de usos y caducidad.
      --
      -- Y se revoca donde ya haya aterrizado: un codigo que estuvo publicado en
      -- git no vuelve a ser secreto porque se borre el INSERT. El filtro por
      -- max_redemptions NULL toca SOLO al sembrado, no a un ALXN-100 que alguien
      -- cree despues con limite.
      UPDATE coupons SET active = false
        WHERE code = 'ALXN-100' AND max_redemptions IS NULL AND ends_at IS NULL;
      CREATE TABLE IF NOT EXISTS entitlement_deliveries (
        event_key TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        active BOOLEAN NOT NULL,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- What the buyer's browser looked like when checkout started. The Mercado
      -- Pago webhook arrives from Mercado Pago's servers, so this is the only
      -- place the Meta Purchase event can take fbp/fbc/IP/UA from. One row per
      -- user, latest checkout wins.
      CREATE TABLE IF NOT EXISTS checkout_contexts (
        user_id BIGINT PRIMARY KEY,
        email TEXT NOT NULL,
        fbp TEXT,
        fbc TEXT,
        client_ip TEXT,
        user_agent TEXT,
        source_url TEXT,
        utm JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Outbox for Meta Conversions API events. event_id is the dedup key on
      -- both sides: repeated webhook deliveries for one payment insert nothing.
      CREATE TABLE IF NOT EXISTS meta_events (
        event_id TEXT PRIMARY KEY,
        event_name TEXT NOT NULL,
        user_id BIGINT,
        provider_id TEXT,
        state TEXT NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        payload JSONB NOT NULL,
        fbtrace_id TEXT,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        sent_at TIMESTAMPTZ
      );
      -- Pedido nuestro, no el preference id de Mercado Pago. Sin esta fila un
      -- webhook aprobado no tiene importe esperado ni dueño, y un enlace de
      -- cupón que MP no caducaba se podía pagar otra vez el mes siguiente.
      -- consumed_by es el candado de un solo uso: el segundo pago aprobado
      -- contra el mismo order_key pierde, no tira.
      CREATE TABLE IF NOT EXISTS checkout_orders (
        order_key TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('one_time','subscription')),
        expected_minor INTEGER NOT NULL CHECK (expected_minor >= 0),
        currency TEXT NOT NULL,
        coupon_redemption_id BIGINT,
        provider_ref TEXT,
        consumed_by TEXT,
        consumed_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS checkout_orders_ref ON checkout_orders (provider_ref);
      -- DEFAULT true: las filas ya cobradas (incluidos coupon:<code>:<user>)
      -- siguen siendo elegibles. NO se rellena a false.
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS eligible BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS ineligible_reason TEXT;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_key TEXT;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS live_mode BOOLEAN;
      ALTER TABLE checkout_contexts ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ;
      ALTER TABLE checkout_contexts ADD COLUMN IF NOT EXISTS terms_version TEXT;
    `);
  }

  async saveCheckoutContext(userId: number, email: string, context: CheckoutContext, terms?: { version: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO checkout_contexts (user_id,email,fbp,fbc,client_ip,user_agent,source_url,utm,accepted_terms_at,terms_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $9::text IS NULL THEN NULL ELSE now() END,$9)
       ON CONFLICT (user_id) DO UPDATE SET
         email=excluded.email,fbp=excluded.fbp,fbc=excluded.fbc,client_ip=excluded.client_ip,
         user_agent=excluded.user_agent,source_url=excluded.source_url,utm=excluded.utm,
         accepted_terms_at=COALESCE(excluded.accepted_terms_at, checkout_contexts.accepted_terms_at),
         terms_version=COALESCE(excluded.terms_version, checkout_contexts.terms_version),
         updated_at=now()`,
      [userId, email, context.fbp, context.fbc, context.clientIp, context.userAgent, context.sourceUrl,
        { ...context.utm, ...(context.noAds ? { no_ads: '1' } : {}) },
        terms?.version ?? null]);
  }

  async checkoutContext(userId: number): Promise<{ email: string; context: CheckoutContext } | null> {
    const result = await this.pool.query(
      `SELECT email,fbp,fbc,client_ip,user_agent,source_url,utm FROM checkout_contexts WHERE user_id=$1`, [userId]);
    const row = result.rows[0];
    if (!row) return null;
    const utm = (row.utm ?? {}) as Record<string, string>;
    return { email: String(row.email), context: {
      fbp: row.fbp ?? null, fbc: row.fbc ?? null, clientIp: row.client_ip ?? null, userAgent: row.user_agent ?? null,
      sourceUrl: row.source_url ?? null, utm, noAds: utm.no_ads === '1' } };
  }

  async queueMetaEvent(data: { eventId: string; eventName: string; userId: number; providerId: string;
    payload: MetaEvent }): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO meta_events (event_id,event_name,user_id,provider_id,payload)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_id) DO NOTHING`,
      [data.eventId, data.eventName, data.userId, data.providerId, data.payload]);
    return result.rowCount === 1;
  }

  async takeMetaEvent(): Promise<{ eventId: string; attempts: number; payload: MetaEvent } | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT event_id, attempts, payload FROM meta_events
          WHERE state IN ('pending','processing') AND next_attempt_at <= now()
          ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const row = result.rows[0];
      if (!row) { await client.query('COMMIT'); return null; }
      await client.query(
        `UPDATE meta_events SET state='processing', attempts=attempts+1,
                next_attempt_at=now() + interval '5 minutes' WHERE event_id=$1`, [row.event_id]);
      await client.query('COMMIT');
      return { eventId: String(row.event_id), attempts: Number(row.attempts) + 1, payload: row.payload as MetaEvent };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async metaSent(eventId: string, fbtraceId: string | null): Promise<void> {
    await this.pool.query(
      `UPDATE meta_events SET state='sent', sent_at=now(), fbtrace_id=$2, last_error=NULL WHERE event_id=$1`,
      [eventId, fbtraceId]);
  }

  async metaFailed(eventId: string, attempts: number, error: unknown): Promise<void> {
    // Meta accepts an event up to 7 days late, so the retry ladder is generous:
    // 30 s, 1 min, 2 min ... capped at an hour, dead after 8 tries (~2 h).
    const dead = attempts >= 8;
    const seconds = Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
    await this.pool.query(
      `UPDATE meta_events SET state=$2, last_error=$3, next_attempt_at=now() + ($4 * interval '1 second')
        WHERE event_id=$1`, [eventId, dead ? 'dead' : 'pending', String(error).slice(0, 500), seconds]);
  }

  async listMetaEvents(): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT event_id,event_name,user_id,provider_id,state,attempts,fbtrace_id,last_error,created_at,sent_at
         FROM meta_events ORDER BY created_at DESC LIMIT 200`);
    return result.rows;
  }

  async recordEvent(eventKey: string, providerId: string, resourceType: string): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO payment_webhook_events (event_key,provider_id,resource_type)
       VALUES ($1,$2,$3) ON CONFLICT (event_key) DO NOTHING`, [eventKey, providerId, resourceType]);
    return result.rowCount === 1;
  }

  async takeEvent(): Promise<WebhookEvent | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT id, provider_id, resource_type, attempts
           FROM payment_webhook_events
          WHERE state IN ('pending','processing') AND next_attempt_at <= now()
          ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const row = result.rows[0];
      if (!row) { await client.query('COMMIT'); return null; }
      await client.query(
        `UPDATE payment_webhook_events
            SET state='processing', attempts=attempts+1,
                next_attempt_at=now() + interval '5 minutes'
          WHERE id=$1`, [row.id]);
      await client.query('COMMIT');
      return { id: Number(row.id), providerId: String(row.provider_id),
        resourceType: String(row.resource_type), attempts: Number(row.attempts) + 1 };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async finishEvent(id: number): Promise<void> {
    await this.pool.query(
      `UPDATE payment_webhook_events SET state='done', processed_at=now(), last_error=NULL WHERE id=$1`, [id]);
  }

  async failEvent(id: number, attempts: number, error: unknown): Promise<void> {
    const dead = attempts >= 8;
    const seconds = Math.min(1800, 2 * 4 ** Math.max(0, attempts - 1));
    await this.pool.query(
      `UPDATE payment_webhook_events
          SET state=$2, last_error=$3,
              next_attempt_at=now() + ($4 * interval '1 second'),
              processed_at=CASE WHEN $2='dead' THEN now() ELSE NULL END
        WHERE id=$1`, [id, dead ? 'dead' : 'pending', String(error).slice(0, 500), seconds]);
  }

  async upsertPayment(data: { providerId: string; userId: number | null; status: string;
    amount: number; currency: string; raw: unknown; eligible?: boolean; ineligibleReason?: string | null;
    orderKey?: string | null; liveMode?: boolean | null }): Promise<void> {
    await this.pool.query(
      `INSERT INTO payments (provider,provider_id,user_id,status,amount,currency,raw,eligible,ineligible_reason,order_key,live_mode)
       VALUES ('mercadopago',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (provider,provider_id) DO UPDATE SET
         user_id=excluded.user_id,status=excluded.status,amount=excluded.amount,
         currency=excluded.currency,raw=excluded.raw,eligible=excluded.eligible,
         ineligible_reason=excluded.ineligible_reason,order_key=excluded.order_key,
         live_mode=excluded.live_mode,updated_at=now()`,
      [data.providerId, data.userId, data.status, data.amount, data.currency, data.raw,
        data.eligible !== false, data.ineligibleReason ?? null, data.orderKey ?? null, data.liveMode ?? null]);
  }

  /**
   * Crea el pedido ANTES de llamar a Mercado Pago. Si MP responde y el proceso
   * muere, el webhook todavía tiene expected_minor y user_id. Reinsertar la
   * misma clave es un bug del llamador (UUID nuevo por checkout), no un upsert.
   */
  async createOrder(data: { orderKey: string; userId: number; mode: 'one_time' | 'subscription';
    expectedMinor: number; currency: string; couponRedemptionId?: number | null; expiresAt: Date }): Promise<void> {
    await this.pool.query(
      `INSERT INTO checkout_orders (order_key,user_id,mode,expected_minor,currency,coupon_redemption_id,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [data.orderKey, data.userId, data.mode, data.expectedMinor, data.currency,
        data.couponRedemptionId ?? null, data.expiresAt]);
  }

  async attachOrderRef(orderKey: string, providerRef: string): Promise<void> {
    await this.pool.query(`UPDATE checkout_orders SET provider_ref=$2 WHERE order_key=$1`, [orderKey, providerRef]);
  }

  async order(orderKey: string): Promise<CheckoutOrder | null> {
    const result = await this.pool.query(
      `SELECT order_key,user_id,mode,expected_minor,currency,coupon_redemption_id,provider_ref,consumed_by,expires_at
         FROM checkout_orders WHERE order_key=$1`, [orderKey]);
    const row = result.rows[0];
    if (!row) return null;
    const mode = String(row.mode) as CheckoutOrder['mode'];
    return {
      orderKey: String(row.order_key), userId: Number(row.user_id), mode,
      expectedMinor: Number(row.expected_minor), currency: String(row.currency),
      couponRedemptionId: row.coupon_redemption_id != null ? Number(row.coupon_redemption_id) : null,
      providerRef: row.provider_ref != null ? String(row.provider_ref) : null,
      consumedBy: row.consumed_by != null ? String(row.consumed_by) : null,
      expiresAt: new Date(row.expires_at),
      singleUse: mode !== 'subscription',
    };
  }

  /**
   * Candado de un solo uso. Cero filas = otro pago ya consumió el pedido: el
   * llamador marca ineligible (`order_consumed`), no tira. Reentregar EL MISMO
   * payment id (`consumed_by=$2`) gana otra vez, porque Mercado Pago reintenta.
   */
  async consumeOrder(orderKey: string, paymentId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE checkout_orders SET consumed_by=$2, consumed_at=now()
        WHERE order_key=$1 AND (consumed_by IS NULL OR consumed_by=$2) RETURNING 1`,
      [orderKey, paymentId]);
    return (result.rowCount ?? 0) > 0;
  }

  async upsertSubscription(data: { providerId: string; userId: number | null; status: string;
    periodEnd: string | null; raw: unknown }): Promise<void> {
    await this.pool.query(
      `INSERT INTO subscriptions (provider,provider_id,user_id,status,current_period_end,raw)
       VALUES ('mercadopago',$1,$2,$3,$4,$5)
       ON CONFLICT (provider,provider_id) DO UPDATE SET
         user_id=excluded.user_id,status=excluded.status,current_period_end=excluded.current_period_end,
         raw=excluded.raw,updated_at=now()`,
      [data.providerId, data.userId, data.status, data.periodEnd, data.raw]);
  }

  /**
   * Lo que vale un cupon, SIN reservarlo. Es lo que responde el boton
   * «Aplicar»: el comprador tiene que ver el total antes de escribir la
   * tarjeta, y hasta ahora ese boton solo pintaba «Cupon listo» para
   * cualquier texto -- «PENDEJADA» incluido -- sin preguntarle a nadie.
   *
   * NO cuenta como intento y NO toca coupon_redemptions a proposito: si
   * cotizar gastara cupo, mirar el precio dos veces quemaria dos de los 25.
   * Las mismas puertas que reserveCoupon (activo, ventana de fechas, cupo,
   * ya redimido por este usuario) para que el total que se ve sea el total
   * que se cobra; la carrera entre cotizar y reservar la cierra reserveCoupon,
   * que es quien manda.
   */
  async quoteCoupon(code: string, userId: number): Promise<CouponOffer | null> {
    const normalized = normalizeCode(code);
    if (!normalized || normalized.length > 64) return null;
    const result = await this.pool.query(
      `SELECT id, code, percent, max_redemptions, active, starts_at, ends_at
         FROM coupons WHERE code=$1`, [normalized]);
    const row = result.rows[0];
    const now = Date.now();
    if (!row || !row.active || (row.starts_at && new Date(row.starts_at).getTime() > now) ||
        (row.ends_at && new Date(row.ends_at).getTime() <= now)) return null;
    const prior = await this.pool.query(
      `SELECT 1 FROM coupon_redemptions WHERE coupon_id=$1 AND user_id=$2 AND state='redeemed' LIMIT 1`,
      [row.id, userId]);
    if (prior.rowCount) return null;
    // El cupo se cuenta COMO LO CUENTA reserveCoupon, no parecido.
    //
    // reserveCoupon suelta las reservas de mas de 30 minutos antes de contar;
    // cotizar no puede hacer ese UPDATE (es de solo lectura a proposito), asi
    // que excluye las mismas filas con el mismo predicado. Sin esto, cotizar
    // decia «cupon no valido» sobre un cupon que reservar habria aceptado.
    //
    // Y la reserva VIVA de quien pregunta no cuenta contra el: es la suya, y
    // reserveCoupon se la va a reutilizar. Antes su propio intento anterior le
    // hacia ver el cupon como agotado.
    const used = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM coupon_redemptions
        WHERE coupon_id=$1
          AND (state='redeemed'
               OR (state='reserved' AND reserved_at >= now() - interval '30 minutes'
                   AND user_id <> $2))`,
      [row.id, userId]);
    if (row.max_redemptions !== null && Number(used.rows[0]?.count ?? 0) >= Number(row.max_redemptions)) return null;
    const discountMinor = Math.floor(PRICE_MINOR * Number(row.percent) / 100);
    return { id: Number(row.id), code: String(row.code), percent: Number(row.percent),
      discountMinor, totalMinor: PRICE_MINOR - discountMinor };
  }

  async reserveCoupon(code: string, userId: number): Promise<CouponReservation | null> {
    const normalized = normalizeCode(code);
    if (!normalized || normalized.length > 64) return null;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE coupon_redemptions SET state='released'
        WHERE state='reserved' AND reserved_at < now() - interval '30 minutes'`);
      const result = await client.query(
        `SELECT id, code, percent, max_redemptions, active, starts_at, ends_at
           FROM coupons WHERE code=$1 FOR UPDATE`, [normalized]);
      const row = result.rows[0];
      const now = Date.now();
      if (!row || !row.active || (row.starts_at && new Date(row.starts_at).getTime() > now) ||
          (row.ends_at && new Date(row.ends_at).getTime() <= now)) {
        await client.query('ROLLBACK'); return null;
      }
      const prior = await client.query(
        `SELECT 1 FROM coupon_redemptions WHERE coupon_id=$1 AND user_id=$2 AND state='redeemed' LIMIT 1`,
        [row.id, userId]);
      if (prior.rowCount) { await client.query('ROLLBACK'); return null; }
      const used = await client.query(
        `SELECT COUNT(*)::int AS count FROM coupon_redemptions WHERE coupon_id=$1 AND state IN ('reserved','redeemed')`,
        [row.id]);
      if (row.max_redemptions !== null && Number(used.rows[0]?.count ?? 0) >= Number(row.max_redemptions)) {
        await client.query('ROLLBACK'); return null;
      }
      // REUTILIZAR la reserva viva de este mismo usuario, no insertar otra.
      //
      // Antes esto insertaba siempre. Un comprador que reintenta -- red mala,
      // tarjeta rechazada, o un checkout roto como el de hoy -- se quedaba con
      // una fila `reserved` por intento, todas suyas, y cada una gastaba un
      // cupo de las 3 del cupon. Al cuarto clic su propio cupon le decia
      // «Revisa el codigo o intenta de nuevo», y seguia diciendoselo 30
      // minutos, que es lo que tarda la barrida de arriba en soltarlas.
      // Medido: cupon de tope 3, tres clics en «Pagar», el cuarto 422.
      //
      // El indice unico coupon_user_redeemed solo cubre `redeemed`, asi que no
      // frenaba esto. Una persona tiene como mucho UNA reserva viva por cupon.
      const mia = await client.query(
        `SELECT id FROM coupon_redemptions
          WHERE coupon_id=$1 AND user_id=$2 AND state='reserved'
          ORDER BY reserved_at DESC LIMIT 1`, [row.id, userId]);
      const inserted = mia.rowCount ? mia : await client.query(
        `INSERT INTO coupon_redemptions (coupon_id,user_id) VALUES ($1,$2) RETURNING id`, [row.id, userId]);
      await client.query('COMMIT');
      // El `/ 100` de aqui es el PORCENTAJE del cupon, no la moneda: un 30%
      // sobre PRICE_MINOR. No se toca al cambiar de moneda.
      const discountMinor = Math.floor(PRICE_MINOR * Number(row.percent) / 100);
      return { id: Number(inserted.rows[0].id), offer: {
        id: Number(row.id), code: String(row.code), percent: Number(row.percent), discountMinor,
        totalMinor: PRICE_MINOR - discountMinor,
      } };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  /**
   * Los cupones que existen, con lo gastado de cada uno. `used` cuenta
   * reserved+redeemed: el mismo criterio que usa reserveCoupon para decidir si
   * queda cupo, porque una tabla que cuente distinto que la puerta miente.
   */
  async listCoupons(): Promise<CouponRow[]> {
    const result = await this.pool.query(`
      SELECT c.id, c.code, c.percent, c.max_redemptions, c.active, c.starts_at, c.ends_at,
             -- El MISMO conteo que reserveCoupon: las reservas de mas de 30
             -- minutos ya no ocupan cupo (la barrida de reserveCoupon las
             -- suelta), asi que contarlas aqui pintaba «3 de 3» sobre un
             -- cupon que el cobro habria aceptado.
             (SELECT COUNT(*)::int FROM coupon_redemptions r
                WHERE r.coupon_id = c.id
                  AND (r.state='redeemed'
                       OR (r.state='reserved'
                           AND r.reserved_at >= now() - interval '30 minutes'))) AS used,
             (SELECT COUNT(*)::int FROM coupon_redemptions r
                WHERE r.coupon_id = c.id AND r.state='reserved'
                  AND r.reserved_at >= now() - interval '30 minutes') AS holding
        FROM coupons c ORDER BY c.created_at DESC, c.code`);
    return result.rows.map((r) => ({
      id: Number(r.id), code: String(r.code), percent: Number(r.percent),
      maxRedemptions: r.max_redemptions === null ? null : Number(r.max_redemptions),
      active: Boolean(r.active), used: Number(r.used), holding: Number(r.holding),
      startsAt: r.starts_at ? new Date(r.starts_at).toISOString() : null,
      endsAt: r.ends_at ? new Date(r.ends_at).toISOString() : null,
      discountMinor: Math.floor(PRICE_MINOR * Number(r.percent) / 100),
      totalMinor: PRICE_MINOR - Math.floor(PRICE_MINOR * Number(r.percent) / 100),
    }));
  }

  /**
   * Crea un cupon. Devuelve null si el codigo YA existe -- no lo pisa.
   *
   * `ON CONFLICT DO NOTHING` y no DO UPDATE a proposito: sobrescribir en
   * silencio un cupon vivo cambiaria el precio de un codigo que ya circula, y
   * las redenciones hechas seguirian colgando de la misma fila. Quien quiera
   * cambiarlo, que lo revoque y cree otro.
   *
   * Las validaciones NO viven aqui: viven en la ruta, junto al mensaje que ve
   * quien lo crea. Aqui solo queda la CHECK de la tabla, que es la ultima red.
   */
  async createCoupon(code: string, percent: number, maxRedemptions: number,
    days: number): Promise<CouponRow | null> {
    const normalized = normalizeCode(code);
    const result = await this.pool.query(
      `INSERT INTO coupons (code, percent, max_redemptions, active, starts_at, ends_at)
         VALUES ($1,$2,$3,true, now(), now() + ($4 || ' days')::interval)
       ON CONFLICT (code) DO NOTHING RETURNING id`, [normalized, percent, maxRedemptions, String(days)]);
    if (!result.rowCount) return null;
    const all = await this.listCoupons();
    return all.find((c) => c.code === normalized) ?? null;
  }

  /**
   * Revoca o reactiva. Revocar NO borra ni retira accesos: quien ya redimio
   * conserva el curso, y eso es correcto -- pago (o se le regalo) y ya esta.
   * El codigo simplemente deja de abrir mas.
   */
  /**
   * Suelta las reservas VIVAS de un cupon. No toca las redimidas.
   *
   * Existe porque una reserva dura 30 minutos y durante ese rato ocupa cupo.
   * Con un cupon de tope 3 y un checkout que falla, el propio comprador podia
   * dejar el cupon inservible hasta la siguiente barrida -- y no habia forma
   * de desatascarlo salvo esperar o entrar a Postgres a mano.
   *
   * Es seguro: una reserva no es una compra. Si alguien estaba a mitad de
   * pagar, su `reserveCoupon` vuelve a tomar cupo en el siguiente intento; y
   * si ya pago, la fila esta en `redeemed` y esto no la mira.
   */
  async releaseCouponHolds(code: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE coupon_redemptions SET state='released'
         WHERE state='reserved'
           AND coupon_id = (SELECT id FROM coupons WHERE code=$1)`, [normalizeCode(code)]);
    return result.rowCount ?? 0;
  }

  async setCouponActive(code: string, active: boolean): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE coupons SET active=$2 WHERE code=$1`, [normalizeCode(code), active]);
    return (result.rowCount ?? 0) > 0;
  }

  async attachCoupon(id: number, providerId: string): Promise<void> {
    await this.pool.query(`UPDATE coupon_redemptions SET provider_id=$2 WHERE id=$1 AND state='reserved'`, [id, providerId]);
  }

  async redeemCoupon(providerId: string): Promise<void> {
    await this.pool.query(`UPDATE coupon_redemptions SET state='redeemed', redeemed_at=now()
      WHERE provider_id=$1 AND state='reserved'`, [providerId]);
  }

  async redeemCouponReservation(id: number, providerId: string): Promise<void> {
    await this.pool.query(`UPDATE coupon_redemptions SET state='redeemed', provider_id=$2, redeemed_at=now()
      WHERE id=$1 AND state='reserved'`, [id, providerId]);
  }

  async releaseCoupon(id: number): Promise<void> {
    await this.pool.query(`UPDATE coupon_redemptions SET state='released' WHERE id=$1 AND state='reserved'`, [id]);
  }

  /**
   * The rows the access derives from. The rule itself lives in entitlement.ts
   * (pure, tested); this only fetches. A payment's date is Mercado Pago's
   * `date_approved`, then `date_created` (set on every Mercado Pago payment, so an
   * approved row that lost its approval stamp is still dated by the provider, not
   * by us); a coupon grant has neither and uses the row's write time, which nothing
   * rewrites once the redemption is final. `updated_at` is NOT the first fallback
   * for provider rows on purpose: a webhook re-delivery rewrites it, and a legacy
   * payment re-dated to "now" would fall after the cutoff and lapse in 30 days.
   * A malformed date fails the query instead of reading as "no date": a payment
   * that cannot say when it was approved must not become a perpetual grant.
   */
  async entitlementSources(userId: number, filter?: { kind: EntitlementSource['kind']; providerId: string }): Promise<EntitlementSource[]> {
    // Filter in SQL, not after fetch: a poison `date_approved` on another
    // (kind, id) of this user used to abort the whole query and block the
    // grant the delivery was actually about.
    const paymentPred = !filter ? 'WHERE user_id=$1' : filter.kind === 'payment'
      ? 'WHERE user_id=$1 AND provider_id=$2' : 'WHERE FALSE';
    const subPred = !filter ? 'WHERE user_id=$1' : filter.kind === 'subscription'
      ? 'WHERE user_id=$1 AND provider_id=$2' : 'WHERE FALSE';
    const params = filter ? [userId, filter.providerId] : [userId];
    const result = await this.pool.query(
      `SELECT 'payment' AS kind, provider_id AS id, status,
              COALESCE((raw->>'date_approved')::timestamptz, (raw->>'date_created')::timestamptz, updated_at) AS at,
              updated_at AS seen, eligible, amount
         FROM payments ${paymentPred}
       UNION ALL
       SELECT 'subscription' AS kind, provider_id AS id, status, current_period_end AS at, updated_at AS seen,
              TRUE AS eligible,
              COALESCE((raw->>'transaction_amount')::numeric, 0) AS amount
         FROM subscriptions ${subPred}`, params);
    return result.rows.map((row) => ({
      kind: row.kind as EntitlementSource['kind'], id: String(row.id), status: String(row.status),
      at: row.at ? new Date(row.at) : null, seen: new Date(row.seen),
      eligible: row.eligible !== false, amount: Number(row.amount ?? 0),
    }));
  }

  /** The user's whole access now and its end: what /perfil shows. */
  async entitlementState(userId: number): Promise<EntitlementState> {
    return deriveEntitlement(await this.entitlementSources(userId));
  }

  /** The state of the ONE grant a delivery is about: what travels to the api (server.ts sendEntitlement). */
  async entitlementStateFor(userId: number, kind: EntitlementSource['kind'], providerId: string): Promise<EntitlementState> {
    return deriveEntitlement(await this.entitlementSources(userId, { kind, providerId }));
  }

  async entitlement(userId: number): Promise<boolean> {
    return (await this.entitlementState(userId)).active;
  }

  async markDelivered(key: string, userId: number, active: boolean): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO entitlement_deliveries (event_key,user_id,active) VALUES ($1,$2,$3)
       ON CONFLICT (event_key) DO NOTHING`, [key, userId, active]);
    return result.rowCount === 1;
  }

  async listPayments(limit = 100): Promise<unknown[]> {
    return (await this.pool.query(
      `SELECT provider,provider_id,user_id,status,amount,currency,updated_at
         FROM payments ORDER BY updated_at DESC LIMIT $1`, [Math.min(500, Math.max(1, limit))])).rows;
  }

  /**
   * The subscription that matters: the LIVE one first, then the newest. /perfil's
   * cancel button and /cancel both act on this row. Newest-only was wrong: a user
   * who reopened /pago, started a second preapproval and abandoned it had a newer
   * `pending` row, so /perfil hid the cancel button and /cancel would have
   * cancelled the abandoned one while the authorized one kept charging.
   */
  async subscription(userId: number): Promise<unknown | null> {
    return (await this.pool.query(
      `SELECT provider,provider_id,status,current_period_end,cancel_at_period_end,updated_at
         FROM subscriptions WHERE user_id=$1
        ORDER BY (status = 'authorized') DESC, updated_at DESC LIMIT 1`, [userId])).rows[0] ?? null;
  }

  /**
   * The preapproval a recurring charge belongs to. Used to build the synthetic
   * OrderFacts for `subscription_authorized_payment` (those webhooks have no
   * checkout_orders row of their own; many charges share the preapproval).
   */
  async subscriptionByProviderId(preapprovalId: string): Promise<{ userId: number | null; expectedMinor: number } | null> {
    const result = await this.pool.query(
      `SELECT user_id, raw FROM subscriptions WHERE provider='mercadopago' AND provider_id=$1`,
      [preapprovalId]);
    const row = result.rows[0];
    if (!row) return null;
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    const recurring = raw.auto_recurring as { transaction_amount?: unknown } | undefined;
    const amount = Number(recurring?.transaction_amount ?? raw.transaction_amount ?? PRICE_MINOR);
    return {
      userId: row.user_id != null ? Number(row.user_id) : null,
      expectedMinor: Number.isFinite(amount) ? amount : PRICE_MINOR,
    };
  }

  /**
   * One round-trip for /health and /api/alerts. dead/stale are the queue
   * backing up; orphanedApproved is the production fact that already happened
   * (an approved payment with no resolvable user); ineligibleApproved is every
   * approved row we refused, including orphans.
   */
  async queueCounts(): Promise<QueueCounts> {
    const result = await this.pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM payment_webhook_events WHERE state='dead') AS dead,
         (SELECT COUNT(*)::int FROM payment_webhook_events
           WHERE state IN ('pending','processing') AND received_at < now() - interval '15 minutes') AS pending_over_15m,
         (SELECT COUNT(*)::int FROM payments WHERE status='approved' AND ineligible_reason='no_user') AS orphaned_approved,
         (SELECT COUNT(*)::int FROM payments WHERE status='approved' AND NOT eligible) AS ineligible_approved`);
    const row = result.rows[0] ?? {};
    return {
      dead: Number(row.dead ?? 0),
      pendingOver15m: Number(row.pending_over_15m ?? 0),
      orphanedApproved: Number(row.orphaned_approved ?? 0),
      ineligibleApproved: Number(row.ineligible_approved ?? 0),
    };
  }

  async localPaymentsSince(sinceIso: string): Promise<LocalPayment[]> {
    const result = await this.pool.query(
      `SELECT provider_id, status, updated_at FROM payments WHERE updated_at >= $1::timestamptz`,
      [sinceIso]);
    return result.rows.map((row) => ({
      providerId: String(row.provider_id), status: String(row.status),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  /**
   * Re-open dead webhook events except permanent refusals. An orphan has no
   * user a retry can invent; `no_order` / `order_consumed` are the amount and
   * single-use guards — redriving them would grant the money we already refused.
   */
  async reviveDeadEvents(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE payment_webhook_events SET state='pending', attempts=0, next_attempt_at=now()
        WHERE state='dead'
          AND last_error NOT LIKE 'orphan_payment:%'
          AND last_error NOT LIKE '%no_order%'
          AND last_error NOT LIKE '%order_consumed%'`);
    return result.rowCount ?? 0;
  }

  async close(): Promise<void> { await this.pool.end(); }
}
