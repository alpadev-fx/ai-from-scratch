import { createHash, randomUUID } from 'node:crypto';
import { COOKIE, DIAS_CONCESION_POR_DEFECTO, ESTADOS_SUSCRIPCION, EXTERNO_BLOQUEO, EXTERNO_CONCESION,
  FUENTE_BLOQUEO, FUENTE_CONCESION, MAX_DIAS_CONCESION, POLICY_VERSION, ROLES, TOKEN_MINUTES, cookieOpts,
  hashPassword, hashToken, mandaPlataforma, newToken, satisface, sign, spendKdf, suscripcionDe,
  ultimasManuales, verify, verifyPassword } from './core.ts';
import type { FilaManual } from './core.ts';

export * from './core.ts';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  pass_hash: string;
  role: string;
  lang: string;
  theme: string;
  paid: number;
  cohort: string | null;
  created_at: string;
  failed: number;
  locked_until: string | null;
  deleted_at: string | null;
  token_version: number;
}

export interface AuthDependencies {
  one<T>(operation: string, args?: Record<string, unknown>, actor?: number): Promise<T | null>;
  many<T>(operation: string, args?: Record<string, unknown>, actor?: number): Promise<T[]>;
  write(operation: string, args?: Record<string, unknown>, actor?: number): Promise<number>;
  writeAuthorized(operation: string, args: Record<string, unknown>, actor: number, authority: number): Promise<number>;
  origin: string;
  production: boolean;
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
  signal?: (name: string, payload: Record<string, unknown>) => Promise<void> | void;
  mailer?: { send(input: { to: string; subject: string; text: string }): Promise<void> };
  forgetTurns?: (userId: number) => Promise<{ ok: true } | { error: string }>;
}

export interface RequestLike { cookies?: Record<string, string>; headers?: Record<string, unknown>; body?: any }
export interface ReplyLike {
  code(status: number): ReplyLike;
  send(value: unknown): unknown;
  setCookie(name: string, value: string, options: unknown): void;
  clearCookie(name: string, options: unknown): void;
}

export const LANGS: readonly string[] = ['es', 'en', 'fr', 'pt', 'auto'];
export const THEMES: readonly string[] = ['dark', 'paper', 'auto'];
const LOGIN_NO = { error: 'credenciales' };
const MAX_FAILED = 5;
const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/;
const isLocked = (user: AuthUser | null | undefined): boolean =>
  Boolean(user?.locked_until && Date.parse(user.locked_until) > Date.now());
const pref = (value: unknown, allowed: readonly string[]): string =>
  typeof value === 'string' && allowed.includes(value) ? value : 'auto';
const subject = (email: unknown): string =>
  `account:${createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 20)}`;

// The welcome mail on successful registration (AI-36). Spanish is the
// product-copy default everywhere else server-side (lesson-meta.ts,
// assess.ts, grading.ts all key off `lang === 'en'` with Spanish as the
// fallback for everything else, including 'auto'); English is an explicit
// overlay, never the other way around. Plain text only -- mail.ts's Mailer
// has no HTML layer today.
//
// Content is deliberately narrow: what they signed up for, the one link to
// get in, and the 14-day guarantee -- and nothing this platform cannot keep.
// It must never promise a heads-up email before a charge: no job in this
// codebase sends one, so that promise would be a lie the first time someone
// tested it.
const WELCOME_MAIL: Record<'es' | 'en', { subject: string; body: (name: string, link: string) => string }> = {
  es: {
    subject: 'Bienvenida a IA desde cero',
    body: (name, link) => [
      `Hola, ${name}.`,
      'Tu cuenta en IA desde cero ya está lista. Empiezas con la lección 1, gratis; el curso completo son 12 lecciones y 36 labs, en español e inglés.',
      `Entra aquí: ${link}`,
      'Si más adelante te llevas el curso completo, tienes 14 días de garantía desde el primer cobro, sin explicar por qué.',
    ].join('\n\n'),
  },
  en: {
    subject: 'Welcome to IA desde cero',
    body: (name, link) => [
      `Hi ${name},`,
      'Your IA desde cero account is ready. You start with lesson 1, free; the full course is 12 lessons and 36 labs, in Spanish and English.',
      `Log in here: ${link}`,
      'If you take the full course later, you get a 14-day guarantee from the first charge, no reason needed.',
    ].join('\n\n'),
  },
};

