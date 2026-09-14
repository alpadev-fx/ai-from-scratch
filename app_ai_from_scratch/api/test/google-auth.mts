// Entrar con Google: las decisiones, no el HTTP.
//
// POR QUÉ ESTA PRUEBA EXISTE
// El agujero clásico de «entrar con un proveedor» no está en la red: está en
// decidir QUÉ CUENTA abre un token. `users.email` es UNIQUE, así que una
// identidad que llega con un correo ya registrado solo puede acabar vinculada a
// esa fila. Si el correo no viniera probado, cualquiera capaz de conseguir un
// token con la dirección de otra persona entraría en su cuenta sin saber la
// contraseña — y el login por contraseña es hoy la única prueba de posesión.
//
// Por eso aquí se comprueba sobre todo lo que hay que RECHAZAR: token de otra
// aplicación, token caducado, nonce que no corresponde, correo sin verificar y
// estado firmado que no cuadra. Un test que solo compruebe el camino feliz deja
// pasar las cinco.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  ESTADO_MINUTOS, configGoogle, decidirCuenta, firmarEstado, identidadDe,
  leerEstado, leerIdToken, urlAutorizacion,
} from '../../auth/src/google.ts';

const CLIENT_ID = '123-abc.apps.googleusercontent.com';
const cfg = { clientId: CLIENT_ID, clientSecret: 'secreto', redirectUri: 'https://x.test/cb' };
const AHORA = 1_800_000_000_000;
const firmar = (data: string) => createHmac('sha256', 'clave-de-prueba').update(data).digest('base64url');

