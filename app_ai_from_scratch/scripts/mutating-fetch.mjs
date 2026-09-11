#!/usr/bin/env node
/**
 * Every mutating fetch from the browser must send `content-type`.
 *
 * WHY THIS GATE EXISTS
 * Astro's origin check is on by default for on-demand pages. It treats a
 * POST/PUT/PATCH/DELETE WITHOUT a content-type as a cross-site form
 * submission and answers 403 "Cross-site POST form submissions are forbidden"
 * before the request reaches any route. Measured in production:
 *
 *   POST /api/auth/logout                      -> 403
 *   POST /api/auth/logout + content-type json  -> 200 {"ok":true}
 *
 * Four call sites shipped with the header missing, and each one broke a
 * feature silently:
 *   - layouts/App.astro        logout did nothing AND claimed success, so the
 *                              buyer read "sesión cerrada" and stayed logged
 *                              in. On a borrowed machine that is the whole
 *                              session handed over.
 *   - pages/perfil.astro       nobody could cancel a recurring charge.
 *   - pages/ranking.astro      leaving the public leaderboard did nothing,
 *                              with no message either way.
 *   - pages/admin.astro        releasing stuck coupon holds never worked.
 *
 * Four instances of one mistake is a missing gate, not four accidents.
 *
 * WHAT THIS IS AND IS NOT
 * It is a lint over source text, not a proof: it reads the fetch call's own
 * argument text and asks whether a content-type appears in it. That is
 * deliberate and its limit is stated here rather than implied -- a call that
 * builds its options object elsewhere (`fetch(url, opciones)`) cannot be
 * judged from the call site, so it is REPORTED as unverifiable instead of
 * being waved through. Fail closed: the house rule is that a check which
 * cannot run counts as failed, never as skipped.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = join(ROOT, 'web', 'src');
const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** Every .astro/.ts/.js file under web/src. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { out.push(...walk(full)); continue; }
    if (/\.(astro|ts|tsx|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * The text of one `fetch(` call, from its opening parenthesis to the matching
 * close. Counting parentheses instead of matching a regex is the point: the
 * options object routinely spans several lines and contains its own
 * parentheses (`encodeURIComponent(...)`, `JSON.stringify(...)`), and a
 * line-based or greedy match gets both cases wrong.
 */
function callText(src, openParen) {
  let depth = 0;
  for (let i = openParen; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(openParen, i + 1);
    }
  }
  return null;   // parenthesis never closed: the file does not parse anyway
}

const problems = [];
const unverifiable = [];
let checked = 0;

for (const file of walk(WEB)) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  for (let i = src.indexOf('fetch('); i !== -1; i = src.indexOf('fetch(', i + 1)) {
    // `mifetch(` / `prefetch(` are not this fetch.
    const before = src[i - 1];
    if (before && /[A-Za-z0-9_$]/.test(before)) continue;
    const text = callText(src, i + 'fetch'.length);
    if (text === null) continue;
    const method = METHODS.find((m) => text.includes(`'${m}'`) || text.includes(`"${m}"`));
    if (!method) continue;                      // a GET needs no content-type
    checked += 1;
    const line = src.slice(0, i).split('\n').length;
    if (/content-type/i.test(text)) continue;
    // Options passed by reference cannot be judged from here. Reported, never
    // assumed innocent.
    if (/,\s*[A-Za-z_$][\w$]*\s*\)\s*$/.test(text)) {
      unverifiable.push(`${rel}:${line}  ${method} with an options object built elsewhere`);
      continue;
    }
    problems.push(`${rel}:${line}  ${method} without content-type`);
  }
}

if (problems.length || unverifiable.length) {
  for (const p of problems) console.error(`mutating-fetch: ${p}`);
  for (const u of unverifiable) console.error(`mutating-fetch: UNVERIFIABLE ${u}`);
  console.error('');
  console.error("Astro's origin check answers 403 to a mutating fetch with no content-type,");
  console.error('before any route sees it. Add:  headers: { \'content-type\': \'application/json\' }');
  console.error('and check the response -- a mutation that fails must not report success.');
  process.exit(1);
}

console.log(`mutating-fetch: ${checked} mutating fetch calls, every one sends content-type.`);
