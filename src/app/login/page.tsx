"use client";

import { useState } from "react";

export default function LoginPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        // Full navigation, not a client push: the cookie must be attached to the
        // request that renders the server component.
        //
        // `startsWith("/")` alone is NOT enough — "//evil.com" and "/\evil.com" are
        // protocol-relative URLs that navigate off-origin, which would turn the login
        // page into an open redirect.
        const next = new URLSearchParams(window.location.search).get("next");
        const safe = next && /^\/(?![/\\])/.test(next) ? next : "/";
        window.location.href = safe;
        return;
      }
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Something went wrong.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <form onSubmit={submit} className="w-full max-w-xs">
        <h1 className="text-3xl font-semibold tracking-tight">Today</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">This one&apos;s just for you.</p>

        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          autoFocus
          autoComplete="current-password"
          aria-label="Passcode"
          className="mt-6 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] px-3.5 py-2.5 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-muted)]"
        />

        <button
          type="submit"
          disabled={busy || !passcode}
          className="mt-3 w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Checking…" : "Enter"}
        </button>

        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--color-social)]">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
