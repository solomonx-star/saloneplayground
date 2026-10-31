# Deploying Salone Playground on Railway

Salone Playground runs as **two Railway services from this one repository**, plus a MongoDB database:

| Service | Code | What it does | Config file |
| --- | --- | --- | --- |
| `game-server` | `apps/server` | NestJS + Socket.IO game server: rooms, dice, moves, turn timers, party play. Talks to MongoDB. | `apps/server/railway.json` |
| `web` | `apps/web` | The Next.js web app: the games, the online and party screens, the `/join` page for phones. Talks to the game server from each player's browser. | `apps/web/railway.json` |
| `MongoDB` | — | Rooms, guests and finished games (`rooms`, `players`, `matches`). | — |

Both services build from the **repository root**, because both use the shared rules in `packages/games`. Each `railway.json` sets the start command, a health check, restarts on failure, and watch paths so a service only redeploys when its own code (or the shared rules) changes.

Deploy in this order: **database → game server → web app → lock the game server to the web app's address.**

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

## Party play once deployed

Phones no longer need to be on the same Wi-Fi: the party screen's QR code points to the web app's public address, so anyone can join from anywhere. Open the party screen at the web app's domain.

## When something goes wrong

| What you see | Check |
| --- | --- |
| "Can't reach the game server" on the online screens | `NEXT_PUBLIC_GAME_SERVER_URL` on `web` is the game server's `https://` address and `web` was redeployed after setting it; `https://<game-server domain>/health` answers. |
| Online screens connect locally but not on the live site | `WEB_ORIGIN` on `game-server` lists the exact address in the browser bar (scheme included, e.g. `https://`). |
| Game server deploy fails its health check | The deploy log: usually `MONGODB_URI is not set`, or MongoDB refusing the connection (Atlas: user, password, Network Access). |
| The build downloads MongoDB (hundreds of MB) | It should not: the root `package.json` turns off `mongodb-memory-server`'s download, which only the tests use. |

## Variables at a glance

| Service | Variable | Required | Notes |
| --- | --- | --- | --- |
| `game-server` | `MONGODB_URI` | Yes | Secret. Railway reference or Atlas connection string. |
| `game-server` | `MONGODB_DB` | Yes | `salone_prod` |
| `game-server` | `WEB_ORIGIN` | Yes, once `web` is up | Comma-separated web app addresses. |
| `game-server` | `ROOM_HOURS`, `CPU_DELAY_MS`, `AWAY_SECONDS` | No | Tuning. |
| `web` | `NEXT_PUBLIC_GAME_SERVER_URL` | Yes | Public, built into the pages. |
