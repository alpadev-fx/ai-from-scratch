/**
 * Was this request made over TLS by the person, not by the proxy?
 *
 * Pulled out of the middleware so it can be asserted without building Astro and
 * booting a server. Behind Railway the app always speaks plain http on the
 * internal network, so `url.protocol` describes the last hop and not the one
 * that matters; `x-forwarded-proto` describes the one the browser used. When a
 * proxy chains them the FIRST entry is the client's.
 */
export const overTls = (forwardedProto: string | null, urlProtocol: string): boolean => {
  if (forwardedProto) return forwardedProto.split(',')[0]!.trim().toLowerCase() === 'https';
  return urlProtocol === 'https:';
};

/** The value, in one place, so the test and the header cannot drift apart. */
export const HSTS = 'max-age=300';
