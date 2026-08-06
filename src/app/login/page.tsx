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
        <h1 className="text-heading font-serif font-semibold">Today</h1>
        <p className="mt-1 text-small text-[var(--color-muted)]">
          This one&apos;s just for you.
        </p>

        {/* A line, not a box. This is the whole screen, so the one filled rectangle on it
            used to read as a demand; a rule reads as somewhere to write.
            16px rather than the 14px controls take elsewhere: under 16px iOS zooms the page
            the instant the field takes focus, and this field is autofocused — the app's
            first frame would lurch. */}
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          autoFocus
          autoComplete="current-password"
          aria-label="Passcode"
          className="mt-8 w-full border-b border-[var(--color-line-strong)] bg-transparent pb-2 text-body outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
        />

        <button
          type="submit"
          disabled={busy || !passcode}
          className="mt-6 w-full rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Checking…" : "Enter"}
        </button>

        {/* Ink at weight 600, not a colour. The Social pillar hue used to carry this —
            3.86:1, and a categorisation hue pressed into service as a status colour, which
            the palette forbids twice over. There is no red in this system, so an error
            stands out the way everything else does: by weight. */}
        {error && (
          <p role="alert" className="mt-3 text-small font-semibold">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