const welcomeMailFor = (lang: string, origin: string, name: string): { subject: string; text: string } => {
  const copy = lang === 'en' ? WELCOME_MAIL.en : WELCOME_MAIL.es;
  return { subject: copy.subject, text: copy.body(name, `${origin}/login`) };
};

export const shapeUser = (user: AuthUser) => ({
  id: user.id, email: user.email, name: user.name, role: user.role,
  lang: user.lang, theme: user.theme, paid: Boolean(user.paid), cohort: user.cohort,
});

export function createAuth(deps: AuthDependencies) {
  const emit = async (name: string, payload: Record<string, unknown>): Promise<void> => {
    try { await deps.signal?.(name, payload); }
    catch (error) { deps.log.warn({ error, signal: name }, 'auth signal was not published'); }
  };

  async function resolveSession(token: unknown): Promise<AuthUser | null> {
    const claims = verify(token);
    if (!claims?.sub) return null;
    const user = await deps.one<AuthUser>('auth.user', {}, claims.sub);
    return user && (claims.v ?? 0) === user.token_version ? user : null;
  }

  const currentUser = (request: RequestLike): Promise<AuthUser | null> => {
    const bearer = String(request.headers?.['x-user-session'] ?? '').replace(/^Bearer\s+/i, '');
    return resolveSession(request.cookies?.[COOKIE] ?? bearer);
  };

  async function requireUser(request: RequestLike, reply: ReplyLike): Promise<AuthUser | null> {
    const user = await currentUser(request);
    if (!user) { reply.code(401).send({ error: 'no_session' }); return null; }
    const throttle = await deps.one<{ expires_at: string }>('auth.throttle', {}, user.id);
    if (throttle) {
      const retryAfter = Math.max(1, Math.ceil((Date.parse(throttle.expires_at) - Date.now()) / 1000));
      reply.code(429).send({ error: 'identity_throttled', retryAfter });
      return null;
    }
    return user;
  }

  async function requireRole(request: RequestLike, reply: ReplyLike,
    roles: readonly string[]): Promise<AuthUser | null> {
    const user = await requireUser(request, reply);
    if (!user) return null;
    // satisface, no includes: root cumple cualquier exigencia sin que las
    // veintitres llamadas tengan que nombrarlo. Ver CONTIENE en core.ts.
    if (!satisface(user.role, roles)) { reply.code(403).send({ error: 'forbidden', need: roles }); return null; }
    return user;
  }

  function registerRoutes(app: any): void {
    app.post('/api/auth/login', async (request: RequestLike, reply: ReplyLike) => {
      const { email, password, lang, theme } = request.body ?? {};
      if (!email || !password) return reply.code(400).send({ error: 'faltan_datos' });
      const plain = String(password);
      const user = await deps.one<AuthUser>('auth.user_by_email', { login: String(email).toLowerCase() });
      const ok = user ? await verifyPassword(plain, user.pass_hash) : await spendKdf(plain);
      if (!ok) {
        if (user && !isLocked(user)) {
          const failed = user.failed + 1;
          await deps.write('auth.login_failure', { failed, locked: failed >= MAX_FAILED }, user.id);
        }
        await emit('auth.login_failed', { subject: subject(email), target: user ? String(user.id) : undefined,
          accountKnown: Boolean(user) });
        return reply.code(401).send(LOGIN_NO);
      }
      if (isLocked(user)) {
        await emit('auth.login_locked', { subject: subject(email), target: String(user!.id) });
        return reply.code(423).send({ error: 'bloqueada', until: user!.locked_until });
      }
      await deps.write('auth.login_clear', {}, user!.id);
      if (user!.lang === 'auto' && typeof lang === 'string' && LANGS.includes(lang as any) && lang !== 'auto') {
        await deps.write('auth.set_language', { lang }, user!.id);
      }
      if (user!.theme === 'auto' && typeof theme === 'string' && THEMES.includes(theme as any) && theme !== 'auto') {
        await deps.write('auth.set_theme', { theme }, user!.id);
      }
      reply.setCookie(COOKIE, sign({ sub: user!.id, role: user!.role, v: user!.token_version }), cookieOpts);
      const fresh = await deps.one<AuthUser>('auth.user', {}, user!.id);
      await emit('auth.login_succeeded', { subject: String(user!.id), target: String(user!.id) });
      return { user: shapeUser(fresh!) };
    });

    app.post('/api/auth/logout', async (request: RequestLike, reply: ReplyLike) => {
      if (request.body?.todos === true) {
        const user = await currentUser(request);
        if (user) await deps.write('auth.revoke_session', {}, user.id);
      }
      reply.clearCookie(COOKIE, { path: '/' });
      return { ok: true };
    });

    app.post('/api/auth/register', async (request: RequestLike, reply: ReplyLike) => {
      const { email, name, password, lang, theme } = request.body ?? {};
      if (request.body?.acepta !== true) return reply.code(400).send({ error: 'falta_consentimiento' });
      const mail = String(email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(mail)) return reply.code(400).send({ error: 'correo_invalido' });
      if (String(name ?? '').trim().length < 2) return reply.code(400).send({ error: 'nombre_corto' });
      if (String(password ?? '').length < 8) return reply.code(400).send({ error: 'clave_corta', msg: 'Mínimo 8 caracteres.' });
      if (await deps.one<AuthUser>('auth.user_by_email', { login: mail })) {
        return reply.code(409).send({ error: 'correo_en_uso' });
      }
      const user = await deps.one<AuthUser>('auth.register', {
        login: mail, name: String(name).trim(), password: await hashPassword(String(password)),
        lang: pref(lang, LANGS), theme: pref(theme, THEMES),
        consent_at: new Date().toISOString(), consent_version: POLICY_VERSION,
      });
      reply.setCookie(COOKIE, sign({ sub: user!.id, role: user!.role, v: user!.token_version }), cookieOpts);
      await emit('auth.account_registered', { subject: String(user!.id), target: String(user!.id) });
      // Never on the critical path: the account is already committed above, and
      // a 500 here because Resend is down would be worse than a signup with no
      // welcome mail. `mailer` undefined is the fail-closed "unconfigured" state
      // (see mail.ts) -- logged, never a silent miss and never a fallback sender.
      if (deps.mailer) {
        const { subject: welcomeSubject, text: welcomeText } = welcomeMailFor(user!.lang, deps.origin, user!.name);
        try {
          await deps.mailer.send({ to: mail, subject: welcomeSubject, text: welcomeText });
        } catch (error) {
          deps.log.error({ error, userId: user!.id }, 'welcome mail failed to send');
        }
      } else {
        deps.log.info({ userId: user!.id }, 'welcome mail skipped: no mail provider configured');
      }
      return reply.code(201).send({ user: shapeUser(user!) });
    });

    app.post('/api/auth/recover', async (request: RequestLike, reply: ReplyLike) => {
      if (deps.production && !deps.mailer) {
        return reply.code(503).send({ error: 'correo_no_configurado' });
      }
      const mail = String(request.body?.email ?? '').trim().toLowerCase();
      const answer = { ok: true, msg: 'Si ese correo tiene cuenta, el enlace ya salió.' };
      if (!EMAIL_RE.test(mail)) return reply.code(400).send({ error: 'correo_invalido' });
      const user = await deps.one<Pick<AuthUser, 'id' | 'name'>>(
        'auth.recovery_by_email', { login: mail });
      if (!user) return answer;
      const rate = await deps.one<{ c: number }>('auth.reset_rate', {}, user.id);
      if ((rate?.c ?? 0) >= 3) {
        deps.log.warn({ userId: user.id }, 'recover: hourly limit reached');
        await emit('auth.recovery_rate_limited', { subject: String(user.id), target: String(user.id) });
        return answer;
      }
      const token = newToken();
      await deps.write('auth.reset_create', { token: hashToken(token), minutes: TOKEN_MINUTES }, user.id);
      const link = `${deps.origin}/recuperar?t=${token}`;
      if (deps.mailer) {
        // A send failure must not escape. This route answers identically whether
        // or not the account exists (that is the whole point of `answer`), and an
        // uncaught throw turns it into an enumeration oracle: a registered address
        // 500s while an unknown one 200s, so anyone can harvest the user list by
        // walking a wordlist. Loud in the log, uniform to the caller.
        try {
          await deps.mailer.send({
            to: mail, subject: 'Recuperar acceso',
            text: `Abre este enlace para cambiar la clave: ${link}`,
          });
        } catch (err) {
          deps.log.error({ err, userId: user.id }, 'recover: mail send failed');
        }
      } else {
        deps.log.info({ link }, 'recover: link generated (no mail provider configured)');
      }
      return deps.production ? answer : { ...answer, dev_enlace: link };
    });

    app.post('/api/auth/reset', async (request: RequestLike, reply: ReplyLike) => {
      const { token, password } = request.body ?? {};
      if (String(password ?? '').length < 8) {
        return reply.code(400).send({ error: 'clave_corta', msg: 'Mínimo 8 caracteres.' });
      }
      const row = await deps.one<{ id: number; user_id: number; used_at: string | null; expired: boolean }>(
        'auth.reset_lookup', { token: hashToken(String(token ?? '')) });
      if (!row) return reply.code(400).send({ error: 'enlace_invalido', msg: 'Ese enlace no sirve. Pide uno nuevo.' });
      if (row.used_at) return reply.code(409).send({ error: 'enlace_usado', msg: 'Ese enlace ya se usó. Pide uno nuevo.' });
      if (row.expired) return reply.code(410).send({ error: 'enlace_vencido', msg: `El enlace dura ${TOKEN_MINUTES} minutos. Pide uno nuevo.` });
      const user = await deps.one<AuthUser>(
        'auth.password_reset', { password: await hashPassword(String(password)) }, row.user_id);
      await deps.write('auth.reset_mark_used', { token: row.id });
      await deps.write('auth.reset_invalidate', {}, row.user_id);
      reply.setCookie(COOKIE, sign({ sub: user!.id, role: user!.role, v: user!.token_version }), cookieOpts);
      await emit('auth.password_reset', { subject: String(user!.id), target: String(user!.id) });
      return { user: shapeUser(user!), sesionesCerradas: true };
    });

    app.post('/api/account/delete', async (request: RequestLike, reply: ReplyLike) => {
      const user = await requireUser(request, reply); if (!user) return;
      if (!await verifyPassword(String(request.body?.password ?? ''), user.pass_hash)) {
        return reply.code(401).send({ error: 'clave_incorrecta', msg: 'Confirma con tu contraseña actual.' });
      }
      if (mandaPlataforma(user.role)) {
        const admins = await deps.one<{ c: number }>('auth.admin_count');
        if ((admins?.c ?? 0) <= 1) return reply.code(409).send({ error: 'ultimo_admin', msg: 'No puedes dejar la plataforma sin admins.' });
      }
      if (deps.forgetTurns) {
        const purged = await deps.forgetTurns(user.id);
        if ('error' in purged) return reply.code(503).send({ error: 'borrado_incompleto' });
      }
      await deps.write('auth.account_delete', { replacement: `borrado+${user.id}@alpadev.local` }, user.id);
      await deps.write('ranking.delete', {}, user.id);
      reply.clearCookie(COOKIE, { path: '/' });
      await emit('auth.account_deleted', { subject: String(user.id), target: String(user.id) });
      return { ok: true, deleted: user.id };
    });

    app.get('/api/me', async (request: RequestLike, reply: ReplyLike) => {
      const user = await requireUser(request, reply); if (!user) return;
      return { user: shapeUser(user) };
    });

    app.patch('/api/settings', async (request: RequestLike, reply: ReplyLike) => {
      const user = await requireUser(request, reply); if (!user) return;
      const { lang, theme } = request.body ?? {};
      if (lang && (typeof lang !== 'string' || !LANGS.includes(lang as any))) return reply.code(400).send({ error: 'lang' });
      if (theme && (typeof theme !== 'string' || !THEMES.includes(theme as any))) return reply.code(400).send({ error: 'theme' });
      if (lang) await deps.write('auth.set_language', { lang }, user.id);
      if (theme) await deps.write('auth.set_theme', { theme }, user.id);
      const saved = await deps.one<AuthUser>('auth.user', {}, user.id);
      return { user: shapeUser(saved!) };
    });

    // Roles are authorization state, so their mutation belongs here too. Course
    // administration may consume the result but does not implement RBAC.
    // La lista lleva el estado de suscripción de cada cuenta, no solo `paid`.
    // `paid` es un sí/no y la pantalla tiene que distinguir «no ha pagado nunca»
    // de «se le cortó a mano»: sin esa diferencia, un admin que corta una cuenta
    // ve exactamente lo mismo que antes de cortarla y no sabe si la acción entró.
    app.get('/api/admin/users', async (request: RequestLike, reply: ReplyLike) => {
      const actor = await requireRole(request, reply, ['admin']); if (!actor) return;
      const [users, manuales] = await Promise.all([
        deps.many<{ id: number; paid: number }>('auth.admin_users'),
        deps.many<FilaManual>('auth.admin_entitlements'),
      ]);
      const ultimas = ultimasManuales(manuales);
      return { users: users.map((u) => ({ ...u, suscripcion: suscripcionDe(u.paid, ultimas, u.id) })) };
    });

    app.patch('/api/admin/users/:id/role', async (request: RequestLike & { params?: { id?: unknown } }, reply: ReplyLike) => {
      const actor = await requireRole(request, reply, ['admin']); if (!actor) return;
      const targetId = Number(request.params?.id);
      const target = Number.isSafeInteger(targetId) && targetId > 0
        ? await deps.one<AuthUser>('auth.user', {}, targetId) : null;
      const role = request.body?.role;
      if (!target) return reply.code(404).send({ error: 'no_existe' });
      if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) {
        return reply.code(400).send({ error: 'rol_invalido' });
      }
      // El rol root lo reparte root, en las dos direcciones.
      //
      // Sin esto la separacion admin//root no existia donde importa. El resto
      // del sistema se esfuerza en que un admin NO lea el registro global --
      // ver el comentario sobre /api/root/solved-labs en api/src/server.ts, que
      // razona que «this platform-wide view must never become available to every
      // administrator». Pero esta ruta exigia solo ['admin'] y aceptaba
      // role: 'root', asi que la guarda de lectura se saltaba con un <select>:
      // un admin se elegia a si mismo, marcaba Root, y en esa misma peticion
      // ganaba todo lo que se le habia guardado.
      //
      // La direccion contraria importa igual. Sin la mitad `target.role`, un
      // admin podia degradar al unico root a estudiante -- pasa el control de
      // abajo mientras queden dos admins -- y quedarse mandando sobre una
      // plataforma sin root. Quitar el rol es tan privilegiado como darlo.
      //
      // No hay problema de arranque: el primer root no se crea aqui, sale de la
      // base al desplegar. Si algun dia no hubiera ninguno, se crea por SQL, que
      // es donde ya vive esa decision.
      if ((role === 'root' || target.role === 'root') && !satisface(actor.role, ['root'])) {
        return reply.code(403).send({ error: 'solo_root',
          msg: 'Solo un root puede dar o quitar el rol root.' });
      }

      // «quedarse sin admins» incluye a root: degradar al ultimo root deja la
      // plataforma igual de huerfana que degradar al ultimo admin.
      if (mandaPlataforma(target.role) && !mandaPlataforma(role)) {
        if (target.id === actor.id) return reply.code(409).send({ error: 'auto_degradacion',
          msg: 'No puedes quitarte a ti mismo el mando de la plataforma. Pídeselo a otro admin.' });
        const admins = await deps.one<{ c: number }>('auth.admin_count');
        if ((admins?.c ?? 0) <= 1) return reply.code(409).send({ error: 'ultimo_admin', msg: 'No puedes dejar la plataforma sin admins.' });
      }
      await deps.write('auth.role_change', { role }, target.id);
      await deps.writeAuthorized('auth.role_audit', {
        from_role: target.role, to_role: role,
      }, target.id, actor.id);
      const fresh = await deps.one<AuthUser>('auth.user', {}, target.id);
      await emit('auth.role_changed', { subject: String(target.id), target: String(target.id),
        actor: String(actor.id), from: target.role, to: role });
      return { user: shapeUser(fresh!) };
    });

    // ACTIVAR O CORTAR EL ACCESO A MANO, sin cupón y sin pasar por Mercado Pago.
    //
    // Escribe eventos en la MISMA tabla que un webhook firmado, a propósito. La
    // alternativa obvia -- una columna `suscripcion` en `users` que el admin
    // ponga -- se descartó porque `auth.entitlement_sweep` recalcula users.paid
    // desde entitlement_events cada hora: la concesión a mano habría durado
    // hasta el siguiente barrido y el acceso se habría cerrado solo, sin rastro.
    //
    // Son dos filas por acción, una por fuente, porque el estado es una pareja
    // (concede / corta) y no un valor: escribir solo una dejaría la otra como
    // estaba, así que pasar de «cancelada» a «activa» habría dejado el corte
    // puesto y la concesión no habría hecho nada visible.
    app.patch('/api/admin/users/:id/suscripcion',
      async (request: RequestLike & { params?: { id?: unknown } }, reply: ReplyLike) => {
      const actor = await requireRole(request, reply, ['admin']); if (!actor) return;
      const targetId = Number(request.params?.id);
      const target = Number.isSafeInteger(targetId) && targetId > 0
        ? await deps.one<AuthUser>('auth.user', {}, targetId) : null;
      if (!target) return reply.code(404).send({ error: 'no_existe' });

      const estado = request.body?.estado;
      if (typeof estado !== 'string' || !(ESTADOS_SUSCRIPCION as readonly string[]).includes(estado)) {
        return reply.code(400).send({ error: 'estado_invalido',
          msg: `El estado tiene que ser uno de: ${ESTADOS_SUSCRIPCION.join(', ')}.` });
      }
      const concede = estado === 'activa';
      // LOS DÍAS SE VALIDAN SOLO AL ACTIVAR, y esa asimetría es deliberada.
      //
      // Al activar hay que ser estricto: aceptar un 0 y descartarlo luego sería
      // la clase de silencio que hace que el admin crea que concedió un mes.
      //
      // Al cortar NO hay nada que creer, y validarlos igual costaba un corte.
      // Medido en /admin: la caja de días se queda con el valor de la acción
      // anterior, así que poner «No activa» con un 0 dentro devolvía 400
      // dias_invalidos y el acceso seguía abierto mientras la pantalla decía que
      // el cambio se había rechazado por los días -- un campo que para ese
      // estado no significa nada. Un corte de acceso no puede depender de una
      // caja que no participa en él.
      const crudos = request.body?.dias;
      const dias = crudos === undefined || crudos === null || crudos === ''
        ? DIAS_CONCESION_POR_DEFECTO : Number(crudos);
      if (concede && (!Number.isInteger(dias) || dias < 1 || dias > MAX_DIAS_CONCESION)) {
        return reply.code(400).send({ error: 'dias_invalidos',
          msg: `Los días tienen que ser un entero entre 1 y ${MAX_DIAS_CONCESION}.` });
      }

      const bloquea = estado === 'cancelada';
      const ahora = new Date();
      const hasta = concede ? new Date(ahora.getTime() + dias * 86_400_000).toISOString() : null;
      // El event_key es único por acción y no idempotente a propósito: un
      // webhook se reintenta y tiene que colapsar, un clic de un admin es una
      // decisión nueva cada vez. Lleva dentro quién la tomó, que es el único
      // registro de autoría que queda de esta acción.
      const clave = (fuente: string) =>
        `${fuente}:por:${actor.id}:sobre:${target.id}:${ahora.toISOString()}:${randomUUID()}`;

      await deps.write('auth.entitlement_record', {
        event: clave(FUENTE_CONCESION), active: concede, source: FUENTE_CONCESION,
        external: EXTERNO_CONCESION, occurred: ahora.toISOString(), period: hasta ?? '',
      }, target.id);
      await deps.write('auth.entitlement_record', {
        event: clave(FUENTE_BLOQUEO), active: bloquea, source: FUENTE_BLOQUEO,
        external: EXTERNO_BLOQUEO, occurred: ahora.toISOString(), period: '',
      }, target.id);
      const latest = await deps.one<{ paid: number }>('auth.entitlement_apply', {}, target.id);

      // El estado que se devuelve sale de la MISMA función que lo pinta en la
      // lista, alimentada con las dos filas que se acaban de escribir. Deducirlo
      // aquí a mano sería una segunda copia de la regla.
      const suscripcion = suscripcionDe(Boolean(latest?.paid), new Map<string, FilaManual>([
        [`${target.id}:${FUENTE_CONCESION}`,
          { user_id: target.id, source: FUENTE_CONCESION, active: concede, period_end: hasta }],
        [`${target.id}:${FUENTE_BLOQUEO}`,
          { user_id: target.id, source: FUENTE_BLOQUEO, active: bloquea, period_end: null }],
      ]), target.id);

      deps.log.info({ adminId: actor.id, userId: target.id, estado, dias: concede ? dias : null,
        paid: suscripcion.estado === 'activa' }, 'admin subscription change');
      await emit('subscription.admin_set', { subject: String(target.id), target: String(target.id),
        actor: String(actor.id), estado, hasta });
      return { user: { id: target.id, name: target.name, email: target.email }, suscripcion };
    });
  }

  // `periodEnd` es lo que separa una compra de una suscripcion. Vacio significa
  // "sin vencimiento", que es como se comportaba TODO evento antes de este
  // cambio: quien compro el curso bajo el modelo de pago unico conserva su
  // acceso, porque su fila tiene period_end NULL y la derivacion la respeta.
  async function applyEntitlement(event: { eventKey: string; userId: number; active: boolean;
    source: string; externalId: string; occurredAt: string; periodEnd?: string }): Promise<{ accepted: boolean; active: boolean }> {
    const inserted = await deps.write('auth.entitlement_record', {
      event: event.eventKey, active: event.active, source: event.source,
      external: event.externalId, occurred: event.occurredAt, period: event.periodEnd ?? '',
    }, event.userId);
    const latest = await deps.one<{ paid: number }>('auth.entitlement_apply', {}, event.userId);
    const active = Boolean(latest?.paid);
    await emit(active ? 'subscription.entitlement_granted' : 'subscription.entitlement_revoked',
      { subject: String(event.userId), target: String(event.userId), source: event.source,
        externalId: event.externalId, duplicate: inserted === 0 });
    return { accepted: inserted > 0, active };
  }

  async function applyDefenseAction(action: { kind: string; target: string; ttlSeconds: number;
    why?: string }): Promise<{ applied: boolean }> {
    const userId = Number(action.target);
    if (!Number.isSafeInteger(userId) || userId < 1) return { applied: false };
    if (action.kind === 'revoke_session') {
      const changed = await deps.write('auth.revoke_session', {}, userId);
      return { applied: changed > 0 };
    }
    if (action.kind === 'throttle_identity') {
      const ttl = Math.min(6 * 60 * 60, Math.max(60, Math.floor(action.ttlSeconds || 900)));
      const changed = await deps.write('auth.throttle_upsert', {
        seconds: ttl, reason: String(action.why ?? 'security containment').slice(0, 500),
      }, userId);
      return { applied: changed > 0 };
    }
    return { applied: false };
  }

  return { currentUser, requireUser, requireRole, registerRoutes, applyEntitlement, applyDefenseAction,
    shape: shapeUser, langs: LANGS, themes: THEMES };
}
