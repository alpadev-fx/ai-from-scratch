#!/usr/bin/env node
/**
 * No new colour literal in the app shell. Tokens, or a stated exception.
 *
 * WHY THIS EXISTS
 * `web/src/lib/theme-css.ts` declares every colour twice — once for dark, once
 * for paper, the second hand-calibrated rather than auto-inverted. A colour
 * written as a literal in `App.astro` therefore gets ONE of those two right and
 * is wrong in the other theme, by construction. The project already names this
 * as its classic failure (`web/src/lib/scenes/kit.ts`, rule 2: "A literal hex
 * would be a bug in one of the two themes").
 *
 * It had shipped twice in the same file, both found by looking at a screenshot:
 *
 *   input[type=range]::-webkit-slider-runnable-track  rgba(235,235,245,.34)
 *     The dark theme's own near-white. `appearance:none` means the browser draws
 *     no track, so that literal IS the track — and on paper it composites to
 *     rgb(240,240,243) over a #F2F2F2 page. 1.01:1. Lessons 2, 3 and 9 are built
 *     on a slider whose track could not be seen.
 *
 *   a:hover  #409CFF
 *     The dark theme's brightened accent, applied to both. On paper that is
 *     2.53:1 against #F2F2F2, down from 5.44:1 at rest — so hovering a link made
 *     it LESS readable and pushed it under AA.
 *
 * Neither broke a type, a test or a build. Both looked fine in dark, which is
 * the theme a developer has open.
 *
 * HOW IT DECIDES
 * Every literal has to be on ALLOWED with a reason. That is deliberately not "no
 * literals": several existing ones render acceptably in both themes and changing
 * them is a design decision, not a bug fix. The list is the record of which is
 * which, and anything NEW fails until somebody writes down which it is.
 *
 * Usage:  node scripts/check-theme-literals.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'web/src/layouts/App.astro';

/**
 * Literals allowed in the shell, each with the reason it is not a theme bug.
 * A value here is a promise that it renders correctly in BOTH dark and paper.
 */
const ALLOWED = new Map([
  ['rgba(0,0,0,.46)', 'modal scrim: a black veil is correct over either theme'],
  ['rgba(0,0,0,.62)', 'sheet scrim: same'],
  ['rgba(10,132,255,.18)', 'selected-chip tint; the BORDER is var(--ac). Visible in both '
    + '(rgb(200,222,245) on paper) but it is the dark accent — retinting paper is a design call, not a fix'],
  ['rgba(48,209,88,.16)', 'correct-chip tint; same trade as above'],
  ['rgba(255,69,58,.14)', 'wrong-chip tint; same trade as above'],
  ['rgba(120,120,128,.20)', 'the .bar track. This IS var(--fill) in paper and .22 in dark; '
    + 'grey on grey either way, so it is a tidy-up rather than a bug'],
]);

/** Colour literals: #rgb/#rrggbb(aa) and rgb()/rgba() with numeric channels. */
const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+[^)]*\)/g;

const source = readFileSync(resolve(ROOT, FILE), 'utf8');

// Only the <style> blocks. The frontmatter is TypeScript and the body is markup;
// a colour in either is not a stylesheet rule.
const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
if (!styles.length) {
  console.error(`check-theme-literals: found no <style> block in ${FILE}. If the shell was `
    + 'restructured, update this checker — reporting "no problems" after inspecting nothing '
    + 'is a guard that inspected nothing.');
  process.exit(1);
}

// Comments are prose. This file's own comments QUOTE the two bad literals in
// order to explain them, and indicting a comment for naming the bug it documents
// is how a checker teaches people to delete the explanation.
const code = styles.join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');

const seen = new Map();
for (const [line, text] of code.split('\n').entries()) {
  for (const hit of text.match(LITERAL) ?? []) {
    const key = hit.replace(/\s+/g, '');
    if (!seen.has(key)) seen.set(key, { line: line + 1, text: text.trim() });
  }
}

const problems = [];
for (const [literal, where] of seen) {
  if (ALLOWED.has(literal)) continue;
  problems.push(`${literal} — ${where.text.slice(0, 110)}`);
}

// An allowlist entry for a literal that no longer exists is dead weight that
// makes the next reader trust a promise about nothing.
const stale = [...ALLOWED.keys()].filter((k) => !seen.has(k));

console.log(`theme literals: ${seen.size} in ${FILE}, ${ALLOWED.size} with a stated reason`);

if (problems.length || stale.length) {
  console.error();
  for (const p of problems) {
    console.error(`  ✗ ${p}`);
  }
  for (const s of stale) console.error(`  ✗ ${s} is allow-listed but no longer in the file — drop the entry`);
  if (problems.length) {
    console.error('\nUse a token from web/src/lib/theme-css.ts. If the literal really is right in');
    console.error('BOTH themes, add it to ALLOWED in this file with the reason — the reason is the');
    console.error('point, because dark is the theme you have open and paper is the one that breaks.');
  }
  process.exit(1);
}
console.log('ok: the app shell paints from tokens.');
