// `npm run build`, pointed at its own output directory.
//
// next dev and next build both default to `.next`. Running a build while the dev server is
// up leaves a mixed manifest behind: every /api/* route starts returning 404 while pages
// still render 200, which looks exactly like a data bug and is not one. It cost an hour.
//
// So the build writes to `.next-build` instead, and the dev server keeps `.next` to itself.
// A build can now be run at any moment to check that something compiles, without disturbing
// whatever the browser is pointed at. next.config.ts reads NEXT_DIST_DIR.
//
// Plain node rather than a cross-env dependency: this is four lines and the repo's
// zero-dependency test setup is worth more than the convenience.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

execFileSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-build" },
});