const tokenCon = (claims: Record<string, unknown>): string => {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'RS256' })}.${b(claims)}.firma-que-no-se-comprueba-aqui`;
};
const claimsBase = {
  iss: 'https://accounts.google.com', aud: CLIENT_ID,
  exp: Math.floor(AHORA / 1000) + 600, sub: 'g-1', email: 'Ana@Example.test',
  email_verified: true, name: 'Ana Pérez', nonce: 'n-1',
};

// ---------- configuración: todo o nada ----------
assert.equal(configGoogle({} as NodeJS.ProcessEnv), null, 'sin variables debería quedar apagado');
assert.equal(
  configGoogle({ GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' } as NodeJS.ProcessEnv), null,
  'sin redirect_uri no puede quedar medio configurado: el código viajaría a otro sitio');
assert.ok(configGoogle({
  GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', GOOGLE_REDIRECT_URI: 'z',
} as NodeJS.ProcessEnv));

// ---------- la url de ida lleva lo que tiene que llevar ----------
{
  const url = new URL(urlAutorizacion(cfg, 'estado-firmado', 'n-1'));
  assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(url.searchParams.get('redirect_uri'), cfg.redirectUri);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), 'estado-firmado');
  assert.equal(url.searchParams.get('nonce'), 'n-1');
  assert.equal(url.searchParams.get('prompt'), 'select_account',
    'sin select_account se entra con la cuenta que Google tenga activa por casualidad');
}

// ---------- el estado: firmado, caducable y no fabricable ----------
{
  const firmado = firmarEstado({ nonce: 'n-1', acepta: true, t: AHORA }, firmar);
  const leido = leerEstado(firmado, firmar, AHORA + 1000);
  assert.ok(leido, 'un estado recién firmado debería leerse');
  assert.equal(leido!.nonce, 'n-1');
  assert.equal(leido!.acepta, true);

  // Manipulado: mismo cuerpo, firma de otro.
  const otro = (d: string) => createHmac('sha256', 'otra-clave').update(d).digest('base64url');
  const falso = firmarEstado({ nonce: 'n-1', acepta: true, t: AHORA }, otro);
  assert.equal(leerEstado(falso, firmar, AHORA), null, 'una firma ajena no puede colar');

  // Cuerpo cambiado a mano para regalarse el consentimiento.
  const [cuerpo, firma] = firmado.split('.') as [string, string];
  const trucado = Buffer.from(JSON.stringify({ nonce: 'n-1', acepta: true, t: AHORA }))
    .toString('base64url');
  assert.equal(leerEstado(`${trucado}x.${firma}`, firmar, AHORA), null,
    'cambiar el cuerpo invalida la firma');
  assert.ok(cuerpo.length > 0);

  assert.equal(leerEstado(firmado, firmar, AHORA + (ESTADO_MINUTOS + 1) * 60_000), null,
    'un estado viejo tiene que caducar');
  assert.equal(leerEstado('', firmar, AHORA), null);
  assert.equal(leerEstado('sin-punto', firmar, AHORA), null);
}

// ---------- el id_token: lo que se rechaza ----------
{
  const bien = identidadDe(leerIdToken(tokenCon(claimsBase)), cfg, 'n-1', AHORA);
  assert.equal(bien.ok, true);
  assert.equal(bien.ok === true && bien.identidad.sub, 'g-1');
  assert.equal(bien.ok === true && bien.identidad.email, 'ana@example.test',
    'el correo se normaliza a minúsculas: la columna es UNIQUE y compara así');
  assert.equal(bien.ok === true && bien.identidad.nombre, 'Ana Pérez');

  const no = (claims: Record<string, unknown>, motivo: string, nonce = 'n-1') => {
    const r = identidadDe(leerIdToken(tokenCon({ ...claimsBase, ...claims })), cfg, nonce, AHORA);
    assert.equal(r.ok, false, `debería rechazarse por ${motivo}`);
    assert.equal(r.ok === false && r.error, motivo);
  };

  // EL CASO QUE IMPORTA: correo sin verificar. Sin esto, un token con el correo
  // de otra persona abre su cuenta.
  no({ email_verified: false }, 'correo_sin_verificar');
  no({ email_verified: 'true' }, 'correo_sin_verificar');   // la cadena "true" no es true
  // Token emitido para OTRA aplicación de Google.
  no({ aud: 'otra-app.apps.googleusercontent.com' }, 'audiencia');
  no({ iss: 'https://evil.test' }, 'emisor');
  no({ exp: Math.floor(AHORA / 1000) - 1 }, 'caducado');
  no({}, 'nonce', 'otro-nonce');
  no({ sub: '' }, 'sin_sujeto');
  no({ email: '' }, 'sin_correo');

  const roto = identidadDe(leerIdToken('no-es-un-jwt'), cfg, 'n-1', AHORA);
  assert.equal(roto.ok, false);
  assert.equal(roto.ok === false && roto.error, 'token_ilegible');
}

// ---------- la decisión: qué cuenta abre ----------
{
  // Ya vinculada: manda el sub, no el correo. El correo de una cuenta de Google
  // puede cambiar; el sub no.
  assert.deepEqual(
    decidirCuenta({ porGoogle: { id: 7 }, porEmail: { id: 9 }, sub: 'g-1', acepta: false }),
    { accion: 'entrar', userId: 7 });

  // Existe por correo y no tiene identidad: se vincula. No hay alternativa,
  // email es UNIQUE.
  assert.deepEqual(
    decidirCuenta({ porGoogle: null, porEmail: { id: 9, google_sub: null }, sub: 'g-1', acepta: false }),
    { accion: 'vincular', userId: 9 });

  // Ya tiene OTRA identidad de Google: no se pisa. Sobrescribirla sería
  // entregar la cuenta a la segunda identidad que llegue.
  assert.deepEqual(
    decidirCuenta({ porGoogle: null, porEmail: { id: 9, google_sub: 'g-viejo' }, sub: 'g-1', acepta: false }),
    { accion: 'conflicto_sujeto', userId: 9 });

  // No existe y no aceptó: no se crea. El registro por contraseña exige
  // consentimiento explícito y guarda consent_at; por aquí no puede colarse.
  assert.deepEqual(
    decidirCuenta({ porGoogle: null, porEmail: null, sub: 'g-1', acepta: false }),
    { accion: 'falta_consentimiento' });

  assert.deepEqual(
    decidirCuenta({ porGoogle: null, porEmail: null, sub: 'g-1', acepta: true }),
    { accion: 'crear' });
}

console.log('google-auth: 30 comprobaciones verdes');
