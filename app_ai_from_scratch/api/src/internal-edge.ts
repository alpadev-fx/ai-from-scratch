import { BlockList, isIP } from 'node:net';

// Who may reach /api/internal/* and /api/interno/* (LED-3059).
//
// The old guard refused those paths only when `cf-ray` was present. cf-ray is
// added by Cloudflare, so a direct request to the *.up.railway.app hostname never
// carried it and walked straight past: fail open, on the one path that skips the
// edge. This module answers the question the other way round: the route is shut
// unless the TCP peer is inside an explicit allowlist.
//
// The peer is `req.socket.remoteAddress`, never `req.ip`. Today they are equal
// because Fastify is built without `trustProxy`; the day someone turns it on,
// `req.ip` becomes whatever X-Forwarded-For says and this check would silently
// become a header check. The socket address is the only thing the client cannot
// write.

// Loopback, RFC 1918 and IPv6 unique-local: dev, tests, docker compose
// (172.x) and Railway's private network when it is addressed from those ranges.
// 100.64.0.0/10 is deliberately NOT here: it is where Railway's public edge proxy
// has been seen connecting from, and Railway documents no stable range for it.
// Set INTERNAL_ALLOWED_CIDRS (comma-separated, replaces this list) if the private
// network turns out to use something else — the refusal log below prints the peer.
const DEFAULT_ALLOWED = [
  '127.0.0.0/8',
  '::1/128',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  'fc00::/7',
];

const INTERNAL_PATH = /^\/api\/(interno|internal)(\/|$)/i;
const VERSION_PREFIX = /^\/api\/v\d+\//;
const MAX_DECODE_ROUNDS = 4;

/**
 * True when the request path is an internal route. Classified AFTER decoding:
 * Fastify routes `/api/%69nternal/x` to the internal handler, but a regex over the
 * raw URL does not see "internal" in it. Decodes to a fixpoint so a double
 * encoding cannot hide it either; anything still changing after
 * MAX_DECODE_ROUNDS is treated as internal, because nobody legitimate encodes a
 * path that deep. A malformed escape cannot be routed by Fastify (it answers 400
 * before any handler), so it is left to Fastify.
 */
export function isInternalPath(url: string): boolean {
  let path = url.split('?')[0] ?? '';
  for (let round = 0; round < MAX_DECODE_ROUNDS; round++) {
    if (INTERNAL_PATH.test(path.replace(VERSION_PREFIX, '/api/'))) return true;
    let next: string;
    try {
      next = decodeURIComponent(path);
    } catch {
      return false;
    }
    if (next === path) return false;
    path = next;
  }
  return true;
}

function addEntry(list: BlockList, entry: string): void {
  const [addr = '', bitsRaw] = entry.split('/');
  const family = isIP(addr);
  if (family === 0) throw new Error(`INTERNAL_ALLOWED_CIDRS: "${entry}" is not an IP or CIDR`);
  const max = family === 4 ? 32 : 128;
  const bits = bitsRaw === undefined ? max : Number(bitsRaw);
  // /0 would allow every address: an allowlist that allows everything is the
  // fail-open this module exists to remove, so it is refused rather than honoured.
  if (!Number.isInteger(bits) || bits < 1 || bits > max) {
    throw new Error(`INTERNAL_ALLOWED_CIDRS: "${entry}" needs a prefix length between 1 and ${max}`);
  }
  list.addSubnet(addr, bits, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * Builds the peer check. `spec` is the INTERNAL_ALLOWED_CIDRS value: unset or
 * blank means DEFAULT_ALLOWED; otherwise it REPLACES the defaults. A bad entry
 * throws, so a typo fails the deploy instead of quietly widening or narrowing
 * the door.
 */
export function privatePeerChecker(spec: string | undefined = process.env.INTERNAL_ALLOWED_CIDRS): (peer: string | undefined) => boolean {
  const list = new BlockList();
  const entries = spec?.trim() ? spec.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ALLOWED;
  for (const entry of entries) addEntry(list, entry);
  return (peer) => {
    if (!peer) return false;
    const bare = peer.split('%')[0]!; // drop an IPv6 zone id
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
    const addr = mapped ? mapped[1]! : bare;
    const family = isIP(addr);
    if (family === 0) return false;
    return list.check(addr, family === 4 ? 'ipv4' : 'ipv6');
  };
}
