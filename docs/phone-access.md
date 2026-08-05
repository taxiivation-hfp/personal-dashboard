# Getting your phone talking to the local app

Two ways, for two different jobs. Neither costs anything and neither needs a card.

| | Local WiFi | Cloudflare Tunnel |
|---|---|---|
| Works away from home | no | **yes** |
| URL is stable | yes (until your IP changes) | no — a new one each run |
| Good for | checking the UI across devices | the daily Shortcut push |

---

## ⚠️ Read this before you expose anything

Your app currently runs with **no passcode** (`APP_PASSCODE=` is empty in `.env.local`),
because that's the frictionless local-dev setting. That is fine on `localhost`. It is
**not** fine the moment the app is reachable from anywhere else — including your own
WiFi, and certainly including a public tunnel URL.

Without a passcode, anyone who can reach the app can:

- POST to `/api/coach`, which spends **your** Anthropic key on a 120-second endpoint and
  can write to your board and your real Google Calendar
- read your journal, your health data and your goals

So: **set a passcode before you expose the app**, even on WiFi.

```bash
# in .env.local
APP_PASSCODE=some-long-passphrase-you-will-remember
```

Restart the dev server after changing it. The gate turns itself on as soon as the value
is non-empty. `/api/health` stays reachable for the phone without the passcode — it has
its own `x-app-secret` — so the Shortcut keeps working while the browser is gated.

---

## A. Local WiFi — usually the wrong tool, and on eduroam actively a bad idea

**Check what network you're on first.** On 2026-08-03 this machine was on `eduroam`
with the address `118.138.96.236`. That is **not** a private LAN address — `118.138.x.x`
is publicly routable, and Windows classifies the network as **Public**.

On a network like that:

- Windows Firewall's default inbound block is the *only* thing keeping your dev server
  off a public address. **Do not open port 3000 on it.** A rule scoped `-Profile Private`
  wouldn't apply here anyway (the profile is Public), so the naive fix is both wrong and
  accidentally the safer outcome.
- University and public WiFi almost always run **client isolation**, so your phone
  can't reach your laptop over that network regardless of firewall rules.

So on eduroam, or any café/airport/hotel WiFi: **use the tunnel below for everything**,
including cross-device UI checks. It's simpler and it doesn't put a dev server on a
public interface.

At home, on a genuine private network (`192.168.x.x` or `10.x.x.x`, profile `Private`),
the LAN route is fine:

1. Get the address printed by `npm run dev` as `Network:`.
2. Allow inbound 3000 for private networks only:
   ```powershell
   New-NetFirewallRule -DisplayName "Personal Dashboard dev (3000)" -Direction Inbound `
     -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
   ```
3. Open `http://<that-ip>:3000` on the phone and enter the passcode.

Check the profile before trusting that rule:

```powershell
Get-NetConnectionProfile | Select-Object Name, NetworkCategory
```

The address also moves with the network — it went `192.168.22.251` → `100.112.2.155` →
`118.138.96.236` across one session. That's precisely why the Shortcut must not use it.

---

## B. Cloudflare Tunnel — for the daily step push

A quick tunnel gives you a public `https://<random>.trycloudflare.com` URL with no
Cloudflare account, no domain and no card.

### Install `cloudflared`

Either:

```powershell
winget install --id Cloudflare.cloudflared
```

or download the single executable (no installer) from
`https://github.com/cloudflare/cloudflared/releases/latest` — the file is
`cloudflared-windows-amd64.exe`, about 50MB. Put it anywhere on your PATH.

### Run it

With `npm run dev` already running:

```powershell
cloudflared tunnel --url http://localhost:3000
```

It prints a URL like `https://tidy-otter-quiet-fox.trycloudflare.com`. That's your
public address for as long as the command keeps running.

### The catch, stated plainly

**A quick tunnel gets a NEW random URL every time you start it.** So the Shortcut's URL
goes stale whenever you restart the tunnel or reboot. That's the trade for it being free
and account-less. Your options:

- Re-paste the URL into the Shortcut when it changes (fine if you tunnel occasionally)
- Create a **named tunnel** — still free, but needs a Cloudflare account and a domain
  you control, and gives you a permanent hostname
- Deploy properly later, at which point the URL is permanent and this goes away

---

## The iPhone Shortcut

Shortcuts app → **+** → add these actions in order:

1. **Find Health Samples**
   - Type: `Steps`
   - Sort by: `Start Date`
   - Limit: off
   - Date range: `Today`
2. **Calculate Statistics**
   - Operation: `Sum`
   - Input: the output of step 1
3. **Text**
   ```
   {"steps": <the Statistic variable from step 2>}
   ```
   Insert the variable inline. Leave `date` out — the server uses today's Melbourne
   date, which is what you want.
4. **Get Contents of URL**
   - URL: `https://<your-tunnel>.trycloudflare.com/api/health`
   - Method: `POST`
   - Headers:
     - `Content-Type` → `application/json`
     - `x-app-secret` → the `HEALTH_PUSH_SECRET` value from `.env.local`
   - Request Body: `File` → the **Text** from step 3

Run it once by hand. You should get back `{"ok":true,"steps_target_met":...}` and the
Steps chip on Today should fill in with your real count.

### Make it daily

Automation tab → **+** → **Time of Day** → 21:30, Daily → run this shortcut →
**turn OFF "Ask Before Running"** (otherwise it won't fire unattended).

### What it does

Crossing 8,000 steps ticks the Steps non-negotiable, grants awareness XP once, and
closes the Physical ring. Posting repeatedly through the day is safe — the row is
upserted per day and the habit is re-derived from the current total each time, so an
early push at 3,000 won't leave a false tick behind.

Add sleep and calories later by extending the JSON with `sleep_minutes` and `calories`.
