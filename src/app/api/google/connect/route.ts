import { getDb } from "@/lib/db/client";
import { callbackUrl, getAuthUrl, googleConfigured } from "@/lib/google";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!googleConfigured()) {
    return Response.json(
      {
        error:
          "Google not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local",
      },
      { status: 400 },
    );
  }
  const db = await getDb();
  const state = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO app_meta (key,value) VALUES ('google_oauth_state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    args: [state],
  });
  // Derived from THIS request, so the consent screen always points back at the origin the
  // owner pressed Connect on — see callbackUrl.
  return Response.redirect(getAuthUrl(state, callbackUrl(req)), 302);
}
