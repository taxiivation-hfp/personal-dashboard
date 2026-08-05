import {
  createSessionToken,
  constantTimeEqual,
  isSecureRequest,
  gateMode,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Brute-force brake with ESCALATION.
 *
 * The first cut reset the counter the moment the lock engaged, which handed an attacker
 * a fresh budget of 8 guesses every 5 minutes — forever, at a steady ~96/hour with no
 * increasing cost. Locks now double (1m, 2m, 4m … capped at an hour) and the round
 * counter only decays after a clean hour.
 *
 * In-memory is the right scope here: single user, single machine, and fly.toml pins one
 * instance. Worst case a restart clears it, which is not the weak link behind a long
 * passphrase.
 */
let fails = 0;
let rounds = 0;
let lockedUntil = 0;
let lastFailAt = 0;
const MAX_FAILS = 8;
const DECAY_MS = 60 * 60 * 1000;

// A fixed cost on every wrong answer. Cheap for the one real user, expensive for a
// script, and it flattens any residual timing signal from the comparison itself.
const FAIL_DELAY_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  if (gateMode() === "misconfigured") {
    return Response.json(
      { error: "This deployment is missing APP_PASSCODE or a 32+ character SESSION_SECRET." },
      { status: 503 }
    );
  }
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return Response.json({ error: "no passcode configured" }, { status: 503 });

  // This route is public AND mutating (it mints a session), so it's the one place a
  // cross-origin POST could matter. SameSite=Lax covers the cookie; this covers the form.
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) {
        return Response.json({ error: "cross-origin request rejected" }, { status: 403 });
      }
    } catch {
      return Response.json({ error: "bad origin" }, { status: 403 });
    }
  }

  const now = Date.now();
  if (now < lockedUntil) {
    const retryAfter = Math.ceil((lockedUntil - now) / 1000);
    return Response.json({ error: `too many attempts — try again in ${retryAfter}s`, retryAfter }, { status: 429 });
  }
  if (lastFailAt && now - lastFailAt > DECAY_MS) {
    fails = 0;
    rounds = 0;
  }

  let supplied = "";
  try {
    // Cap the length so an enormous body can't be used to burn CPU in the comparison.
    supplied = String((await req.json())?.passcode ?? "").slice(0, 256);
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  if (!(await constantTimeEqual(supplied, passcode))) {
    fails++;
    lastFailAt = now;
    if (fails >= MAX_FAILS) {
      rounds++;
      fails = 0;
      lockedUntil = now + Math.min(60_000 * 2 ** (rounds - 1), 60 * 60 * 1000);
    }
    await sleep(FAIL_DELAY_MS);
    return Response.json({ error: "incorrect passcode" }, { status: 401 });
  }

  const secure = isSecureRequest(req);
  if (process.env.NODE_ENV === "production" && !secure) {
    // Minting a session over plain HTTP in production would send the cookie in clear
    // text on every later request. Refuse rather than downgrade silently.
    return Response.json({ error: "refusing to start a session over plain HTTP" }, { status: 400 });
  }

  fails = 0;
  rounds = 0;
  const token = await createSessionToken();
  const res = Response.json({ ok: true });
  res.headers.append(
    "set-cookie",
    [
      `${SESSION_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${SESSION_MAX_AGE}`,
      secure ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ")
  );
  return res;
}
