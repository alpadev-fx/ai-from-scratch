#!/usr/bin/env node
/**
 * No `var(--token)` that names a token nobody declares.
 *
 * WHY THIS EXISTS
 * `check-theme-literals.mjs` catches a hex written where a token belongs. It
 * cannot catch the opposite mistake, and the opposite mistake is worse.
 *
 * `.up-cta` shipped as:
 *
 *   .up-cta{background:var(--fg);color:var(--bg);...}
 *
 * `--fg` is declared nowhere in this project. Referenced twice, defined zero
 * times. An undefined custom property makes the declaration invalid at
 * computed-value time, so `background` fell back to transparent — while `--bg`
 * on the same rule IS declared, so the label took the exact colour of the
 * surface behind it. Black on black in dark, near-white on white in paper. The
 * primary CTA was not badly styled, it was INVISIBLE, in both themes, at two
 * call sites: the register prompt on `/pago` and the free-to-paid upsell button
 * shown across the whole logged-in app.
 *
 * Nothing caught it. Not types — CSS is a string to the compiler. Not tests —
 * nothing asserts on computed colour. Not the literal checker — there is no
 * literal to find. Not review — `var(--fg)` reads like every other token. It sat
 * in `App.astro` and `pago.astro` until somebody curled the built CSS.
 *
 * A typo'd token is silent by construction. That is the whole reason for this
 * file: the browser does not warn, it just drops the declaration.
 *
 * HOW IT DECIDES
 * Collect every `--name:` declaration in the web source, collect every
 * `var(--name)` reference, report references with no declaration. A reference
 * carrying a fallback — `var(--x, #fff)` — is not reported: the fallback is the
 * author saying out loud what happens when the token is absent.
 *
 * Usage:  node scripts/check-undefined-tokens.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'web/src');
const EXT = new Set(['.astro', '.ts', '.css']);

/**
 * Tokens a browser resolves that this project never declares, and never should.
 * Nothing belongs here yet. An entry is a promise that the name resolves at
 * runtime by some mechanism outside the source tree.
 */
const ALLOWED = new Map();

/** `--name:` — a declaration. Not `var(--name)`, which is a reference. */
const DECLARED = /(?<!var\(\s*)--([A-Za-z0-9_-]+)\s*:/g;
/** `var(--name)` and `var(--name, fallback)`. Group 2 tells the two apart. */
const REFERENCED = /var\(\s*--([A-Za-z0-9_-]+)\s*(,)?/g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXT.has(entry.slice(entry.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

const files = walk(SRC);
if (!files.length) {
  console.error('check-undefined-tokens: found no source files under web/src. If the tree moved, '
    + 'update this checker — reporting "no problems" after inspecting nothing is a guard that '
    + 'inspected nothing.');
  process.exit(1);
}

const declared = new Set(ALLOWED.keys());
/** name -> first place it is referenced without a fallback. */
const referenced = new Map();

for (const file of files) {
  // Comments are prose. This file's own header names `--fg` to explain it, and a
  // checker that indicts the explanation teaches people to delete it.
  //
  // Blank the comment in place rather than collapsing it: a multi-line comment
  // replaced by one space shifts every line after it, and the checker then
  // reports a line number that is not where the problem is. Keep the newlines.
  const source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

  for (const m of source.matchAll(DECLARED)) declared.add(m[1]);

  for (const m of source.matchAll(REFERENCED)) {
    const [name, fallback] = [m[1], m[2]];
    if (fallback || referenced.has(name)) continue;
    const line = source.slice(0, m.index).split('\n').length;
    referenced.set(name, { file: relative(ROOT, file), line });
  }
}

const problems = [];
for (const [name, where] of referenced) {
  if (declared.has(name)) continue;
  problems.push(`--${name} — referenced at ${where.file}:${where.line}, declared nowhere`);
}

// An allowlist entry for a token nothing references is dead weight that makes
// the next reader trust a promise about nothing.
const stale = [...ALLOWED.keys()].filter((k) => !referenced.has(k));

console.log(`tokens: ${declared.size} declared, ${referenced.size} referenced without a fallback, `
  + `across ${files.length} files`);

if (problems.length || stale.length) {
  console.error();
  for (const p of problems) console.error(`  ✗ ${p}`);
  for (const s of stale) console.error(`  ✗ --${s} is allow-listed but nothing references it — drop the entry`);
  if (problems.length) {
    console.error('\nDeclare it in web/src/lib/theme-css.ts, for BOTH themes, or reference a token');
    console.error('that exists. A custom property nobody declares does not fall back to something');
    console.error('sensible — the whole declaration is dropped, and the element inherits whatever');
    console.error('was behind it. That is how an invisible button ships.');
  }
  process.exit(1);
}
console.log('ok: every token referenced is a token declared.');
