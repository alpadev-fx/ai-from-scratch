import type { APIRoute } from 'astro';

// Liveness endpoint for Railway. It must not depend on the API, database, or
// external providers; those are checked by service-specific readiness probes.
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
