// Single-user auth. Deliberately dependency-free and database-free.
//
// Next.js middleware runs on the Edge runtime, which cannot load @libsql/client's
// native binding — so a session must be verifiable from the cookie ALONE. This uses
// an HMAC-signed, expiring token via Web Crypto (`crypto.subtle`), which is present
// on both the Edge and Node runtimes, so the same code works wherever it ends up.

export const SESSION_COOKIE = "pd_session";
const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

const enc = new TextEncoder();

function secret(): string | null {
  const explicit = process.env.SESSION_SECRET || "";
  if (explicit.length) return explicit;
  // Falling back to the passcode is a DEV convenience only. In production it would
  // give the cookie-signing key merely passcode entropy — so one captured cookie
  // could be brute-forced offline into a key that mints sessions forever.
  if (process.env.NODE_ENV === "production") return null;
  const pass = process.env.APP_PASSCODE || "";
  return pass.length ? pass : null;
}

async function hmac(message: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time compare that also hides LENGTH.
 *
 * A plain `a.length !== b.length` early-return is a length oracle: one request per
 * guess reveals the passcode's length before any character is attacked. HMACing both
 * operands first maps any input to a fixed-width digest, so the loop below always runs
 * over the same number of bytes whatever was submitted.
 */
export async function constantTimeEqual(
  a: string,
  b: string,
): Promise<boolean> {
  // A per-process random key: these digests are only ever compared with each other.
  const [da, db] = await Promise.all([
    hmac(a, COMPARE_KEY),
    hmac(b, COMPARE_KEY),
  ]);
  let diff = 0;
  for (let i = 0; i < da.length; i++)
    diff |= da.charCodeAt(i) ^ db.charCodeAt(i);
  return diff === 0;
}

const COMPARE_KEY = [...crypto.getRandomValues(new Uint8Array(32))]
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("");

export async function createSessionToken(): Promise<string> {
  const key = secret();
  if (!key)
    throw new Error(
      "APP_PASSCODE (or SESSION_SECRET) must be set to issue a session",
    );
  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  return `${exp}.${await hmac(`v1:${exp}`, key)}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const key = secret();
  if (!key) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  // Also bound it from above: a forged far-future exp shouldn't be worth attacking,
  // and a clock skew shouldn't mint a decade-long session.
  if (exp > Date.now() + SESSION_MAX_AGE * 1000 + 60_000) return false;
  return constantTimeEqual(sig, await hmac(`v1:${exp}`, key));
}

/**
 * Is this request actually over TLS?
 *
 * Fly terminates TLS at its proxy and forwards plain HTTP, so the request URL says
 * "http" even on a real HTTPS visit — `x-forwarded-proto` is the only truth here.
 * Deriving the cookie's Secure flag from NODE_ENV instead (as the first cut did) sets
 * Secure on a plain-http local production build, where the browser then refuses to
 * store it and login silently fails.
 */
export function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Is the browser gate switched on?
 *
 * Local dev with no passcode set stays frictionless. In PRODUCTION we fail CLOSED:
 * a deployed app with no passcode configured is exactly the hole this exists to
 * prevent, so it refuses everyone rather than letting everyone in.
 */
export function gateMode(): "off" | "on" | "misconfigured" {
  const hasPasscode = Boolean(
    process.env.APP_PASSCODE && process.env.APP_PASSCODE.length > 0,
  );
  if (process.env.NODE_ENV === "production") {
    // Production needs BOTH: a passcode to check, and a real signing key. Without the
    // key, secret() returns null and every session silently fails to verify — which
    // would look like a broken login rather than a missing config.
    const hasKey = Boolean(
      process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32,
    );
    return hasPasscode && hasKey ? "on" : "misconfigured";
  }
  return hasPasscode ? "on" : "off";
}
