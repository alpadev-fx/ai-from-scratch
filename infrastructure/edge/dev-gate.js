// HTTP Basic auth gate in front of the DEV environment.
//
// WHY A WORKER AND NOT THE APP. web/astro.config.mjs declares no `output`, so
// Astro defaults to static with individual pages opting into server rendering
// via `prerender = false`. Astro middleware runs at BUILD time for prerendered
// pages, which means a middleware gate leaves every static page -- the landing
// included -- served unauthenticated by the node standalone adapter. The gate
// has to sit in front of the origin, not inside it.
//
// WHAT THIS DOES NOT PROTECT. The Railway service domain
// (`web-dev-a8ad.up.railway.app`) stays publicly reachable and is not behind
// this Worker. Anyone with that hostname skips the password entirely. The
// password protects the pretty domain; it does not make DEV private. Closing
// that hole means the origin must stop answering to anything but this Worker,
// which Railway cannot express today.
//
// Bindings: DEV_GATE_PASSWORD (secret), DEV_GATE_USER, ORIGIN_HOST (plain vars).

const enc = new TextEncoder();

/** Constant-time string compare. A `===` here leaks the shared password one
 *  character at a time to anyone who can measure the response. */
function sameSecret(a, b) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  // Compare a fixed number of bytes so the loop count does not reveal the
  // length; a length mismatch still has to lose, hence the separate flag.
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function challenge() {
  return new Response('Authentication required.\n', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="dev", charset="UTF-8"',
      // A cached 401 makes the gate look broken after a correct login.
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      // Nothing behind this gate should be indexed if it ever answers 200 to a
      // crawler that carries credentials.
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function authorised(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.toLowerCase().startsWith('basic ')) return false;
  let decoded;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  // Only the FIRST colon separates user from password: a password containing a
  // colon must still work, so split once rather than on every occurrence.
  const at = decoded.indexOf(':');
  if (at < 0) return false;
  const user = decoded.slice(0, at);
  const pass = decoded.slice(at + 1);
  // Both compared in constant time, and both must pass -- an early return on
  // the username would turn the user field into an oracle.
  const okUser = sameSecret(user, env.DEV_GATE_USER ?? 'dev');
  const okPass = sameSecret(pass, env.DEV_GATE_PASSWORD ?? '');
  return okUser && okPass;
}

export default {
  async fetch(request, env) {
    // Fail closed. An unset secret must not mean "no password required".
    if (!env.DEV_GATE_PASSWORD || !env.ORIGIN_HOST) {
      return new Response('dev gate is misconfigured\n', {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (!authorised(request, env)) return challenge();

    // Rewriting the hostname is what sets the outgoing Host header; a Worker
    // cannot set Host directly. Path, query, method and body ride along.
    const url = new URL(request.url);
    url.hostname = env.ORIGIN_HOST;
    url.protocol = 'https:';
    url.port = '';

    const upstream = new Request(url, request);
    // Do not forward the gate's own credentials to the origin: the app has its
    // own session auth and has no business seeing this password.
    upstream.headers.delete('Authorization');
    upstream.headers.set('X-Forwarded-Host', new URL(request.url).hostname);

    const response = await fetch(upstream);
    const out = new Response(response.body, response);
    out.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return out;
  },
};
