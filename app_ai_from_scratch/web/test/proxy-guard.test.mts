import assert from 'node:assert/strict';
import { isInternal } from '../src/lib/proxy-guard.ts';

assert.equal(isInternal('internal/entitlements'), true);
assert.equal(isInternal('interno/catalogo'), true);
assert.equal(isInternal('v3/internal/entitlements'), true);
assert.equal(isInternal('v3/interno/herramienta'), true);
assert.equal(isInternal('auth/login'), false);
assert.equal(isInternal('lessons/1'), false);
// LED-3059: the encoded spellings api routes to the internal handlers.
assert.equal(isInternal('%69nternal/entitlements'), true);
assert.equal(isInternal('v3/%69nterno/herramienta'), true);
assert.equal(isInternal('%2569nternal/entitlements'), true);
assert.equal(isInternal('internal%2Fentitlements'), true);
assert.equal(isInternal('INTERNAL/entitlements'), true);
assert.equal(isInternal('v2/interno/catalogo'), true);
assert.equal(isInternal('%25252525252569nternal/x'), true);
assert.equal(isInternal('internals/x'), false);
assert.equal(isInternal('labs/1.1/attempt'), false);
assert.equal(isInternal('lessons/%zz'), false);

console.log('proxy-guard: internal paths blocked, encoded spellings included');
