# Deploying Salone Playground on Railway

Salone Playground runs as **two Railway services from this one repository**, plus a MongoDB database:

| Service | Code | What it does | Config file |
| --- | --- | --- | --- |
| `game-server` | `apps/server` | NestJS + Socket.IO game server: rooms, dice, moves, turn timers, party play. Talks to MongoDB. | `apps/server/railway.json` |
| `web` | `apps/web` | The Next.js web app: the games, the online and party screens, the `/join` page for phones. Talks to the game server from each player's browser. | `apps/web/railway.json` |
| `MongoDB` | — | Rooms, guests and finished games (`rooms`, `players`, `matches`). | — |

Both services build from the **repository root**, because both use the shared rules in `packages/games`. Each `railway.json` sets the start command, a health check, restarts on failure, and watch paths so a service only redeploys when its own code (or the shared rules) changes.

Deploy in this order: **database → game server → web app → lock the game server to the web app's address.**

> **Action needed before 1 December 2026.** Railway has deprecated the `railway.json` config files ("Config as Code"). Existing files are read only until **2026-12-01**; after that, the start commands, health checks, restart policy and watch paths in `apps/*/railway.json` stop applying. Move the settings to Railway's Infrastructure as Code first: see [Moving off railway.json](#moving-off-railwayjson-before-1-december-2026).

## Before you start

- The code is on GitHub (`main` branch) and you can sign in to Railway with access to that repository.
- Never put a connection string or password in the repository. All secrets go in Railway's **Variables**.

## 1. Create the project and the database

1. In Railway: **New Project → Deploy from GitHub repo**, choose this repository. Railway creates a first service; you will set it up as the game server in step 2.
2. Add the database. Choose one:
   - **Railway MongoDB (recommended).** In the project: **+ New → Database → MongoDB**. It runs next to the game server on Railway's private network and is not reachable from the internet. Keep the service name `MongoDB` (the variable in step 2 refers to it by name). Turn on backups for its volume in the database's settings.
   - **MongoDB Atlas.** Create a database user just for the live game (read and write on the live database only). Railway's outgoing addresses are not fixed on every plan, so Atlas **Network Access** usually has to allow `0.0.0.0/0`; the password is then the only protection, so make it long and unique.

## 2. The game server

Open the service Railway created and rename it `game-server`. In **Settings**:

| Setting | Value |
| --- | --- |
| Source → Root Directory | *(leave empty: the repository root)* |
| Config-as-code → Railway Config File | `/apps/server/railway.json` |

In **Variables**:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Railway MongoDB: `${{MongoDB.MONGO_URL}}` (a reference, so the password is never copied by hand). Atlas: the live user's connection string. |
| `MONGODB_DB` | `salone_prod` — keeps live games apart from development (`salone_dev`). |
| `WEB_ORIGIN` | Leave unset for now; you set it in step 4. |
| `ROOM_HOURS`, `CPU_DELAY_MS`, `AWAY_SECONDS` | Optional. Defaults: 12 hours, 700 ms, 30 seconds. |
| `ADMIN_TOKEN` | Optional. A long random secret that opens the admin dashboard at `https://<web domain>/admin` (players online, what they play and for how long). Leave unset to keep the dashboard off. |

Do not set `PORT`: Railway sets it and the server uses it.

Then **Settings → Networking → Generate Domain** (or add your own, see below) and deploy. Check:

- The deploy log ends with `Game server listening on port … (database "salone_prod"), accepting any web address …`.
- `https://<game-server domain>/health` shows `{"ok":true}`.

## 3. The web app

In the same project: **+ New → GitHub Repo**, the same repository again. Rename the service `web`. In **Settings**:

| Setting | Value |
| --- | --- |
| Source → Root Directory | *(leave empty)* |
| Config-as-code → Railway Config File | `/apps/web/railway.json` |

In **Variables**:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_GAME_SERVER_URL` | `https://<game-server domain>` from step 2, with no slash at the end. |

Set this **before the first build**: Next.js writes it into the pages when it builds, so if it changes later, redeploy `web`.

Then **Settings → Networking → Generate Domain** and deploy. Open the domain: the games shelf should load, and Tin Tan To → PLAY → Online should say nothing about the game server being unreachable.

## 4. Lock the game server to the web app

Until now the game server accepts any website. On `game-server` → **Variables**, set:

