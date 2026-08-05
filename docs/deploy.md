# Deploying (Fly.io + Turso)

Single-user private app. The whole point of deploying is reach: your phone can push
health data and open the board from anywhere, instead of only this PC while
`npm run dev` happens to be running.

> **The one rule that matters.** Auth and the public URL must ship in the SAME deploy.
> There is no window where the app is reachable without a passcode — `/api/coach`
> spends your Anthropic key on a 120-second endpoint, and the coach holds read+write
> access to your Google Calendar.

---

## What's already handled in code

| Hazard | Protection |
|---|---|
| Ephemeral container filesystem silently eating the database | `client.ts` throws on first DB access if `NODE_ENV=production` and `DATABASE_URL` is a `file:` URL |
| Deploying with no passcode configured | `proxy.ts` fails **closed** — returns 503 to everything rather than serving an open app |
| Phone can't hold a session cookie | `/api/health` is exempt from the browser gate and authenticates with `x-app-secret` |
| Windows-only native `libsql` binding | `node_modules` is in `.dockerignore`; deps install inside the Linux image |
| `output: "standalone"` dropping `schema.sql` | Not used. The Dockerfile copies `schema.sql` explicitly |

---

## Owner checklist

Everything below needs a human — accounts, payment, consoles, a phone.

### 1. Accounts and CLIs

```bash
# Fly
# install flyctl: https://fly.io/docs/flyctl/install/
fly auth signup      # or: fly auth login
# Fly requires a card on file even on small workloads.

# Turso
# install: https://docs.turso.tech/cli/installation
turso auth signup
```

### 2. Create the database and move your data across

Your local database has **real data** — goals, the XP ledger, habit history, live Google
tokens, coach history and imported gym sessions. Don't start empty.

Create the database (this part needs the Turso CLI, which has **no native Windows
build** — use WSL, or create the database in the Turso web dashboard instead):

```bash
turso db create personal-dashboard --location syd
turso db show personal-dashboard --url      # -> libsql://...
turso db tokens create personal-dashboard   # -> the auth token
```

Then copy your data up **from Windows**, using the script in this repo rather than the
CLI — it uses `@libsql/client`, which is already installed and works here:

```bash
# DRY RUN first — prints per-table row counts, writes nothing.
npm run db:copy -- --to "libsql://<db>-<org>.turso.io" --token "<auth-token>"

# Then do it.
npm run db:copy -- --to "libsql://<db>-<org>.turso.io" --token "<auth-token>" --write

# Confirm the target matches the source.
npm run db:verify -- --url "libsql://<db>-<org>.turso.io" --token "<auth-token>"
```

The copy preserves primary keys (XP rows point at task ids, habit entries at habit ids
— renumbering would detach history from what it describes), runs in one transaction,
and never writes to your local file. Confirm `goals`, `xp_log`, `habit_entries` and
`google_oauth_tokens` all match before moving on.

### 3. Launch, then set secrets BEFORE the first real deploy

```bash
fly launch --no-deploy     # accept the existing fly.toml; note the app name it assigns

fly secrets set \
  ANTHROPIC_API_KEY="sk-ant-..." \
  DATABASE_URL="libsql://...turso.io" \
  TURSO_AUTH_TOKEN="..." \
  GOOGLE_CLIENT_ID="..." \
  GOOGLE_CLIENT_SECRET="..." \
  APP_PASSCODE="<a long passphrase you'll actually remember>" \
  SESSION_SECRET="<32+ random chars — NOT the passcode>" \
  HEALTH_PUSH_SECRET="<the random value already in .env.local>"

fly deploy
```

**Secrets before the first deploy, not after.** Deploying first would put the app on a
public URL while `APP_PASSCODE` is unset — and although the gate fails closed (503s
everything) rather than serving openly, `npm start` also runs `scripts/preflight.mjs`,
which refuses to boot without a real `DATABASE_URL`. Setting secrets first means the
first deploy is the correct one instead of a rollback.

`SESSION_SECRET` must be its own value, at least 32 characters. In production the app
will not fall back to signing sessions with the passcode — passcode-strength entropy on
a cookie-signing key means one captured cookie could be brute-forced offline into a
key that mints sessions indefinitely.

If `fly launch` gave you a different app name, update `app` and `GOOGLE_REDIRECT_URI`
in `fly.toml` to match before deploying.

### 4. Google Calendar on the new origin

In Google Cloud Console → Credentials → your OAuth 2.0 Web client:

- **Add** `https://<your-app>.fly.dev/api/google/callback` to Authorized redirect URIs.
  Keep the localhost one so development still works.
- Set `GOOGLE_REDIRECT_URI` in `fly.toml` to the same value.
- **Publishing status matters.** While the app is in *Testing*, Google expires refresh
  tokens after **7 days** — you'd be re-connecting Calendar every week forever. Move it
  to *In production*; for a single-user app requesting Calendar scopes this normally
  means going through verification, or using an Internal app if you have a Workspace
  account.

Your existing token row will keep working locally. On the deployed origin you'll need
to hit **Connect** once.

### 5. Verify the deploy

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<app>.fly.dev/api/today   # expect 401
curl -s -o /dev/null -w "%{http_code}\n" https://<app>.fly.dev/            # expect 307 -> /login
```

Then open the app, enter the passcode, and confirm the board loads with your real data.
**If `/api/today` returns 200 without a cookie, stop and fix it before going further.**

### 6. The iPhone Shortcut (Phase 3)

On your phone, Shortcuts app → new shortcut:

1. **Find Health Samples** — Type: `Steps`, Sort by `Start Date`, and set the date
   range to *Today*.
2. **Calculate Statistics** — Sum, over the result of step 1.
3. **Text** — the JSON body:
   `{"steps": <Statistic from step 2>}`
   (Insert the variable inline; leave `date` out and the server uses today's Melbourne
   date, which is what you want.)
4. **Get Contents of URL**
   - URL: `https://<your-app>.fly.dev/api/health`
   - Method: `POST`
   - Headers: `Content-Type: application/json`, `x-app-secret: <HEALTH_PUSH_SECRET>`
   - Request Body: `File` → the Text from step 3
5. Save it, then **Automation** tab → new Personal Automation → **Time of Day**, e.g.
   21:30 daily → run this shortcut → **turn OFF "Ask Before Running"**.

Add Sleep and Active Energy the same way later by extending the JSON with
`sleep_minutes` and `calories`.

**What it does:** crossing 8,000 steps ticks the Steps non-negotiable, grants awareness
XP once, and closes the Physical ring. Posting repeatedly through the day is safe — the
row is upserted per day and the habit is re-derived from the current number each time.

---

## Cost

Roughly **$5–15/month**: a Fly `shared-cpu-1x` 512MB machine that auto-stops when idle,
plus Turso (a single-user database sits well inside the free tier). The Anthropic spend
is separate and measured at well under $2/month for the coach.

## Backups

The Turso database will hold Google tokens, health data and eventually journal content.
Take a periodic dump — `turso db shell <name> ".dump" > backup.sql` — and keep it
somewhere private. There is no other copy once you stop using the local file.
