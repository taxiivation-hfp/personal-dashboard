import { getDb } from "@/lib/db/client";
import { callbackUrl, exchangeCode } from "@/lib/google";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code)
    return Response.redirect(`${base}/?gcal=error`, 302);

  const db = await getDb();
  const saved = await db.execute(
    "SELECT value FROM app_meta WHERE key='google_oauth_state'",
  );
  await db.execute("DELETE FROM app_meta WHERE key='google_oauth_state'"); // single-use: cleared on every outcome
  if (!saved.rows.length || String(saved.rows[0].value) !== state) {
    return Response.redirect(`${base}/?gcal=badstate`, 302);
  }
  try {
    // Same derivation as /connect, so the redirect_uri Google is asked to verify is the one
    // it was given — see exchangeCode.
    await exchangeCode(db, code, callbackUrl(req));
    return Response.redirect(`${base}/?gcal=connected`, 302);
  } catch {
    return Response.redirect(`${base}/?gcal=error`, 302);
  }
}
