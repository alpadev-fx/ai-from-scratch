import { defineMiddleware } from 'astro:middleware';
import { HSTS, overTls } from './lib/hsts.ts';

/**
 * HSTS: the browser must stop trying http:// on its own.
 *
 * WHAT WAS BROKEN. Nothing about the certificate — both apex and www serve a
 * valid Let's Encrypt cert and http:// answers 301. The hole is that first
 * request. Somebody typing `aifromscratch.shop` sends it in the clear, and the
 * 301 only protects the visits that come AFTER the legitimate server already
 * answered. On a hostile network an attacker replies to that plaintext request
 * first and serves a copy; the 301 never runs. This header removes the hop:
 * after one successful https visit the browser rewrites http:// to https://
 * itself, before any packet leaves.
 *
 * WHY max-age IS SMALL. HSTS is not reversible on the client. Once a browser
 * caches it, it REFUSES to reach this domain over http for the whole max-age,
 * and if the certificate ever lapses the site is unreachable, not degraded —
 * with no way to tell the browsers already holding it. So the ramp is
 * deliberate: 300s now, and it only goes up once a renewal has been watched
 * through a cycle. See RUNBOOK.md.
 *
 * WHY NOT includeSubDomains YET. Same irreversibility, wider. It would cover
 * every present and future subdomain of aifromscratch.shop at once, including
 * any that does not have TLS today. That is a decision to make with the DNS in
 * hand, not one to inherit from a default.
 *
 * WHY THIS IS MIDDLEWARE AND NOT A DOCKER OR PLATFORM SETTING. Railway's edge
 * does not take custom response headers, and 30 of the 31 pages in web/src
 * declare `prerender = false`, so middleware runs for every document a person
 * can land on. The one exception is healthz.ts, which is static, is not a page
 * anybody types, and does not need it.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  // Only over TLS. Sending HSTS on a plaintext response is ignored by the spec,
  // and behind Railway's proxy the app itself always speaks http, so the
  // protocol the USER used is the forwarded one.
  if (overTls(context.request.headers.get('x-forwarded-proto'), context.url.protocol)) {
    response.headers.set('strict-transport-security', HSTS);
  }
  return response;
});
