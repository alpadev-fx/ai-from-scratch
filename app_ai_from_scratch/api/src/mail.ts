import type { EmailKind } from '../../design/saas-emails/templates.ts';

// Transactional mail via Resend. Used today for password recovery
// (auth/src/index.ts: /api/auth/recover). Without it, recovery answers 503
// correo_no_configurado in production and logs the reset link in development —
// that fallback already exists and does not change here.
//
// RESEND_API_KEY and MAIL_FROM are both-or-neither, same shape as
// payments/src/config.ts's meta(): half a configuration is a misconfiguration,
// not a degraded mode, so it throws at boot instead of silently disabling mail
// or silently sending from the wrong address.

const env = (k: string): string | null => { const v = process.env[k]; return v && v.trim() ? v.trim() : null; };
const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/;

/**
 * Que plantilla le toca a una transicion de derecho de acceso.
 *
 * Pura y exportada a proposito: vivia dentro del handler de
 * /api/internal/entitlements, donde no se podia probar sin Postgres, Mercado
 * Pago y un mailer. Aqui la prueba api/test/mail.mts fija las cinco
 * transiciones y el silencio de las demas.
 *
 * `yaPagaba` es el estado del comprador ANTES de aplicar el evento: es lo unico
 * que distingue una suscripcion nueva de una renovacion. Leido despues siempre
 * vale 1 y cada cobro mensual anunciaria un alta.
 *
 * null = no se manda nada. Un cupon concede acceso pero lleva su propio
 * mensaje, y una fuente desconocida no inventa correo: fail closed.
 */
export function entitlementMailKind(source: string, active: boolean, yaPagaba: boolean): EmailKind | null {
  if (source === 'mercadopago.payment') return active ? 'purchase_receipt' : 'refund_confirmed';
  if (source === 'mercadopago.subscription') {
    if (!active) return 'subscription_cancelled';
    return yaPagaba ? 'subscription_receipt' : 'subscription_started';
  }
  return null;
}

export interface Mailer {
  send(input: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}

function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send({ to, subject, text, html }) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 10000);
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(html ? { from, to, subject, text, html } : { from, to, subject, text }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`resend_${res.status}: ${body.slice(0, 200)}`);
        }
      } finally { clearTimeout(timer); }
    },
  };
}

export function loadMailer(): Mailer | undefined {
  const apiKey = env('RESEND_API_KEY');
  const from = env('MAIL_FROM');
  if (!apiKey && !from) return undefined;
  if (!apiKey || !from) throw new Error('RESEND_API_KEY and MAIL_FROM must be set together (or both unset)');
  if (!apiKey.startsWith('re_')) throw new Error('RESEND_API_KEY does not look like a Resend key (expected re_ prefix)');
  if (!EMAIL_RE.test(from)) throw new Error('MAIL_FROM must be a plain email address');
  return resendMailer(apiKey, from);
}

/** undefined when unconfigured — callers already handle that (fail-closed 503 in production). */
export const mailer: Mailer | undefined = loadMailer();
