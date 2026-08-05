# Two hazards drive every choice in this file:
#
# 1. @libsql/client depends on `libsql`, which ships a PLATFORM-SPECIFIC native binding
#    (locally that's @libsql/win32-x64-msvc/index.node, ~8.5MB). So node_modules can
#    NEVER be copied in from the host — dependencies must be installed inside the image
#    so npm resolves the linux binding. It also rules out Alpine: that binding wants
#    glibc, and musl would fail at require() time, not at build time.
#
# 2. src/lib/db/client.ts does readFileSync("src/lib/db/schema.sql") at RUNTIME to
#    self-heal the schema. Next's output:"standalone" does not trace arbitrary data
#    files, so a standalone build would boot and then die on first request. We ship the
#    full app instead — a few hundred MB is irrelevant for a single-user private app.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` here (not on the host) is what pulls @libsql/linux-x64-gnu.
RUN npm ci
# Prove the native binding actually loads on THIS libc now, so a musl/glibc mismatch
# fails the build rather than surfacing as a 500 on the first request in production.
RUN node -e "require('libsql'); console.log('libsql native binding OK')"

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build only needs to compile; it must not touch the database.
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Fly routes to the internal port; Next must bind all interfaces, not just loopback.
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
# NOTE: no `COPY /app/public` — this project has no public/ directory, and Docker COPY
# aborts the build on a missing source. Add it back if a public/ is ever created.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
# Required at runtime by the schema self-heal — this is the file standalone would drop.
COPY --from=build /app/src/lib/db/schema.sql ./src/lib/db/schema.sql
COPY --from=build /app/scripts ./scripts

# Don't run as root.
USER node

EXPOSE 3000
CMD ["npm", "run", "start"]
