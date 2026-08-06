import type { Metadata, Viewport } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "./globals.css";

/* TWO FAMILIES, ONE SUPERFAMILY.
 *
 * Source Serif 4 and Source Sans 3 are siblings, so they share a skeleton and sit
 * together without the "two fonts arguing" problem that pairing unrelated faces causes.
 * The contrast between them is structural — serif vs sans — which is a real axis, unlike
 * pairing two sans-serifs that differ only in mood.
 *
 * THE AUTHOR RULE decides which is which: the serif renders what the owner wrote and what
 * the day amounts to; the sans renders the machinery. Your words on one side, the ruled
 * lines on the other.
 *
 * Both are self-hosted by next/font — no runtime request to Google, so the laptop and the
 * iPhone render identical type, which the old system-stack fallback did not.
 *
 * `display: optional`, NOT swap. Verified against the build output: this Next version
 * emits no metric-matched fallback face for either family (the only `size-adjust` in the
 * bundle is a no-op 100%), so `swap` would reflow the whole page the moment the webfont
 * landed. `optional` gives the font a small budget and otherwise keeps the fallback for
 * that load — zero shift, guaranteed. The tradeoff normally is "you might not see the
 * brand font on a slow first visit", and it barely applies here: this app is opened dozens
 * of times a day from the home screen on two known devices, so the font is cached after
 * the first load and every subsequent open renders it. Trading one cold-cache paint for
 * never reflowing the adherence number is the right side of that deal.
 */

const sans = Source_Sans_3({
  subsets: ["latin"],
  display: "optional",
  variable: "--font-source-sans",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

// `opsz` is worth the axis: this face runs from 12px captions to a 52px numeral, and
// optical sizing means the small cut is a genuinely different drawing — more open, looser
// spaced — rather than the display cut shrunk down.
const serif = Source_Serif_4({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "optional",
  variable: "--font-source-serif",
  fallback: ["ui-serif", "Georgia", "serif"],
});

export const metadata: Metadata = {
  title: "Today",
  description: "A daily guide, not a dashboard.",
};

export const viewport: Viewport = {
  // The page background. Left over from the pre-pivot dark theme this was #0a0a0c, which
  // painted the iPhone status bar near-black above a warm beige app — the one seam a
  // home-screen web app cannot hide. Must track --color-bg.
  themeColor: "#f2ede4",
  width: "device-width",
  initialScale: 1,
  // viewportFit=cover lets the layout reach under the home indicator, which is what the
  // tab bar's env(safe-area-inset-bottom) padding is written against.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
