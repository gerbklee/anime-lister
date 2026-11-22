# Anime Hub

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

## Anime, watchlists and feed

The app has five tabs (a bottom bar on phones): **Home · Lists · Discover · Watchlists · Us**. Your profile (tap your photo at the top right) holds **My anime · My manga · My type · Stats · Settings**.

- **My anime** (in your profile): your catalogue. Search AniList, mark anime as *Watched*, *Watching* (with episode progress) or *Dropped*, rate them (0.5–5 stars) and write reviews (optionally marked as spoilers). Everyone can browse everyone's catalogue.
- **Anime pages**: cover, banner, synopsis, trailer, everyone's ratings and reviews (with replies and ❤️ 😂 😮 reactions), the characters from your lists who appear in it, and its main characters with *+ List* buttons. After marking an anime as watched, it suggests ranking its characters.
- **Anime lists**: in the Lists tab, switch between 👤 Characters and 🎬 Anime. Anime lists rank anime the same way character lists rank characters.
- **Watchlists**: shared watchlists with members. Rank by priority, play trailers in the page, comment on each anime, and use **✓ Watched it** to add it to the catalogues of whoever watched it. Comments stay on the anime page afterwards.
- **Feed**: watched / started / dropped, ratings, reviews, list additions, new lists and watchlist activity, with comments and reactions. Activity in shared lists and watchlists is only shown to their members. Quick repeated changes (e.g. re-rating within 10 minutes) are merged into one event.
- **Compare → Anime**: an anime taste match (watched overlap + rating similarity), ratings side by side, biggest disagreements, favourite genres, recommendations ("rated highly by them, not seen by you") and anime-list rankings.
- **Discover**:
  - *This season*: all anime of the current season (◀ ▶ to browse other seasons), with format/genre filters, sorting, next-episode countdowns, a ▶ Trailer button per anime and **Play all trailers** (a reel with auto-advance). Anime related to ones you've seen (new seasons, side stories) are highlighted.
  - *Calendar*: everything announced for the next ~2 years, grouped by season, with exact dates where known, and a "Coming up from anime you've seen" box.
  - *For you*: recommendations from AniList's community recommendations ("fans of X also liked Y"), weighted by your ratings (5★ counts a lot, 2.5★ nothing, lower ratings and dropped anime count against). Each pick says why.
  - *Similar*: pick one anime (yours or any) to see what its fans also liked.
  - The **obscurity slider** re-ranks recommendations from mainstream hits to hidden gems (by AniList popularity). Anime in your catalogue are never recommended.
- **Pictures (no uploads)**: tap a character's picture in your list to choose another one, from AniList, MyAnimeList (via the Jikan API) or Safebooru fan art. Profile photos are chosen the same way under Profile → Settings. Chosen images are cached on the server.

Character entries added before this version are linked to their anime in the background on the first start (about 1.5 seconds per character).

## Joke lists, rankings and "My type"

- **Categories**: character lists can be marked 👨 Daddy, 👩 Mommy, 💖 Waifu, 💙 Husbando or ⭐ Other, with an emoji (menu next to the list name). Existing lists were categorised from their names.
- **Personal rankings in shared lists**: shared character and anime lists are a shared pool that every member ranks in their own order. Switch between *Mine*, the other person's ranking and *Combined* (average, with the biggest disagreements). Entries someone else added appear in your **To rank** tray until you place them. Watchlists keep one joint order.
- **⚔️ Battle sort**: "this or that" questions sort your ranking with as few questions as possible (binary insertion). *Battle all in* places only the tray entries; a full sort can be stopped and continued later.
- **🏆 Tiers**: any ranking as an S/A/B/C/D tier list (top 10% / 30% / 60% / 85% / rest), with *Save as image*.
- **Reactions & comments** (😂 😳 🔥 ❤️) on entries in shared lists and other people's lists.
- **💘 My type** (Profile): per category, your ideal type from your own rankings (higher ranks count more): looks from Safebooru fan-art tags (hair, eyes, features, style), profile facts from AniList (age, height, star sign, blood type), taste (series, genres, voice actor, popularity), a face collage, a comparison with someone else's type, and *Find your next Daddy/Waifu…*: matching characters from anime you've watched. Traits are worked out slowly in the background and cached; looks are approximate.

## Home, manga, stats and games

