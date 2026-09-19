// The lesson page, in a browser, in both languages.
//
// WHAT THIS ADDS OVER THE API SUITES
// api/test/lessons.mts proves the course is coherent and api/test/lessons-http.mts
// proves the routes serve it. Neither runs a line of the lesson page's own
// JavaScript, and that is where the reader actually meets the lesson: twelve
// animated scenes that parse the example text at runtime, six lab widgets that
// build their own DOM, and a narrator and tutorial layered on top of both.
//
// Every one of those degrades silently BY DESIGN — scenes/mount.ts puts the
// static rows back if a scene throws, and mountLabs() wraps each render in a
// try/catch so one broken widget cannot take the page down. That is the right
// behaviour and it is exactly why a browser has to look: a lesson whose scene
// never mounts and whose lab never renders still returns HTTP 200 with all its
// text, and every other gate stays green.
//
// SIX LESSONS, NOT TWELVE, and the reason is the mechanics rather than the
// lessons: 1 (choice/build/order), 2 (hotcold), 3 (hotcold), 5 (cut), 6 (build),
// 9 (knob) between them render every widget the course has. The other six draw
// the same widgets with different words, and the API suites already walk all
// twelve.

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const API = process.env.API_URL ?? 'http://127.0.0.1:8787';

/** The service bearer payments uses to grant access, read the way the gates do. */
function entitlementSecret(): string {
  const fromEnv = process.env.ENTITLEMENTS_SECRET || process.env.PAYMENTS_SECRET;
  if (fromEnv) return fromEnv;
  // Falls back to api/.env, which is where a laptop keeps it. Fails closed and
  // says so rather than skipping: a lesson suite that quietly tests only the free
  // lesson is indistinguishable from one that passed.
  const env = readFileSync(resolve(HERE, '../../api/.env'), 'utf8');
  const hit = /^(?:ENTITLEMENTS_SECRET|PAYMENTS_SECRET)=(.+)$/m.exec(env);
  if (!hit) throw new Error('lessons e2e failed closed: no ENTITLEMENTS_SECRET or PAYMENTS_SECRET to grant access with');
  return hit[1]!.trim();
}

type Student = { email: string; id: number };

/**
 * Registers through the WEB origin, via `page.request` and not the `request`
 * fixture: only page.request shares the browser context's cookie jar, so this is
 * what makes the subsequent page.goto() arrive signed in.
 */
async function signUp(page: Page, tag: string): Promise<Student> {
  const email = `lesson-${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}@example.test`;
  // Registration is throttled to five a minute per IP, which is a real guard and
  // not a test problem — so the suite waits it out once rather than being written
  // to stay under a limit it does not control. One account per run keeps it from
  // mattering; this is for the re-run inside the same minute.
  for (let attempt = 0; ; attempt++) {
    const res = await page.request.post('/api/v3/auth/register', {
      headers: { 'content-type': 'application/json', origin: 'http://localhost:4321' },
      data: { email, name: 'Lesson e2e', password: `Safe-${Math.random().toString(36).slice(2)}Aa1!`, acepta: true },
    });
    if (res.status() === 201) return { email, id: (await res.json()).user.id as number };
    if (res.status() !== 429 || attempt > 0) {
      expect(res.status(), `register (${await res.text()})`).toBe(201);
    }
    const wait = Number(res.headers()['retry-after'] ?? 60);
    await page.waitForTimeout(Math.min(wait, 65) * 1000 + 500);
  }
}

/** The same call payments makes when Mercado Pago confirms — the real grant path. */
async function grantAccess(page: Page, userId: number): Promise<void> {
  const service = await page.request.fetch(`${API}/api/internal/entitlements`, {
    method: 'POST',
    headers: { authorization: `Bearer ${entitlementSecret()}`, 'content-type': 'application/json' },
    data: {
      eventKey: `e2e:${userId}:${Date.now()}`, userId, active: true,
      source: 'mercadopago.payment', externalId: `e2e-${userId}`,
      occurredAt: new Date().toISOString(),
      periodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
    },
  });
  expect(service.status(), 'grant access').toBeLessThan(300);
}

async function speak(page: Page, lang: 'es' | 'en'): Promise<void> {
  const res = await page.request.patch('/api/v3/settings', {
    headers: { 'content-type': 'application/json', origin: 'http://localhost:4321' },
    data: { lang },
  });
  expect(res.ok(), `set language to ${lang}`).toBeTruthy();
}

