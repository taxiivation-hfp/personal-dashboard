import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
