/**
 * Paths the browser must never reach through the public reverse proxy.
 *
 * Classified AFTER decoding, to a fixpoint (LED-3059): api decodes the path before
 * routing, so `%69nternal/x` — or `%2569nternal/x` if Astro hands this function
 * one decoding already applied — is the internal route to api and nothing special
 * to a regex over the raw string. This proxy is also the one place that has to
 * hold: api sees `web` as a private-network peer, so its own peer check does not
 * stand in for this one.
 */
const INTERNAL = /^(v\d+\/)?(interno|internal)(\/|$)/i;
const MAX_DECODE_ROUNDS = 4;

export function isInternal(path: string): boolean {
  let p = path;
  for (let round = 0; round < MAX_DECODE_ROUNDS; round++) {
    if (INTERNAL.test(p)) return true;
    let next: string;
    try {
      next = decodeURIComponent(p);
    } catch {
      return false; // malformed escape: api answers 400 before any handler
    }
    if (next === p) return false;
    p = next;
  }
  return true; // still changing after four rounds: nobody legitimate encodes that deep
}