| Variable | Value |
| --- | --- |
| `WEB_ORIGIN` | `https://<web domain>` — every address people open the web app at, comma-separated if there is more than one (for example the Railway domain and your own domain). |

Redeploy `game-server`. The log should now say `accepting https://<web domain>`. Play an online game to check; a browser on any other site is turned away.

## Your own domains (optional)

For example `play.tpgroupsl.com` for `web` and `games-api.tpgroupsl.com` for `game-server`: in each service, **Settings → Networking → Custom Domain**, then add the CNAME record Railway shows at your DNS provider. Then update `NEXT_PUBLIC_GAME_SERVER_URL` (and redeploy `web`) and `WEB_ORIGIN` (and redeploy `game-server`) to the new addresses.

## Updating

Push to `main`. Railway redeploys only the services whose watch paths changed: `apps/server/**` → game server, `apps/web/**` → web app, `packages/games/**` or the root `package.json`/`package-lock.json` → both. Rooms are saved in MongoDB after every change, so a game-server redeploy carries on games in progress (players reconnect by themselves).

When a change adds something new to how screens and the game server talk (for example Quick match's `room:quick` request), the **game server must be live before the web app**. A change that touches both usually redeploys both at once; if the web app finishes first, the new button answers "The game server did not answer" for the minute or two until the game server is up. Nothing else breaks: the game server always keeps answering older screens the old way.

### Release IDs and the RELOAD prompt

The web app knows which release it is (the Git commit, from `RAILWAY_GIT_COMMIT_SHA`, which Railway provides when a deploy comes from a GitHub push) and sends it in an `X-App-Version` header. A screen on an older release (opened from the phone's saved copy, or left open across a release) offers **RELOAD**. A deploy started another way, such as a manual redeploy without a GitHub trigger, may not have the commit; the release is then `local` and no prompt is shown. Nothing else is affected.

## The app on players' phones (service worker)

The web app keeps itself on each phone (`apps/web/public/sw.js`): its code, and the pages a player has opened, so they open again with almost no data and play against the computer with no connection. Nothing is downloaded ahead of time.

- A normal release needs nothing extra: pages come from the network first, and code files have new names in every release.
- **If phones are stuck with something broken**, change `VERSION` in `apps/web/public/sw.js` (for example `v1` → `v2`) and deploy `web`. Every phone drops what it kept and starts again from the network. The service worker file itself is never cached (`apps/web/next.config.ts` sends it with `no-store`), so phones pick up the change on their next visit.

## Region and latency

Every move goes from the player's phone to the game server, and the game server saves it to MongoDB before everyone sees it. So two delays add up: **phone → game server**, then **game server → database**.

- **Game server and web app:** Railway has no region in Africa. The closest is **EU West (Amsterdam, `europe-west4`)**: Sierra Leone's international traffic runs on the ACE undersea cable, which lands in Portugal and France. Both services run there; keep them there (each service's **Settings → Regions**).
- **Database:** it must be close to the game server, or every move pays the extra distance. For MongoDB Atlas, the cluster's region should be in or near the Netherlands, for example Google Cloud `europe-west4` (Netherlands), Azure *West Europe* (Netherlands), or AWS `eu-central-1` (Frankfurt) / `eu-west-1` (Ireland). Check it in Atlas under the cluster's name. Moving an Atlas cluster to another region is done in Atlas (**Edit Configuration**) and keeps the data.
- **Measure it:** the admin dashboard shows both delays. **Live now → Players' ping** is the median round trip from players' phones to the game server (and the slowest tenth); **Server to database** is the game server's own round trip to MongoDB. **Statistics → Typical ping** keeps the players' figure per day range, to compare before and after a change. As a rule of thumb, *Server to database* should be a few milliseconds; tens of milliseconds means the database is in another country, and around 80 ms or more means another continent.

## Moving off railway.json (before 1 December 2026)

Railway's replacement for `railway.json` is **Infrastructure as Code**: one file, `.railway/railway.ts`, describing every service in the project. Two things differ from `railway.json`:

- Railway does **not** read it when you push. Changes go live only when someone runs `railway config apply` (or a GitHub Action does it when a pull request merges).
- Applying it makes the project match the file, so anything missing from the file can be **deleted** from the project. Always read the plan before applying.

Steps (from the repository root, on a computer with the code):

1. Install and sign in to the Railway command-line tool: `npm install -g @railway/cli`, then `railway login`, then `railway link` and pick this project and the production environment.
2. Preview the generated file: `railway config migrate`. It reads both `railway.json` files and the project's current settings and merges them into one `.railway/railway.ts`. Nothing changes yet.
3. Check the preview against the list below. When it matches, write it: `railway config migrate --apply` (keep the old files for now; `--delete-files` removes them).
4. In each service's **Settings**, clear **Config-as-code → Railway Config File**, so the service stops reading `railway.json`.
5. `railway config plan`. It should show only the settings you moved. **Stop if it wants to delete a service, a variable or the database**: something is missing from the file.
6. `railway config apply`, and confirm.
7. Commit `.railway/railway.ts` (and the `railway` package it adds, if any) and delete `apps/server/railway.json` and `apps/web/railway.json` in the same commit. Push, and check that both services deploy and pass their health checks.

What the file must keep (today's `railway.json` settings):

| Setting | `game-server` | `web` |
| --- | --- | --- |
| Build command | *(none: Railway's default `npm install`)* | `npm run build -w @salone/web` |
| Start command | `npm run start -w @salone/server` | `npm run start -w @salone/web` |
| Health check path / timeout | `/health`, 120 s | `/`, 120 s |
| Restart on failure | Yes, up to 10 retries | Yes, up to 10 retries |
| Redeploy only when these change (watch paths) | `apps/server/**`, `packages/games/**`, `package.json`, `package-lock.json` | `apps/web/**`, `packages/games/**`, `package.json`, `package-lock.json` |
| Region | EU West (`europe-west4`), 1 replica | EU West (`europe-west4`), 1 replica |
| Variables | as in "Variables at a glance" below; secrets kept as they are (`preserve()`) | `NEXT_PUBLIC_GAME_SERVER_URL` |

Watch paths and the restart policy are not in Railway's Infrastructure as Code reference at the time of writing (November 2026). If the generated file leaves them out, set them in each service's **Settings** instead. Without watch paths, every push redeploys both services, which works but is slower.

Railway's guides: [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code), its [reference](https://docs.railway.com/infrastructure-as-code/reference), and [regions](https://docs.railway.com/reference/deployment-regions).

## Party play once deployed

Phones no longer need to be on the same Wi-Fi: the party screen's QR code points to the web app's public address, so anyone can join from anywhere. Open the party screen at the web app's domain.

## When something goes wrong

| What you see | Check |
| --- | --- |
| "Can't reach the game server" on the online screens | `NEXT_PUBLIC_GAME_SERVER_URL` on `web` is the game server's `https://` address and `web` was redeployed after setting it; `https://<game-server domain>/health` answers. |
| Online screens connect locally but not on the live site | `WEB_ORIGIN` on `game-server` lists the exact address in the browser bar (scheme included, e.g. `https://`). |
| Game server deploy fails its health check | The deploy log: usually `MONGODB_URI is not set`, or MongoDB refusing the connection (Atlas: user, password, Network Access). |
| The build downloads MongoDB (hundreds of MB) | It should not: the root `package.json` turns off `mongodb-memory-server`'s download, which only the tests use. |
| Moves feel slow | Admin dashboard → **Live now**: *Server to database* above a few ms means the database is far from the game server (see [Region and latency](#region-and-latency)); a high *Players' ping* with a low database time is the players' networks. |
| Phones keep showing an old or broken version | Change `VERSION` in `apps/web/public/sw.js` and deploy `web` (see [The app on players' phones](#the-app-on-players-phones-service-worker)). |
| Settings from `railway.json` stopped applying | The 1 December 2026 cutoff: see [Moving off railway.json](#moving-off-railwayjson-before-1-december-2026). |

## Variables at a glance

| Service | Variable | Required | Notes |
| --- | --- | --- | --- |
| `game-server` | `MONGODB_URI` | Yes | Secret. Railway reference or Atlas connection string. |
| `game-server` | `MONGODB_DB` | Yes | `salone_prod` |
| `game-server` | `WEB_ORIGIN` | Yes, once `web` is up | Comma-separated web app addresses. |
| `game-server` | `ROOM_HOURS`, `CPU_DELAY_MS`, `AWAY_SECONDS` | No | Tuning. |
| `game-server` | `ADMIN_TOKEN` | No | Opens the admin dashboard at `/admin`; unset keeps it off. |
| `web` | `NEXT_PUBLIC_GAME_SERVER_URL` | Yes | Public, built into the pages. |
