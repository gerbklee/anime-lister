# Anime Lister

A self-hosted web app for creating and maintaining numbered (ranked) lists of anime characters.

- User accounts: personal lists (others can view them read-only) and shared lists that members edit together
- A comparison page: taste match score, side-by-side ranks, who ranked what, and favourite series
- Multiple named lists, each numbered on its own
- Search-as-you-type character suggestions powered by the [AniList](https://anilist.co) API (no API key needed)
- Each entry shows the character's image, name and series; you can switch the series if they appear in several
- Reorder by drag and drop, or type a new position number into the rank
- Personal notes per entry
- Images are cached locally, so lists keep working if AniList is unavailable
- Light and dark mode

## Run with Docker

Requirements: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) or Docker Engine with the Compose plugin (Linux).

```bash
docker compose up -d --build
```

Then open:

- On this machine: http://localhost:3000
- On other devices in your network: `http://<this-machine's-IP>:3000`

To find this machine's IP on Windows, run `ipconfig` and look for the **IPv4 Address** of your active adapter (e.g. `192.168.1.42`).

### Windows Firewall

If other devices can't connect, allow inbound traffic on port 3000. Run this in an **administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Anime Lister" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

Make sure your network is set to **Private** in Windows settings (rules don't apply to Public networks with `-Profile Private`).

### Common commands

| Task                          | Command                              |
| ----------------------------- | ------------------------------------ |
| Start / update after changes  | `docker compose up -d --build`       |
| Stop                          | `docker compose down`                |
| View logs                     | `docker compose logs -f`             |

The container restarts automatically with Docker unless you stop it.

## Deploy to OpenMediaVault with automatic updates

```
git push ─► GitHub Actions builds image ─► ghcr.io/gerbklee/anime-lister:latest
                                                   │  (checked every 5 min)
                                OMV: Watchtower ◄──┘ pulls it and restarts anime-lister
```

### One-time setup

1. **GitHub:** push this repository to `github.com/gerbklee/anime-lister`. The workflow in
   [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml) builds the image
   (amd64 + arm64) on every push to `main`. Progress shows in the repo's **Actions** tab.
2. **Make the image public (first time only):** on GitHub, open your profile → **Packages** →
   `anime-lister` → **Package settings** → *Change visibility* → **Public**. Then OMV can pull it
   without logging in.
3. **OMV:** install the `openmediavault-compose` plugin (needs omv-extras), and set it up under
   **Services → Compose → Settings**. Create a shared folder for app data (e.g. `appdata`).
4. **Create the stack:** go to **Services → Compose → Files → Add**, name it `anime-lister`, and paste
   [deploy/omv-compose.yml](deploy/omv-compose.yml). Change the `/srv/...` path to your
   shared folder's path. Save, select it, and click **Up**.
5. Open `http://192.168.0.123:3000`.

### Updating

Commit and `git push`. That's it. About 5 minutes for the build plus up to 5 minutes for
Watchtower's next check, and the new version is live. Your data is untouched.

To see what Watchtower did: **Services → Compose → Containers**, then the logs of
`anime-lister-watchtower`.

To roll back, change `:latest` in the OMV stack to a previous `sha-xxxxxxx` tag (listed on the
package page on GitHub) and click **Up**.

## Accounts and sharing

- Anyone can sign up on the login page. Each device stays logged in (sessions last a year and extend while in use).
- **Personal lists**: only the owner edits; every logged-in user can view them read-only. They count in comparisons.
- **Shared lists**: the owner invites people by username; members can add, remove, reorder and write notes. Only the owner can rename, delete or manage members; members can leave. Entries show who added them. Shared lists don't count in comparisons.
- Open lists refresh every 5 seconds, so you see each other's changes. If a reorder clashes with someone else's change, the list reloads.
- **Upgrading from the single-user version**: on first start the database is backed up to `anime-lister.backup-v1.db`, and the existing lists become shared lists owned by **the first account that signs up**.

### Compare

Compares all personal lists of two people. Each position is scored as `1 - (rank - 1) / list length` (#1 is always 1.0), and a character in several lists counts with its best score. The taste match is 40% overlap (shared characters relative to the smaller collection) plus 60% ranking similarity (1 minus the average score difference).

## Data and backups

All data lives in the `./data` folder next to `docker-compose.yml`:

- `data/anime-lister.db`: SQLite database (lists, entries, notes)
- `data/images/`: cached character images

To back up, stop the container (`docker compose down`) and copy the `data` folder. To restore, put the folder back and start again.

## Development (without Docker)

Requires Node.js 20+.

```bash
# Terminal 1: API server on :3000
cd server
npm install
npm run dev

# Terminal 2: frontend dev server with hot reload on :5173 (proxies /api to :3000)
cd client
npm install
npm run dev
```

## How it works

```
Browser ──► :3000 Express server
              ├─ serves the built React app
              ├─ /api/lists, /api/entries   lists, entries, ordering
              ├─ /api/search?q=             proxies AniList search (cached 10 min)
              └─ /images/*                  locally cached character images
            SQLite + images ──► ./data
```

- **Search** goes through the server, which caches results so AniList's rate limit (~90 requests/min) isn't hit while typing.
- **Adding** a character: the server fetches it from AniList by ID, downloads the image into `data/images`, and appends it to the end of the list.
- **Series** shown defaults to the character's most popular anime/manga; all other appearances are offered in a dropdown.
- A character can only appear once per list (the same character can be in several lists).

### API

| Method | Path                         | Body                         |
| ------ | ---------------------------- | ---------------------------- |
| GET    | `/api/lists`                 |                              |
| POST   | `/api/lists`                 | `{ name }`                   |
| GET    | `/api/lists/:id`             | returns list with `entries`  |
| PATCH  | `/api/lists/:id`             | `{ name }`                   |
| DELETE | `/api/lists/:id`             |                              |
| PUT    | `/api/lists/:id/order`       | `{ entryIds: [...] }`        |
| POST   | `/api/lists/:id/entries`     | `{ anilistId }`              |
| PATCH  | `/api/entries/:id`           | `{ note?, seriesTitle? }`    |
| DELETE | `/api/entries/:id`           |                              |
| GET    | `/api/search?q=`             |                              |

Character data and images are provided by [AniList](https://anilist.co).
