import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @libsql/client is a server-only dependency; keep it out of any client bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
