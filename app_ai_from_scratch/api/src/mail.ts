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
