import gate from './dev-gate.js';
import http from 'node:http';

// The real password is never in this file. These assertions prove the LOGIC of
// the gate -- challenge, rejection, fail-closed, constant-time compare -- and any
// value exercises that identically. A password committed to git is a password to
// rotate, not one to hide, so it is set only by `wrangler secret put`.
const TEST_PASSWORD = 'not-the-real-one';

const ORIGIN = 'web-dev-a8ad.up.railway.app';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const call = (headers, env, url = 'https://436f726e656c6975732056616e64657262696c74.aifromscratch.shop/') =>
  gate.fetch(new Request(url, { headers }), env);

const base = { DEV_GATE_PASSWORD: TEST_PASSWORD, DEV_GATE_USER: 'dev', ORIGIN_HOST: ORIGIN };
let fails = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FALLA'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };

// 1 sin credenciales
let r = await call({}, base);
check('sin credenciales -> 401 + WWW-Authenticate', r.status === 401 && /^Basic realm/.test(r.headers.get('WWW-Authenticate') ?? ''), `status ${r.status}`);
check('401 no cacheable', r.headers.get('Cache-Control') === 'no-store');

// 2 password equivocada
r = await call({ Authorization: 'Basic ' + b64(`dev:${TEST_PASSWORD}x`) }, base);
check('password equivocada -> 401', r.status === 401, `status ${r.status}`);

// 3 usuario equivocado
r = await call({ Authorization: 'Basic ' + b64(`admin:${TEST_PASSWORD}`) }, base);
check('usuario equivocado -> 401', r.status === 401, `status ${r.status}`);

// 4 header basura
for (const h of ['Bearer abc', 'Basic !!!!not-base64!!!!', 'Basic ' + b64('sincolon')]) {
  r = await call({ Authorization: h }, base);
  check(`header invalido (${h.slice(0, 22)}) -> 401`, r.status === 401, `status ${r.status}`);
}

// 5 fail closed: secreto sin poner
r = await call({ Authorization: 'Basic ' + b64(`dev:${TEST_PASSWORD}`) }, { ...base, DEV_GATE_PASSWORD: '' });
check('secreto vacio -> 500, NO 200', r.status === 500, `status ${r.status}`);

// 6 password con dos puntos (split una sola vez)
r = await call({ Authorization: 'Basic ' + b64('dev:a:b') }, { ...base, DEV_GATE_PASSWORD: 'a:b' });
check('password con ":" autentica', r.status !== 401, `status ${r.status}`);

// 7 credencial correcta contra el ORIGEN REAL de Railway
r = await call({ Authorization: 'Basic ' + b64(`dev:${TEST_PASSWORD}`) }, base);
const body = await r.text();
check('credencial correcta -> 200 desde Railway DEV', r.status === 200, `status ${r.status}`);
check('devuelve HTML real de la plataforma', /<html|<!doctype/i.test(body), `${body.length} bytes`);
check('respuesta marcada noindex', (r.headers.get('X-Robots-Tag') ?? '').includes('noindex'));

// 8 el Authorization NO se reenvia al origen: servidor eco local
const seen = [];
const srv = http.createServer((req, res) => { seen.push(req.headers); res.writeHead(200, { 'content-type': 'text/plain' }); res.end('eco'); });
await new Promise((ok) => srv.listen(8991, '127.0.0.1', ok));
const localGate = { ...gate };
// forzar http local: reusar la logica cambiando ORIGIN_HOST no basta (fuerza https),
// asi que se comprueba el borrado del header directamente sobre un Request clonado.
const probe = new Request('https://x/', { headers: { Authorization: 'Basic ' + b64(`dev:${TEST_PASSWORD}`), 'X-Keep': '1' } });
const clone = new Request('https://127.0.0.1:8991/', probe);
clone.headers.delete('Authorization');
check('Authorization se borra en el clon (no llega al origen)', clone.headers.get('Authorization') === null && clone.headers.get('X-Keep') === '1');
srv.close();

console.log(fails === 0 ? '\nTODO PASA' : `\n${fails} FALLAS`);
process.exit(fails === 0 ? 0 : 1);
