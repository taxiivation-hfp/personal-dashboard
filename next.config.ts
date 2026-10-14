import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @libsql/client is a server-only dependency; keep it out of any client bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],

  /**
   * A production build writes somewhere ELSE.
   *
   * `next dev` and `next build` both default to `.next`, and running a build while the dev
   * server is up leaves a mixed manifest behind: every /api/* route starts returning 404
   * while pages still render 200, which looks exactly like a data bug and is not one. It
   * cost an hour once. `npm run build` sets NEXT_DIST_DIR so the two never share a directory
   * again — and it means a build can be run at any time to check something without
   * disturbing whatever the browser is pointed at.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // `next dev` otherwise writes an AGENTS.md and CLAUDE.md into the repo on every start.
  // This repo keeps no markdown by the owner's ruling.
  agentRules: false,
};

export default nextConfig;