- **🏠 Home**: episodes airing today/this week (anime you watch or have on a watchlist), *Continue* with +1 buttons and who's ahead, the latest feed items, your "to rank" trays, and **🎲 What should we watch tonight?**: pick how much time you have and a mood; it spins through your watchlists (preferring shows you're both watching) and lands on a pick with a plan, e.g. "Episodes 6–7 (~48 min)".
- **📖 Manga**: *My manga* in your profile (Reading / Read / Dropped, chapter and volume progress, ratings, reviews), manga pages with their anime adaptations, 📖 Manga lists in the Lists tab, manga in watchlists ("Read it"), the feed, Compare and *Discover → For you*. The calendar flags anime adaptations of manga you've read.
- **🎵 Openings & endings** on anime pages, from the free [AnimeThemes](https://animethemes.moe) database.
- **📊 Stats** (profile): hours watched, chapters read, ratings, genres, studios, monthly activity, favourite characters, top rated. **🎁 Wrapped**: a slideshow for any year (slides can be saved as images); **Our Wrapped** (Us tab) for the two of you.
- **🎮 Games** (Us tab): *Guess the opening*, *Who's this character?*, *Who ranked them higher?* and *Higher or lower*. A challenge has fixed questions that each of you plays on your own phone; points for right answers and speed; head-to-head score.

## 💕 Ships (OTPs)

- **Ship board** (Lists → 💕 Ships): ships of 2–4 characters that everyone shares. Each has a name (a blended suggestion like *NaruSasu*, editable), a status (💍 Canon / 💫 Fanon / 🤡 Crack), a cover picked from fan art of the pair, and an automatic 💎 Rarepair / 🔥 Popular badge from the number of Safebooru pictures.
- **Ship-o-meter**: everyone votes 🚫 No way · 🤷 Meh · 🙂 Cute · 💕 Ship it · 💍 OTP. Ships you disagree on by two or more steps get a ⚔️ *Ship war* badge. Filters: we all ship it, ship wars, only mine, not voted, canon/fanon/crack.
- **Ship pages**: members, votes, fan art gallery, **headcanons** with reactions and replies, and a discussion thread.
- **OTP lists**: 💕 Ships lists work like other lists (personal rankings in shared lists, battles, tiers).
- **Creating ships**: *+ New ship*, *💕 Ship with…* on character pages and the 💕 next to characters in lists. Character pages also show **who fans ship them with** (most fan art together, e.g. "Levi × Erwin: 208 pictures").
- Also in: **My type** (your shipping type: canon vs crack, crossovers, rarepairs, age and height gaps), **Compare → 💕 Ships** (shipping match, ship wars), **Wrapped** (OTP of the year; Our Wrapped: the ship you fought about), **Games** (*Guess the ship* from blurred fan art, *Who ships it harder?*), the feed and push notifications (new *Ships* type in Settings).
- **💘 Ship swipe** (Ship board → Swipe): a card deck of ships you haven't voted on, what fans ship characters from your lists with, and a few random crack pairs. Swipe right 💕, left 🚫, up 💍 (or use the buttons, incl. 🤷/🙂), with undo. New pairings become ships quietly; a left swipe stores 🚫 so it never comes back. When you both ship it: **💞 It's a match** (feed + notification).
- **🏷️ Tropes**: 27 common ones (enemies to lovers, slow burn, grumpy × sunshine…) plus your own; filter the board by trope; *My type* shows your favourite tropes.
- **📍 Moments**: the scenes that made you ship it (anime, episode, text), with reactions and replies. Moments with an episode stay hidden until you've watched that far.
- **🕸️ Ship map**: characters as nodes, ships as lines (colour = canon/fanon/crack, thickness = how hard you ship it, red dashes = ship wars); pinch/drag, tap a character or a line.
- Also: **🎵 ship anthem** (an opening/ending as theme song), **📈 vote history** ("🤷 → 💍"; Wrapped: *the ship that won you over*), **📚 fanfics on AO3** link.

## 🎨 Art area (tab bar → Art)

- **✨ Home**: Art of the day (picked each morning from your characters and ships, with an optional push notification), **💘 For you** (best art of your favourite characters and ships across all sources; prepared in the background), **🔥 Trending in your series** (Danbooru's "hot" ranking for anime you watch), your boards, recent saves and artists you follow.
- **🔍 Search**: combine chips for characters, ships, series, artists and things in the picture ("rain", "kimono", "smile") with suggestions as you type; colour dots (red … pastel); filters for shape (portrait, landscape, 📱 phone wallpaper), size (HD, 4K), Best/Newest and Solo. **More like this** (same artist, same characters, or similar contents) from any Danbooru picture.
- **❓ What is this?**: reverse image search for pictures from other sources or a pasted link (IQDB; can take 1–2 minutes when busy) → artist, characters, series and the original.
- **📌 Boards**: your own collections (Pinterest-style); share a board to add pictures together. Pictures are stored on the NAS.
- **📱 Wallpaper maker**: crop any picture to phone or desktop shape with a lock-screen clock preview, then save it to Photos.
- **🖌️ Artists**: follow artists and get a notification when they post new art (checked every 3 hours).
- Watchlists moved into **Lists** (🍿 Watch, next to Characters, Anime, Manga and Ships); the gallery moved from Us to Art.
- **🌶️ Spicy art** (Settings, per person, off by default): adds suggestive but non-explicit fan art (Danbooru *sensitive*, Zerochan ecchi/fanservice, Wallhaven *sketchy*); never nudity, *questionable* or *explicit*. **Adults only**: spicy pictures appear only when every character in them is known to be 18+ (from the AniList age field, an age in the character description, or MyAnimeList; learned in the background, unknown ages rechecked every 3 days, shown under Settings → Spicy art), never with tags like loli/shota/child/aged-down, and characters without a known age get the normal art. If no source gives an age, you can verify a character in your lists as an adult by hand (✓ under Settings → Spicy art; shows who verified it, can be undone). A source age always wins over a manual one, and a character any source puts under 18 can never be verified. Spicy saves in the gallery and on boards stay hidden for people who have the switch off; games, Art of the day and Wrapped always use safe pictures.

## 🎨 Fan art & gallery

- **Three sources, ranked together**: [Danbooru](https://danbooru.donmai.us) (fan score), [Zerochan](https://www.zerochan.net) (favourites) and [Wallhaven](https://wallhaven.cc) (favourites; single characters with a full name). All are searched in parallel and cached for a few hours; Safebooru steps in if Danbooru is down.
- **Ranking is popularity only**: each picture's position within its own source becomes a 0–100 rating (pulled towards 50 when a source has few results). The same picture on several sites (same file MD5, or the same original X/Pixiv post) is merged into one entry with all links and gets +10 per extra site (badge ×2). The viewer shows why: "Top 3% on Zerochan" or "On Danbooru & Zerochan".
- **Work-safe only**: Danbooru rating *general* (checked again on the NAS), Wallhaven SFW, Zerochan with ecchi/underwear-type tags filtered out. Comics, sketches, monochrome, low-resolution and crowd pictures are filtered too; *Solo only* on character pages. Ship fan art comes from the best-scored pictures of the rarer character.
- Danbooru's image server refuses browsers, so its pictures are loaded through the NAS (`/api/fanart/img`).
- **💖 Our picks**: save pictures (♡ Save, or double-tap in the viewer). They are shared, stored on the NAS and shown first on character and ship pages and in the picture pickers.
- **🙈 Hide** a picture for both of you, everywhere (undo via the 🙈 counter).
- **Viewer**: swipe between pictures, credits, reactions on saved pictures, use as profile photo, ship cover or **in your lists** (pick which lists).
- **List portraits from any picture, with cropping**: row ⋯ → *Change picture* (fan art, saved picks or official) → *choose the area* (drag, pinch or slider, in the portrait shape), or row ⋯ → *Adjust picture area* to re-crop. The NAS cuts the area out (sharp) and keeps the original, so it can be re-cropped or reset (*Use original*).
- **Us → 🖼️ Gallery**: everything you both saved, by person and character/ship. Saving shows up in the feed; Our Wrapped has a "Picture of the year". Games prefer your saved pictures.

## Install as app & outside access (Tailscale)

Installing to the home screen and push notifications need HTTPS. [Tailscale](https://tailscale.com) (free for personal use) gives the NAS a private HTTPS address that works from anywhere, without opening ports on your router.

1. Create a Tailscale account and install the Tailscale app on both phones (and log in). Invite your partner to your tailnet (*Users → Invite*) or share the machine with them later.
2. In the Tailscale admin console → **DNS**: enable **MagicDNS** and **HTTPS Certificates**.
3. **Settings → Keys → Generate auth key** and paste it into `TS_AUTHKEY` in [deploy/omv-compose.yml](deploy/omv-compose.yml). Also set the two `/srv/...` paths.
4. In OMV, update the compose file with the new content and click **Up**. After a minute the NAS appears in Tailscale as `animelister`.
5. On a phone with Tailscale on, open `https://animelister.<your-tailnet>.ts.net`, log in (once per address), then **Profile → Settings → App & notifications**: install the app and turn on notifications. On iPhone: Safari → Share → *Add to Home Screen*, then open the installed app to turn on notifications (iOS 16.4+).

The plain `http://<NAS-IP>:3000` address keeps working at home, just without install/push.

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
