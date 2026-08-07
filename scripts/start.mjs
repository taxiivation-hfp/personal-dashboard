// `npm start`, pointed at the same output directory `npm run build` writes to.
//
// The two MUST agree, and they nearly did not. When the build was moved out of `.next` to
// stop it colliding with a running dev server, `next start` was left reading `.next` — which
// on a laptop means starting a stale build, and in the Docker image meant copying a
// directory the build never wrote. It would have shipped an image that boots and 404s
// everything, and nothing in the build would have said so.
//
// So the dist directory is decided in exactly one place — the NEXT_DIST_DIR default, kept
// identical here and in scripts/build.mjs — and `next dev` is the only thing that still uses
// `.next`, because it is the only thing that needs to.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

execFileSync(process.execPath, [require.resolve("next/dist/bin/next"), "start"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-build" },
});
