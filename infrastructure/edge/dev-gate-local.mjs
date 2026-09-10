// HTTP Basic auth gate for the DEV environment, as a local origin for the
// Cloudflare Tunnel.
//
// WHY THIS AND NOT THE WORKER. edge/dev-gate.js is the same gate for Cloudflare
// Workers and is the better long-term shape: it runs at Cloudflare's edge and
// needs no machine of ours. Deploying it needs Workers API access on the
// account that owns aifromscratch.shop, and the token on this machine belongs to
// a different account. The tunnel does not have that problem: its cert.pem was
// issued for this zone, so `cloudflared tunnel route dns` can create the
// hostname, and the tunnel can point that hostname at this process. Same gate,
// no API token, at the cost of pinning it to one machine.
//
// WHY NOT ASTRO MIDDLEWARE. web/astro.config.mjs sets no `output`, so Astro
// defaults to static with pages opting into server rendering via
// `prerender = false`. Middleware for a prerendered page runs at BUILD time, so
// a middleware gate leaves every static page -- the landing included -- served
// unauthenticated by the node standalone adapter. The gate has to be in front.
//
//   DEV_GATE_PASSWORD=... node edge/dev-gate-local.mjs
//
// The password comes from the environment. It is deliberately not in this repo:
// a password in git is a password to rotate, not one to hide.

import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8790);
const ORIGIN = process.env.ORIGIN_HOST ?? 'web-dev-a8ad.up.railway.app';
const USER = process.env.DEV_GATE_USER ?? 'dev';
const PASSWORD = process.env.DEV_GATE_PASSWORD ?? '';

// Fail closed. An unset password must never mean "no password required".
if (!PASSWORD) {
  console.error('DEV_GATE_PASSWORD is required. Refusing to start an open gate.');
  process.exit(1);
}

const enc = new TextEncoder();

/** Constant-time compare. `===` on a shared secret leaks it one character at a
 *  time to anyone who can measure the response. */
function sameSecret(a, b) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function authorised(header) {
  if (!header || !header.toLowerCase().startsWith('basic ')) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return false;
  }
  // Split on the FIRST colon only: a password containing one must still work.
  const at = decoded.indexOf(':');
  if (at < 0) return false;
  // Both compared, and both in constant time -- an early return on the username
  // would turn that field into an oracle for valid usernames.
  const okUser = sameSecret(decoded.slice(0, at), USER);
  const okPass = sameSecret(decoded.slice(at + 1), PASSWORD);
  return okUser && okPass;
}

const server = http.createServer(async (req, res) => {
  if (!authorised(req.headers.authorization)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="dev", charset="UTF-8"',
      // A cached 401 makes the gate look broken after a correct login.
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    res.end('Authentication required.\n');
    return;
  }

  // Collect the body before forwarding: undici needs a complete body for a
  // request it is going to retry, and streaming a Node IncomingMessage into
  // fetch requires duplex support that adds nothing here.
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    // host must be the ORIGIN, not the public hostname: Railway routes by Host
    // header and answers 404 for a name it does not serve.
    // The gate's own credentials stop here; the app has its own session auth.
    if (['host', 'authorization', 'connection', 'content-length'].includes(k)) continue;
    headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
  }
  headers.set('host', ORIGIN);
  headers.set('x-forwarded-host', String(req.headers.host ?? ''));

  try {
    const upstream = await fetch(`https://${ORIGIN}${req.url}`, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    });
    const out = new Headers(upstream.headers);
    out.delete('content-encoding');
    out.delete('content-length');
    out.delete('transfer-encoding');
    out.set('X-Robots-Tag', 'noindex, nofollow');
    res.writeHead(upstream.status, Object.fromEntries(out));
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    // Say which side failed. A bare 502 here sends people hunting in the app.
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`gate could not reach the origin (${ORIGIN}): ${e.message}\n`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`dev gate on http://127.0.0.1:${PORT} -> https://${ORIGIN} (user ${USER})`);
});
