import { SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deliberately NOT on the proxy's public list. Requiring a valid session to log out
 * means SameSite=Lax plus the gate together make this un-CSRF-able — a third-party
 * page can't sign you out.
 */
export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