/** The tutorial opens over the page on first visit and would eat every click. */
async function skipTutorial(page: Page): Promise<void> {
  await page.context().addCookies([
    { name: 'tutorial_v1', value: 'leccion,curso,panel,chat', url: 'http://localhost:4321' },
  ]);
}

async function openLesson(page: Page, n: number): Promise<void> {
  await page.goto(`/leccion/${n}`);
  await expect(page.locator('h1.h1')).toBeVisible();
  // mountLabs / mountExampleScenes run in a module script; wait for the work.
  await expect(page.locator('[data-lab]').first()).toBeVisible();
}

// ---------------------------------------------------------------------------

test('every lesson mechanic renders, follows the reader language, and can be failed then solved',
  async ({ page }) => {
    // ONE account for the whole walk-through. Three separate tests meant three
    // registrations per project and two projects per run, which walks straight
    // into the 5-a-minute registration throttle — a guard the suite should not be
    // arranged around.
    const me = await signUp(page, 'walk');
    await grantAccess(page, me.id);
    await skipTutorial(page);

    // Anything the page logs as an error. Every failure mode on this page is a
    // silent fallback, so the console is often the ONLY place a broken scene or a
    // widget that threw during render says so out loud — mountLabs() catches per
    // lab and console.errors, and the lesson still looks fine.
    const shouted: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') shouted.push(`${page.url()}: ${m.text()}`); });
    page.on('pageerror', (e) => shouted.push(`${page.url()}: ${e.message}`));

    // -- 1 · all twelve scenes build, and every widget the course has is drawn -
    // The scene check runs over all TWELVE, because each lesson has its own scene
    // module and only a browser proves one builds. The widget check runs over the
    // six that between them use every mechanic: 1 (choice/build/order), 2 and 3
    // (hotcold), 5 (cut), 6 (build), 9 (knob).
    await speak(page, 'es');
    const WIDGETS = new Set([1, 2, 3, 5, 6, 9]);
    for (let n = 1; n <= 12; n++) {
      await openLesson(page, n);

      const hosts = page.locator('[data-scene-example]');
      await expect(hosts, `lesson ${n}: two example scenes`).toHaveCount(2);
      for (let i = 0; i < 2; i++) {
        await expect(hosts.nth(i).locator('> div').first(),
          `lesson ${n}: example ${i + 1} scene did not build`).toBeVisible();
        // mount.ts hides these ONLY once a scene has actually built. Still visible
        // means the scene threw and the card fell back — the correct degradation,
        // and a failure of the animation all the same.
        await expect(page.locator('[data-example-card]').nth(i).locator('[data-example-io]'),
          `lesson ${n}: example ${i + 1} fell back to the static rows`).toBeHidden();
      }

      const labs = page.locator('[data-lab]');
      await expect(labs, `lesson ${n}: three labs`).toHaveCount(3);
      if (WIDGETS.has(n)) {
        for (let i = 0; i < 3; i++) {
          await expect(labs.nth(i).locator('[data-stage]').locator('*').first(),
            `lesson ${n} lab ${i + 1}: the widget rendered nothing`).toBeAttached();
          await expect(labs.nth(i).locator('[data-check]')).toBeVisible();
        }
      }

      await expect(page.locator('#quiz [data-q]'), `lesson ${n}: three quiz questions`).toHaveCount(3);
      await expect(page.locator('#quiz [data-q]').first()
        .locator('[data-q-stage] button').first()).toBeVisible();
    }
    expect(shouted, 'the lesson pages logged errors').toEqual([]);

    // -- 2 · the chrome follows the reader's language ------------------------
    // These strings lived in labs-client.ts as Spanish literals, so an English
    // reader got an English reading over a Spanish exercise — and the i18n gate
    // could not see them, because they were never keys.
    await speak(page, 'en');
    const spanish = ['Pasos disponibles', 'Tu orden', 'Haz clic en un paso', 'cortes puestos',
      'vacío', 'FRÍA', 'CREATIVA'];
    // innerText, not textContent: `.lbl` is text-transform: uppercase, so the page
    // reads STEPS AVAILABLE. Compared case-insensitively rather than hard-coding
    // the rendered casing, which is a styling decision.
    for (const [n, english] of [[1, 'steps available'], [5, 'cuts placed'], [9, 'creative']] as const) {
      await openLesson(page, n);
      const body = (await page.locator('body').first().innerText()).toLowerCase();
      expect(body, `lesson ${n}: English chrome '${english}' is missing`).toContain(english);
      for (const word of spanish) {
        expect(body, `lesson ${n}: Spanish chrome '${word}' rendered on an English lesson`)
          .not.toContain(word.toLowerCase());
      }
    }

    // The hot-and-cold hint IS the mechanic, and it comes from the server: the
    // widget has to post the reader's language with the guess. It did not.
    await openLesson(page, 2);
    const hotcold = page.locator('[data-lab="2.1"]');
    await hotcold.locator('[data-check]').click();
    await expect(hotcold.locator('[data-stage]')).toContainText(/exact|hot|warm|cold/);
    await expect(hotcold.locator('[data-stage]')).not.toContainText(/caliente|tibio|frío/);

    // -- 3 · a lesson failed, then solved ------------------------------------
    await speak(page, 'es');
    await openLesson(page, 1);

    // 1.1 choice: a wrong pick, and «De nuevo» actually clears it.
    const choice = page.locator('[data-lab="1.1"]');
    await choice.locator('[data-stage] button.chip')
      .filter({ hasNotText: 'Viendo miles de ejemplos ya marcados' }).first().click();
    await choice.locator('[data-check]').click();
    await expect(choice).toHaveAttribute('data-result', 'bad');
    await expect(choice.locator('[data-out]')).toContainText('Todavía no');
    await choice.locator('[data-reset]').click();
    await expect(choice.locator('[data-stage] button[data-on]'),
      '«De nuevo» left the wrong chip selected').toHaveCount(0);

    // 1.2 build: the decoy this lab's own explanation calls wrong. Grading used
    // to be "every slot holds a string", so this came back with a tick.
    const build = page.locator('[data-lab="1.2"]');
    for (const tile of ['Fotos de gato', '3 fotos', 'Sin marcar nada']) {
      await build.locator('[data-stage] button.chip', { hasText: tile }).first().click();
    }
    await build.locator('[data-check]').click();
    await expect(build, 'the decoy combination was accepted').toHaveAttribute('data-result', 'bad');
    await expect(build.locator('[data-out]')).toContainText('Todavía no');

    // The attempt counter the page prints under every lab. It read "sin intentos"
    // for a student who had just missed, because the API dropped the count with
    // the row whenever the lab was unsolved.
    await page.reload();
    await expect(page.locator('[data-lab="1.1"]'), 'a failed attempt reads as "sin intentos"')
      .toContainText('1 intentos');

    await chipSolve(page, '1.1', 'Viendo miles de ejemplos ya marcados');
    await buildSolve(page, '1.2', ['Facturas pagadas y sin pagar', '100.000 facturas',
      'Cada una marcada «pagada» o «pendiente»']);
    await orderSolve(page, '1.3', ['Se juntan miles de ejemplos', 'Cada ejemplo se marca con su respuesta',
      'El modelo intenta y se ajusta', 'Se prueba con ejemplos que nunca vio']);

    // Closing a lesson writes the rank. It used to answer the browser with a 400
    // on this very attempt, because a rank belongs to no lesson and the write sent
    // lesson_n: null into a parameter declared Int.
    const logros = await page.request.get('/api/v3/logros');
    const earned = await logros.json();
    expect(earned.logros.map((l: { code: string }) => l.code), 'no rank after closing the lesson')
      .toContain('rango.01');
    expect(earned.nivel, 'rank level did not move').toBe(1);
  });

async function chipSolve(page: Page, id: string, text: string) {
  const lab = page.locator(`[data-lab="${id}"]`);
  await lab.locator('[data-stage] button.chip', { hasText: text }).first().click();
  await lab.locator('[data-check]').click();
  await expect(lab, `lab ${id} was not accepted`).toHaveAttribute('data-result', 'ok');
}

async function buildSolve(page: Page, id: string, tiles: string[]) {
  const lab = page.locator(`[data-lab="${id}"]`);
  for (const t of tiles) await lab.locator('[data-stage] button.chip', { hasText: t }).first().click();
  await lab.locator('[data-check]').click();
  await expect(lab, `lab ${id} was not accepted`).toHaveAttribute('data-result', 'ok');
}

async function orderSolve(page: Page, id: string, steps: string[]) {
  const lab = page.locator(`[data-lab="${id}"]`);
  for (const s of steps) await lab.locator('[data-stage] button.chip', { hasText: s }).first().click();
  await lab.locator('[data-check]').click();
  await expect(lab, `lab ${id} was not accepted`).toHaveAttribute('data-result', 'ok');
}
