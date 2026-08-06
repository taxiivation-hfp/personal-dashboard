import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken, gateMode } from "@/lib/auth";

// Next 16 renamed the `middleware` file convention to `proxy`. Same execution model:
// it runs on the Edge runtime, so nothing in here may import @libsql/client (native
// binding) — which is exactly why the session is verified from an HMAC-signed cookie
// via Web Crypto rather than by a database lookup.

// Machine callers can't hold a browser cookie, so they're exempt HERE and authenticate
// with their own shared-secret header inside the route itself. Keeping the list
// explicit (rather than a prefix like /api/) means a new endpoint is private by
// default — you have to opt it out deliberately.
const MACHINE_ROUTES = new Set(["/api/health"]);

// /api/up is the platform liveness probe: it must answer before a session exists, and
// it deliberately never touches the database (see that route's comment).
const PUBLIC_ROUTES = new Set(["/login", "/api/auth/login", "/api/up"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (MACHINE_ROUTES.has(pathname) || PUBLIC_ROUTES.has(pathname))
    return NextResponse.next();

  const mode = gateMode();
  if (mode === "off") return NextResponse.next();

  if (mode === "misconfigured") {
    // Deployed with no passcode: refuse everything rather than serve an open app.
    return NextResponse.json(
      {
        error:
          "APP_PASSCODE is not configured on this deployment — refusing to serve.",
      },
      { status: 503 },
    );
  }

  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value))
    return NextResponse.next();

  // An API call gets a 401 it can act on; a page gets sent to the login screen.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
