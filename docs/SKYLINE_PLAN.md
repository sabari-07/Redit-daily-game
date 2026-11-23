# SKYLINE: Complete Build Plan (for Claude Code)

A daily 3D rooftop puzzle for Reddit (Devvit Web + three.js). The city is built each day from the
subreddit's own top posts. This document is the single source of truth. Hand it to Claude Code
phase by phase. Do not skip phases. Do not merge phases.

HOW TO USE
1. Create an empty folder `C:\Users\DS\Desktop\hack\skyline` (a NEW project; do not touch Door Policy).
2. Copy Section 1 (the "CLAUDE.md" block) into `skyline/CLAUDE.md`. Claude Code reads it every session.
3. Copy this whole file to `skyline/docs/SKYLINE_PLAN.md`.
4. Paste the Phase prompts from Section 9 one at a time. Start the next phase only after the
   current phase's acceptance checklist passes.

---------------------------------------------------------------------------------------------------

## 0.5 TARGET CONTEST AND ITS RULES (read before anything else)

Contest: **Reddit's Game of the Day Hackathon** (https://redditgameofday2026.devpost.com/).
Deadline: **Dec 8, 2026, 6:00pm PST**. Must be built on Devvit Web. Judged from a PUBLIC DEMO POST.

Judging criteria and how Skyline answers each one:

| Criterion | What judges want | Skyline's answer | Where in this plan |
|---|---|---|---|
| Delightful UX | Exciting layout and theme, easy and fun to discover | 3D neon-dusk city, tap-to-preview arcs, instant feedback | 7, 8 |
| Polish | As close to launch-ready as possible, Devvit-rules compliant, self-explanatory demo post | Quality tiers, no layout overflow, error states, tested rules, mobile-first | 7.6, 8, Phase 6, 8 |
| Reddit-y | Community-minded, own identity, uses comments/flair/feeds, NOT about Reddit itself | City is made from the community's own feed. Buildings open the real post. Result can be posted as a comment. Flair shapes building style | 0, 3.2, 8.2, 8.5 |
| Daily Content | Fresh, fair, solvable, well calibrated daily challenge | New city every day per community, solver-verified, par range 5-12 | 3.4, 3.5, 5.5 |

The contest page also lists what makes a game stand out. These are REQUIREMENTS for this build:
1. **Intuitive onboarding:** meaningful play within seconds. NO multi-step tutorial overlay and NO wall of text. Use contextual hints (Section 8.8).
2. **Visual craft:** clear identity, accessible contrast, legible text, uncluttered controls, responsive feedback. No generic unstyled components.
3. **Calibrated daily content:** legible, fair, solvable, with a sensible difficulty curve (Section 3.4/3.5 and 5.9).
4. **Focused gameplay:** the start screen shows only name, description, date, attribution and stats. During play, remove secondary clutter (Section 8.2/8.4).
5. **Clear end state and re-engagement:** ONE result card with ONE primary next step (comment/share) and visible streak/stats. No stacked end screens (Section 8.5).
6. **Devvit Journeys instrumentation:** required for analytics, leaderboard tracking and streak verification (Section 5.8).

What the contest does NOT want, and the countermeasures built into this plan:
- **"AI slop":** the UI must fit the viewport with no scrolling, have a unique identity (Section 7.1), and feel handmade.
  Every screen needs real art direction. No default browser buttons, no lorem text, no emoji used as the main icon set.
- **"On the nose Reddit theming":** the game must NOT be about karma, upvotes, subreddits or Snoo. Therefore:
  - The world is a neutral night city. User-facing words are **Buzz** (post score) and **Chatter** (comment count).
  - The words "karma", "upvote", "subreddit" and "Snoo" never appear in game UI copy. Do not use the Reddit alien, orange-red as a brand color, or Reddit logos.
  - Reddit data is only the SEED that shapes the city and the building signs. The player's goal is a rooftop route puzzle.
  - The Reddit-y part is community participation: the city is the community's day, buildings open the real thread, results can be shared as a comment, flair adds visual variety.
- **Common ideas** (space shooters, clones, simple platformers, collab storytelling, trivia): Skyline is none of these.
- **Games not on Reddit:** must run inside a Reddit post. Playtest on Reddit early (Phase 0 and Phase 7), not at the end.
- **Publishing:** DO NOT run `devvit publish`. Only `npx devvit upload` and `npx devvit playtest`. Reddit asks that apps are not submitted for review until after the contest. The app may stay private.

What to submit (Phase 8 prepares all of it):
- App listing link on developers.reddit.com.
- Public demo post in a subreddit you own that runs the game. The post must be self-explanatory.
- Optional developer feedback survey link (https://forms.gle/dW45UgK6SctevE756).

---------------------------------------------------------------------------------------------------

## 0. PRODUCT SUMMARY (read first)

- Name: Skyline.
- One sentence: every day the game turns the subreddit's top posts into a 3D night city, and you
  find the shortest rooftop route from the newest/smallest building to the Summit (today's #1 post).
- Why it is Reddit-y (without being "about Reddit"): the level is made from the community's own day.
  Each community gets a different city every day with zero hand-made levels. Players can open any
  building's real thread, and share their result as a comment. The theme itself stays a neutral night city.
- Daily loop: one new city per day per subreddit. One leaderboard per subreddit per day. Streaks.
- Social: ghost routes (how other players solved it, unlocked after you finish), result sharing as
  a comment, "open the post" on any building.
- Honest platform limits (do not design around things that cannot exist):
  - Devvit Redis is scoped per app installation (per subreddit). A cross-subreddit global
    leaderboard is NOT possible without an external backend. Do NOT build one. Per-subreddit only.
  - The client may not call any external domain. No CDN, no Google Fonts, no remote textures,
    no analytics. Everything is bundled.
  - Server requests are short (max 30s, 4MB payload). No websockets, no streaming.
  - localStorage is wiped on every app update. Persist anything important in Redis.

---------------------------------------------------------------------------------------------------

## 1. CLAUDE.md (copy this block into the repo root as CLAUDE.md)

```
# CLAUDE.md: Skyline

You are building "Skyline", a Reddit Devvit Web game with three.js. Follow docs/SKYLINE_PLAN.md.

## Absolute rules
1. Work ONE phase at a time. Never start work from a later phase. At the end of each phase run
   the acceptance checklist and print PASS/FAIL per item. Fix failures before stopping.
2. TypeScript strict mode everywhere. No `any`, no `@ts-ignore`, no non-null `!` unless justified
   in a comment. No unused code, no TODO stubs, no placeholder data in production paths.
3. Game rules live ONLY in `src/shared/` as pure functions with no DOM, no three.js, no Devvit
   imports. Client and server both import them. The server re-simulates every submitted run with
   these same functions. Never duplicate rule logic in the client or the server.
4. No external network access from the client. No CDN links, no remote fonts/images/audio.
   All assets are bundled or generated in code (procedural textures, synthesized audio).
5. Verify Devvit APIs against the official docs/types before using them
   (https://developers.reddit.com/docs). If an API name or field is uncertain, read the installed
   type definitions in node_modules/@devvit/*. NEVER guess a field name.
6. Never log secrets. Never render raw HTML from post titles. Titles are untrusted text:
   draw them via canvas fillText or textContent only, never innerHTML.
7. Exclude NSFW, spoiler, removed, deleted and stickied posts from the city. Truncate titles to
   60 chars. Strip control characters. Run a basic profanity-mask on rendered titles.
8. Performance budget is a hard requirement (Section 7.6). Dispose every geometry, material and
   texture you create. No per-frame allocations in the render loop.
9. Run `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build` before declaring
   any phase done. Paste their results.
10. Do not add dependencies beyond those listed in the plan without asking. Do not edit files
    outside the `skyline/` folder.
11. Keep commits small. One commit per completed task with a clear message.
12. If a requirement is ambiguous, ask a question BEFORE coding. Do not invent requirements.
13. Contest rules (plan Section 0.5) are requirements. Never run `devvit publish`; use upload and playtest only.
14. User-facing copy never contains the words karma, upvote, subreddit, Snoo. Use "Buzz" (score), "Chatter" (comments) and "community".
15. The UI must fit the viewport with zero page scroll from 360x640 up to 1920x1080 (use 100dvh and safe-area insets).
    No generic default-styled controls. Every control uses the design tokens in plan Section 8.1.
16. Add Devvit Journeys events exactly as plan Section 5.8. Never put usernames or other personal data into event fields.

## Style
- Small modules, named exports, no default exports except where tools require them.
- Pure functions in shared/. Side effects only at the edges (server routes, scene, DOM).
- Comments explain WHY, not WHAT.
```

---------------------------------------------------------------------------------------------------

## 2. TECH STACK (fixed; do not substitute)

| Concern | Choice |
|---|---|
| Platform | Reddit Devvit Web (`@devvit/web`), latest stable |
| Language | TypeScript, strict |
| Bundler | Vite (client) and a CJS server bundle (Devvit requires CommonJS server output) |
| 3D | `three` + `three/examples/jsm` (EffectComposer, UnrealBloomPass, OutputPass, SMAAPass) |
| UI | Vanilla TypeScript + DOM + CSS (no React). HUD is an HTML overlay above the canvas |
| Server | The framework used by the official Devvit three.js template (Express or Hono). Endpoints under `/api/`, internal under `/internal/` |
| Storage | Devvit Redis |
| Tests | Vitest (shared rules, generator, solver, validator) |
| Lint | ESLint + Prettier |
| Audio | WebAudio synthesis in code (no audio files) |
| Fonts | System font stack only. Optionally one bundled woff2 subset (same origin) |

Start from the official template: https://developers.reddit.com/new (choose the three.js template),
or the Reddit three.js example repo. Keep its `devvit.json`, `src/client`, `src/server` layout.

### 2.1 Folder layout

```
skyline/
  CLAUDE.md
  devvit.json
  package.json
  docs/SKYLINE_PLAN.md
  assets/icon.png                 (1024x1024, generated in Phase 8)
  src/
    shared/                       PURE. no DOM/three/devvit imports
      types.ts                    all shared types (Section 4)
      rng.ts                      seeded RNG + string hash
      sanitize.ts                 title cleaning + profanity mask
      city.ts                     buildCity(posts, seed) -> City
      rules.ts                    canJump, applyMove, simulateRun
      solver.ts                   BFS solver -> par + solvable
      scoring.ts                  computeScore
      date.ts                     UTC day key helpers
      *.test.ts
    server/
      index.ts                    server bootstrap + routes
      reddit.ts                   fetching posts (wrapped, mockable)
      cityStore.ts                snapshot create/get with lock
      runs.ts                     submit/validate/leaderboard/ghosts
      streaks.ts
      posts.ts                    create daily custom post
      scheduler.ts                cron handlers
    client/
      splash.html + splash.ts     inline view (small 3D preview + Play button)
      game.html  + main.ts        expanded view (full game)
      api.ts                      typed fetch wrappers
      telemetry.ts                the ONLY module that calls the Devvit Journeys SDK (5.8)
      mock.ts                     ?mock=1 fixture data for local dev
      scene/
        renderer.ts               renderer, composer, quality tiers
        cityView.ts               builds meshes from City
        buildings.ts              instanced windows, roofs, signs
        sky.ts                    gradient sky, stars, fog, moon
        courier.ts                player avatar + jump animation
        arcs.ts                   jump preview arcs + highlights
        ghosts.ts                 ghost route lines
        camera.ts                 orbit/pan/zoom controller + focus tweens
        effects.ts                particles (landing dust, gold sparkle, collapse)
      ui/
        hud.ts, inspector.ts, tools.ts, leaderboard.ts, result.ts, hints.ts, toast.ts
        styles.css                design tokens + components
      audio.ts
      state.ts                    single client game state + event emitter
  tools/
    gen-icon.ts                   generates assets/icon.png
```

---------------------------------------------------------------------------------------------------

## 3. GAME RULES (authoritative; implement exactly in `src/shared/`)

### 3.1 Terms
- City: up to 24 Buildings placed on a flat XZ plane. Y is up. Units are "tiles" (1 tile = 1 unit).
- Building: derived from ONE Reddit post.
- Floor: 1 unit of height.

### 3.2 Building properties (derived, deterministic)
Let `s = score` (upvotes, min 0) and `c = numComments` (min 0) of the post.
- `height` (floors, integer 2..12): `2 + round(10 * norm(ln(s+1)))` where `norm` scales linearly
  between the min and max of `ln(s+1)` across the chosen posts (if min==max use 0.5).
- `size` (tiles, odd integer 3 or 5): footprint is a square of side `size`.
  `size = 5` if `c` is in the top third of comment counts in the city, else `3`.
- Tags (a building can have several):
  - `summit`: the building with the highest score. Exactly one. Goal.
  - `start`: the lowest-height building (ties: lowest score, then id order). Exactly one. Never equals summit.
  - `gold`: the 4 buildings with the highest comment counts, excluding start and summit. Landing on
    it for the first time in a run gives +50 bonus points. Gold never affects par.
  - `cracked`: `c >= 20` and `c >= 0.8 * s`. ("Heated thread".) After the courier leaves a cracked
    building it collapses permanently and cannot be entered again in that run. Start and summit
    can never be cracked (clear the tag).

### 3.3 Jumps
The courier stands on exactly one building. A move jumps to another building.
`gap` = shortest XZ distance between the two square footprints (0 if they overlap; never 0 in a valid city).
`rise` = `target.height - current.height` (floors, may be negative).

| Jump | Max gap | Max rise | Cost |
|---|---|---|---|
| walk (free) | 4 | 2 | none |
| glide | 9 | 0 (target must be same height or lower) | 1 glide charge |
| grapple | 7 | unlimited | 1 grapple charge |

- Each run starts with 2 glide charges and 2 grapple charges.
- If a move satisfies several jump types, the cheapest type is used (walk < glide < grapple) unless
  the player explicitly picked a tool. An explicitly picked tool is used if valid, else the move is rejected.
- A move to a collapsed building, to the current building, or out of range is INVALID.
- A run is WON when the courier lands on the summit.
- A run is LOST (no moves left) when moves used == `maxMoves` and the summit is not reached.
  `maxMoves = min(20, par + 8)`.

### 3.4 Par and solvability
`solver.ts` runs BFS over states `(buildingIndex, glideLeft, grappleLeft, collapsedMask)` and returns the
minimum number of moves to the summit (`par`) or `null` if unreachable.
A generated city is accepted only if `5 <= par <= 12` and it also satisfies the weekday difficulty band and the "at least 2 good routes" rule in Section 5.9.

### 3.5 City generation (deterministic)
Input: eligible posts (already filtered, Section 5.2) and `seed` string = `${subreddit}:${YYYY-MM-DD}`.
1. Take the top 24 posts by score (fewer if fewer exist, min 12; see 5.3 for fallback).
2. Seed RNG with FNV-1a hash of seed + attempt number.
3. Place the summit near the center. Place the rest by score order on expanding rings with seeded
   jitter. Hard constraints: footprints never overlap, and the minimum gap between any two buildings is 1.5 tiles.
   Overall layout fits inside a 70x70 tile area.
4. Compute tags, run the solver. If invalid, retry with `attempt + 1`, up to 300 attempts.
5. If still invalid after 300 attempts, relax the par range to `4..14`. If still invalid, throw
   (the server must then fall back to the "Empty lots" fill, Section 5.3).
Same inputs MUST always yield the exact same City. Test this.

### 3.6 Scoring
```
points = max(100, 1000 + 150 * (par - moves)) + 50 * goldCollected
```
`moves` counts every jump. Leaderboard order: `points` desc, then `submittedAt` asc (earlier wins ties).
Only a WON run is scored. One best score per user per day is kept. Unlimited retries.

### 3.7 Run validation (server)
The client submits `{ moves: Move[] }` where `Move = { to: number; tool: 'auto'|'glide'|'grapple' }`.
The server loads the stored City, runs `simulateRun(city, moves)`, and accepts ONLY if it returns
`won: true`. The server computes points itself. Never trust client points or time.

---------------------------------------------------------------------------------------------------

## 4. SHARED TYPES (put in `src/shared/types.ts`; do not rename)

```ts
export type Tag = 'summit' | 'start' | 'gold' | 'cracked';
export type Tool = 'auto' | 'glide' | 'grapple';

export interface RawPost {
  id: string;            // e.g. "t3_abc"
  title: string;
  score: number;
  numComments: number;
  permalink: string;     // path or url as returned by Devvit
  flair?: string;
}

export interface Building {
  index: number;         // 0..n-1, stable
  postId: string;
  title: string;         // sanitized, <= 60 chars
  score: number;
  numComments: number;
  permalink: string;
  x: number; z: number;  // center in tiles
  size: 3 | 5;
  height: number;        // floors 2..12
  tags: Tag[];
}

export interface City {
  version: 1;
  subreddit: string;
  dayKey: string;        // YYYY-MM-DD (UTC)
  seed: string;
  buildings: Building[];
  startIndex: number;
  summitIndex: number;
  par: number;
  maxMoves: number;
}

export interface Move { to: number; tool: Tool; }

export interface RunResult {
  won: boolean;
  moves: number;
  goldCollected: number;
  points: number;
  path: number[];        // building indices visited, including start
  error?: string;
}

export interface LeaderboardEntry { username: string; points: number; moves: number; rank: number; }

export interface GhostRoute { path: number[]; count: number; }   // top routes by popularity

export interface InitResponse {
  city: City;
  username: string;
  postId: string;
  myBest: { points: number; moves: number; path: number[] } | null;
  streak: number;
  hasFinished: boolean;
}
```

---------------------------------------------------------------------------------------------------

## 5. SERVER SPEC

### 5.1 Endpoints
All client-facing routes start with `/api/`. Internal (triggers, menu, scheduler) start with `/internal/`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/init` | Returns `InitResponse` for the current post's subreddit and the post's day |
| POST | `/api/run` | Body `{ moves: Move[] }`. Validates, scores, stores best, updates edges + streak. Returns `RunResult` plus `rank` |
| GET | `/api/leaderboard` | Top 20 + the caller's own rank |
| GET | `/api/ghosts` | Top 3 `GhostRoute`s. Returns 403 unless the caller has a won run today |
| POST | `/api/share-comment` | Posts the result text as a comment as the user (needs explicit button click). Rate-limit: once per day per user |
| POST | `/internal/menu/create-post` | Moderator menu: create today's Skyline post |
| POST | `/internal/triggers/on-app-install` | Create the first post |
| POST | `/internal/cron/daily` | Scheduler: generate the new city and create the day's post |

Every route: validate input shape and size (reject `moves.length > 25`, any index outside range),
return JSON `{ error: string }` with proper status codes on failure.

### 5.2 Fetching and filtering posts (`reddit.ts`)
- Use the Devvit Reddit API through `@devvit/web/server`. Verify the exact method names and
  returned field names in the installed types (for example top/hot post listing with a timeframe).
- Primary source: top posts of the last 24 hours (`day`), limit 100, from the configured source communities (see 5.3 step 0). Calling the Reddit API for other public communities is allowed server-side.
- Filter OUT: NSFW, spoiler, removed/deleted, stickied/pinned, empty titles, duplicates.
- Sanitize titles with `shared/sanitize.ts` (trim, collapse whitespace, strip control chars,
  truncate to 60 chars with ellipsis, mask a small built-in blocklist with asterisks).
- Wrap all Reddit calls behind an interface so tests and `?mock=1` can swap in fixtures.

### 5.3 Fallbacks for small or quiet communities (CRITICAL for the demo post)
0. Judges play in the demo post. A new or tiny demo community has few posts, which would produce a city full of empty lots and look broken.
   Therefore the community moderator can set `sourceCommunities` (5.7) so the city is built from larger public communities instead.
   Source order: `sourceCommunities` if set and valid, else the install community. Fetch from each (top of the day, limit 50), merge, dedupe by post id,
   then rank by score. Never mix NSFW. Titles still come only from public, non-removed posts.
1. If fewer than 12 eligible posts: widen to top of `week`, then `month`, then `all`.
2. If still fewer than 12: pad with "Empty lot" buildings (title "Empty lot", score 0, comments 0,
   no permalink, no inspector "Open post" button, never gold/cracked).
3. If city generation throws: log and create a city from padded fallback only.

### 5.4 Redis keys (all prefixed `sky:`; the install is already scoped to one subreddit)
```
sky:city:{dayKey}                 string  JSON City (immutable once written, written with SETNX style lock)
sky:lock:{dayKey}                 string  short-lived lock (expire 30s) while generating
sky:lb:{dayKey}                   zset    member=userId, score=encoded rank score
sky:run:{dayKey}:{userId}         string  JSON {points, moves, path, username, submittedAt}
sky:edges:{dayKey}                hash    field="{a}>{b}", value=count (only from WON runs, one per user)
sky:routes:{dayKey}               hash    field=path joined by "-", value=count
sky:streak:{userId}               hash    {last: dayKey, count: n}
sky:share:{dayKey}:{userId}       string  "1" once shared
```
Encoded leaderboard score: `points * 1e6 - submittedAtSeconds % 1e6` is NOT acceptable.
Use: `score = points * 1_000_000_000 + (1_000_000_000 - (submittedAtMs - dayStartMs))` so higher points win and earlier wins ties,
and verify the number stays below 2^53. Add a unit test.
Set a TTL of 14 days on all per-day keys.

### 5.5 Daily generation
- Scheduler cron `0 0 * * *` (00:00 UTC) calls `/internal/cron/daily`.
- It computes `dayKey`, builds the city (with lock), stores it, and creates a custom post titled
  `Skyline #{dayNumber} · {top post title truncated to 40}` through the Devvit custom post API.
- `/api/init` also lazily creates the city if missing (guarded by the lock) so the game never breaks.
- `dayNumber` = days since the first stored city (store the epoch day in Redis at first install).

### 5.6 Streaks
On a won run: if `last == yesterday` then `count+1`, else if `last == today` unchanged, else `1`.

### 5.7 `devvit.json` requirements
- `$schema` present. `name` is 3-20 chars lowercase (use `skyline-daily`).
- `post.entrypoints`: `default` (splash, height `regular`) and `game` (expanded, height `tall`).
- `server`: `dist/server/index.js`, CJS bundle.
- `permissions`: `redis: true`, `journeys: true`, `reddit: { enable: true, asUser: ["SUBMIT_COMMENT"] }`. No `http` domains.
- `settings.subreddit` (moderator-configurable per install; verify the schema in the Settings docs):
  - `sourceCommunities` (type `string`, default empty, helpText "Optional. Comma-separated communities to build the city from, e.g. `pics, AskReddit`. Leave empty to use this community."). Add a `validationEndpoint` (`/internal/settings/validate-sources`) that accepts at most 5 names matching `^[A-Za-z0-9_]{2,21}$`.
  - `cityFlavor` is NOT needed. Do not add more settings than this one.
  - Read with `settings.get("sourceCommunities")` from `@devvit/web/server`. Max 2KB per value.
- `triggers.onAppInstall`, `scheduler.tasks.daily`, `menu.items` for moderators (create post).
- `scripts.build` and `scripts.dev`. `marketingAssets.icon: assets/icon.png`.

---------------------------------------------------------------------------------------------------

### 5.8 Devvit Journeys (required by the contest; verify against https://developers.reddit.com/docs/capabilities/analytics/devvit-journeys)
- `devvit.json`: `"permissions": { "journeys": true }`. Client uses `telemetry` from `@devvit/analytics/client/reddit`.
  Server mounts `createTelemetryRouter()` from `@devvit/analytics/server/reddit` (Hono or Express adapter, matching the chosen framework).
- Rules from the docs (follow strictly, violations can delay approval):
  - `Journey.Start` fires ONLY when the player explicitly presses `Play` / begins a run. Never on app load or page view.
  - Fire on committed actions only (mouseup/touchend or confirmed jump), never on mousedown/touchstart.
  - No personal data (no usernames, no post titles) in `action` or `actionDetails`.
  - Journeys only emit after the app is approved/allowlisted; events may be dropped during playtest. That is expected. Code must never break if telemetry fails (wrap in try/catch, no awaits on the critical path).
- Event map (put in `src/client/telemetry.ts`, one small typed wrapper, nothing else calls the SDK directly):

| Moment | Event | Fields |
|---|---|---|
| Game interactive | `App.Ready` | none |
| Player presses Play / starts a run | `Journey.Start` | none |
| Each committed jump | `Journey.Progress` | `progress = min(0.95, moves / par)`, `action: "jump"`, `actionDetails: tool type` |
| Undo, Reset, open leaderboard, open ghosts, open thread, share | `Journey.Interaction` | `action` only (e.g. `"undo"`, `"reset"`, `"open_leaderboard"`) |
| Win | `Journey.End` | `complete: true`, `game: { win: true, score: points }` |
| Out of moves | `Journey.End` | `complete: false`, `game: { win: false, score: 0 }` |
| Player leaves mid-run (visibilitychange hidden, once) | `Journey.End` | `complete: false` |

- Streak verification and leaderboard integrity still come from the server's own validation (3.7). Telemetry is analytics, not the source of truth.

### 5.9 Calibrated difficulty (contest asks for "fair, solvable, well-calibrated")
- Daily difficulty curve by UTC weekday: Mon-Tue target par 5-6, Wed-Thu par 7-8, Fri par 9-10, Sat-Sun par 10-12. The generator picks the first attempt whose par falls in that band; if none in 300 attempts, widen to the global 5-12 range.
- Store `par` and `difficulty` label (`Easy|Medium|Hard`) in the City and show it in the top bar as a small chip.
- Every city must have at least 2 distinct optimal-or-near-optimal routes (solver counts routes with `moves <= par + 1`; require >= 2) so Ghosts and discussion are interesting.
- Include a generator test that sweeps 365 consecutive dates over 5 fixture communities and asserts: always solvable, always inside the band or the widened range, never identical to the previous day's layout.

## 6. GAMEPLAY AND CONTROLS (client)

### 6.1 Flow
1. Splash (inline post): slowly rotating mini-city render + title + "Play" button
   (`requestExpandedMode` to the `game` entrypoint).
2. Game loads `/api/init`. If `hasFinished`, show "You finished today" panel with Results and Ghosts available.
3. First visit: NO tutorial screen. Play starts immediately with contextual hints (Section 8.8). Hints stop once the user has made 3 moves (store flag in Redis, key `sky:hints:{userId}`).
4. Play: select a target building, confirm by tapping it again (or press the Jump button).
5. Win: result card, leaderboard, ghosts unlock, share button.
6. Lose: "Out of moves" card with Retry (resets run, not the city).

### 6.2 Interaction details
- Tap/click a building: it becomes Selected. The inspector card opens. A glowing arc previews the
  jump from the courier to the selected building. Arc color: cyan = valid walk, violet = glide,
  amber = grapple, red dashed = invalid (with a one-line reason: "Too far", "Too high", "Collapsed").
- Tap the selected building again, or press the primary "Jump" button, to execute the move.
- Valid targets are always softly highlighted with a pulsing rim light so players never guess.
- Tool buttons (Auto / Glide / Grapple) show remaining charges. Auto is default.
- Undo reverts the last move (restores collapse/charges/gold). Reset restarts the run. Both free.
- Keyboard (desktop): Arrow keys/WASD pan, Q/E rotate, mouse wheel zoom, `Enter` jump, `Z` undo, `R` reset, `1/2/3` tools, `Esc` deselect.
- Touch: one-finger drag rotates, two-finger drag pans, pinch zooms, tap selects. Hit targets min 44x44 px.
- Camera auto-focuses (smooth 600ms) on the courier after each move; "Recenter" button available.
- Every move is recorded in `state.moves`. On win, POST to `/api/run`.

---------------------------------------------------------------------------------------------------

## 7. 3D ART DIRECTION AND ENGINEERING (this is what wins screenshots)

### 7.1 Look: "Neon Dusk Low-Poly"
A calm, cosy, glowing night city. Think miniature toy diorama seen from above at dusk. Clean shapes,
soft light, readable at thumbnail size. NOT realistic, NOT noisy.

Palette (CSS variables and three.js colors; use exactly these):
```
--bg-top:        #0b1026   (sky top)
--bg-horizon:    #3a2a6b   (sky mid)
--bg-glow:       #ff7a59   (horizon glow)
--ground:        #0f1630
--building-base: #1b2347   (walls)
--building-alt:  #232c5a
--window-warm:   #ffd58a
--window-cool:   #8fd3ff
--accent-cyan:   #34e0ff   (walk, selection)
--accent-violet: #9b7bff   (glide)
--accent-amber:  #ffb347   (grapple, gold)
--summit:        #ff4fa3   (goal beacon)
--danger:        #ff5c6c   (cracked, invalid)
--text:          #eef1ff
--text-dim:      #9aa3cf
--panel:         rgba(14,19,44,0.72)
```

### 7.2 Scene composition
- Ground: a large dark plane with a faint procedural grid (shader or CanvasTexture), plus soft radial vignette fading to fog.
- Buildings: extruded boxes. Height = floors * 1.0 unit * 1.6 world scale. Add a 0.25 tile roof slab (slightly lighter) and a small rooftop detail
  set (antenna, water tank, vent) chosen by seeded RNG, all merged/instanced.
- Windows: ONE `InstancedMesh` of emissive quads for the whole city (not per building). Window density scales with `numComments`
  (more comments = more lit windows, up to 70% lit). Lit windows alternate warm/cool tones. Subtle slow flicker for ~5% of windows via instance color update in a throttled loop (every 200 ms, max 40 instances).
- Roof sign: a billboard (Sprite or plane facing camera on Y axis) per building showing the title.
  Render titles to a CanvasTexture (pill shape, rounded, `--panel` background, 2-line wrap, ellipsis).
  Use ONE texture atlas (max 2048x2048) for all 24 signs. Show signs only for hovered/selected/valid-target/summit/start
  buildings when zoomed out; fade in others when camera is close (distance < 28 units).
- Metadata badges at the roof corner: small icon-pills for Buzz (score, flame/spark icon) and Chatter (comment count, speech-bubble icon) rendered into the atlas (no emoji fonts: draw simple vector icons on canvas).
- Flair variety: if a post has flair, hash the flair text to pick one of 6 roof-trim colors from the palette (accent colors only) so communities with flair see visual variety. No flair = default trim. Never display flair text as a Reddit-branded label.
- Tag visuals:
  - summit: tall pink light beam (additive cone/cylinder, animated opacity), pulsing ring on the roof, a floating crown/star mesh slowly rotating.
  - start: green-cyan landing pad ring with "START" sign.
  - gold: amber glowing hex coin hovering and rotating, sparkle particles.
  - cracked: red hairline crack decals (emissive lines on the roof), small slow ember particles, wall tint shifts to a warm red.
- Collapse effect: roof tiles split into 8-12 debris boxes, fall with gravity for 800 ms, fade, then the building is shown as a dark rubble stub (height reduced to 15%).
- Sky: vertical gradient (shader on a large sphere) from `--bg-top` to `--bg-horizon` to `--bg-glow` near the horizon; 150 twinkling stars (Points, shader twinkle); a large soft moon sprite.
  Distant silhouette skyline ring (low-cost instanced boxes) at radius ~120 for depth.
- Fog: exponential fog color `--bg-horizon`, density ~0.012.
- Lighting: hemisphere light (sky `#6a7bd1`, ground `#0f1630`, intensity 0.7), one directional "moon" light
  (color `#9fb4ff`, intensity 0.9, soft shadow on desktop only), plus emissive windows doing the heavy lifting. Add a few warm point lights
  (max 4) near gold buildings only if the tier allows.
- Post-processing (desktop/high tier): `RenderPass` -> `UnrealBloomPass` (strength 0.55, radius 0.6, threshold 0.82) -> `SMAAPass` -> `OutputPass`.
  Renderer: `ACESFilmicToneMapping`, exposure 1.05, `outputColorSpace = SRGBColorSpace`.
  Optional subtle vignette in CSS (radial gradient overlay) instead of a shader pass.

### 7.3 Courier (player)
Small friendly robot-courier built from primitives (rounded box body, dome head, two emissive eyes, tiny backpack, antenna with glowing tip).
- Idle: gentle bobbing + blinking eyes.
- Jump animation (550-750 ms depending on distance): anticipation squash (80ms), parabolic arc (apex height = 0.35*gap + 2),
  stretch while rising, squash on landing, dust ring particles, camera micro-shake (0.1 amplitude, 120 ms).
- Glide: unfurl small wings, slower arc with a longer flat segment, soft violet trail.
- Grapple: a glowing amber line shoots to the target roof edge, courier is pulled with ease-in-out and a small swing.
- Trail: ribbon behind the courier showing the path taken this run (fades after 6 s, path stays as a thin dim line).

### 7.4 Camera
- PerspectiveCamera FOV 38. Default pitch ~48 degrees, yaw 35 degrees, distance fitted to the city bounds with 10% margin.
- Custom controller (no OrbitControls dependency required, but OrbitControls is acceptable): damping 0.08, min/max pitch 25-75 degrees, min/max distance fitted to bounds.
- Smooth focus tween (easeInOutCubic) on selection, move, and win. Win: slow cinematic pull-out and 40-degree orbit over 2.5 s.
- Intro: first load flies in from a high wide shot to the default view in 2.2 s (skippable by any input).

### 7.5 Feedback and juice (do all of these)
- Hover (desktop) and valid-target pulse: rim light + slight scale of the roof sign.
- Selecting: soft "tick", arc draws in over 180 ms (animated dash).
- Landing: dust ring, small camera shake, number pop "+0" / "+50 GOLD" floating text that rises and fades.
- Gold collect: coin spins up, bursts into 12 sparkles, bonus counter animates.
- Win: confetti of small emissive cubes from the summit beam, beam brightens, bloom strength pulses 0.55 -> 0.9 -> 0.55, result card slides in after 1.2 s.
- Lose: courier sits down, screen desaturates slightly (CSS filter on canvas 0.7 saturate), "Out of moves" card.
- All animations use a central tween utility with easing; no setTimeout chains for animation.

### 7.6 Performance budget (hard limits)
| Metric | Desktop | Mobile |
|---|---|---|
| FPS | 60 | >= 30 on a mid-range phone |
| Draw calls | <= 120 | <= 80 |
| Triangles | <= 250k | <= 120k |
| Texture memory | <= 64 MB | <= 32 MB |
| Pixel ratio cap | 2 | 1.5 |
| Initial JS (gz) | <= 700 KB | same |
| Time to first frame | < 2.5 s | < 4 s |

Quality tiers decided at startup (`renderer.ts`): `high` (bloom + SMAA + shadows 1024), `medium` (bloom half-res, no shadows),
`low` (no post-processing, simple lights, fewer particles, pixel ratio 1). Choose by `devicePixelRatio`, `hardwareConcurrency`,
touch capability, and a 20-frame warm-up average; downgrade automatically if average frame time > 24 ms for 2 seconds. Expose a "Graphics" toggle in settings.
Pause rendering when the tab is hidden. Use `requestAnimationFrame` only. Re-use temp vectors/matrices.

### 7.7 Accessibility
- Honor `prefers-reduced-motion`: disable camera shake, confetti, flicker; shorten tweens.
- Color-blind safe: tool types also differ by arc pattern (solid walk, dotted glide, zig-zag/double-line grapple) and by icon, not only color.
- All HUD text >= 14 px (>= 16 px on mobile). Contrast ratio >= 4.5:1 for text on panels.
- Every button has an accessible name; HUD works with keyboard focus rings; canvas has an `aria-label`.
- Sound off by default until first user interaction; persistent mute toggle (Redis-backed setting key `sky:prefs:{userId}`, local fallback).

---------------------------------------------------------------------------------------------------

## 8. UI SPECIFICATION (HTML overlay; follow strictly)

### 8.1 Design tokens (`styles.css`)
```
--radius-s: 8px; --radius-m: 14px; --radius-l: 22px;
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px;
--font: ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
--shadow: 0 8px 28px rgba(0,0,0,.45);
--blur: backdrop-filter: blur(12px);
```
Panels are glass: `--panel` background, 1px border `rgba(255,255,255,0.08)`, `--shadow`, `--blur`.
Primary button: gradient `--accent-cyan` -> `#6fa8ff`, dark text `#08102a`, bold, radius 14px, 48px tall (52px mobile), press scale 0.97, glow on hover.
Secondary button: glass with 1px border, text `--text`.

### 8.2 Layout (desktop >= 900px)
```
+--------------------------------------------------------------------------+
| [community chip] Skyline #12      MOVES 3/7 (par 6)   GOLD 1/4   STREAK 🔥 4  [?][⚙] |  top bar, 56px
|                                                                          |
| +-------------+                                                          |
| | INSPECTOR   |                  (3D canvas full-bleed)                  |
| | title       |                                                          |
| | Buzz 12.4k  Chatter 801                                                 |
| | tags        |                                                          |
| | [Open post] |                                                  +------+|
| +-------------+                                                  | LEADER ||
|                                                                  | BOARD  ||
|                                                                  +------+|
|   [Auto][Glide x2][Grapple x2]   [Undo] [Reset] [Recenter]   [ JUMP ]    |  bottom dock, 72px
+--------------------------------------------------------------------------+
```
- Inspector (left, 300px) appears only when a building is selected. Shows sanitized title (max 3 lines), score, comments,
- Inspector (left, 300px) appears only when a building is selected. Shows sanitized title (max 3 lines), Buzz, Chatter,
  tag chips (Summit, Start, Gold, Cracked), jump validity line ("Valid: Walk" / "Needs Glide" / "Too far"), and an `Open thread` secondary button
  (hidden for Empty lot). `Open thread` uses the Devvit client navigate API.
- Focus rule: during active play, show ONLY top bar, inspector (when selected) and bottom dock. The leaderboard is collapsed into a small
  trophy button by default and opens as a panel on demand. Nothing else competes with the 3D view.

### 8.3 Layout (mobile < 900px, portrait first)
- Top bar compresses to two rows: chip + title; stats row (Moves, Gold, Streak). Menu buttons collapse into a single `⋯` sheet.
- Inspector becomes a bottom sheet (peek 96px with title + validity; drag up for details).
- Bottom dock: tool buttons (icon + charge badge) in a row, JUMP as a large pill on the right; Undo/Reset/Recenter in a small row above.
- Safe-area insets respected (`env(safe-area-inset-*)`).
- Leaderboard opens as a full-height sheet from a trophy button.

### 8.4 Splash (inline post view, `splash.html`)
- Focused start screen. Show ONLY: game name "SKYLINE", one-line description ("Find the shortest rooftop route through today's city."),
  the date and day number, attribution ("City built from r/{community}'s day" in small text), and the player's stats (streak, best score today, rank when finished).
  Nothing else. No settings, no secondary actions, no long text.
- Background: a lightweight spinning render of today's city (low tier, 30 fps cap, no bloom) under a dark gradient overlay at the bottom.
- One big `Play` button. The summit's title is shown as a one-line teaser ("Reach: '...'").
- If the user already finished: show their points and rank, button text "View results".
- Must render a nice static frame within 1.5 s; never block on 3D load (show the CSS gradient and title first).
- Must fit the inline post height with no scrolling.

### 8.5 Result card (modal, glass)
- ONE end screen only. Never stack a second modal. Everything below lives on this single card.
- Header "ROUTE COMPLETE" (or "OUT OF MOVES" with `Try again` as the primary button).
- Stats row: Moves vs Par (animated count-up), Gold collected, Points (large number, count-up 800 ms), Rank, and Streak (flame icon + days).
- Mini route map: a top-down 2D canvas of the city with the player's path drawn.
- ONE primary button: `Share result as a comment` (opens the confirm step inline on the same card; also copies the text).
- Secondary text-links only (small, below the primary): `Ghost routes`, `Leaderboard`, `Open the Summit thread`, `Close`.
  `Ghost routes` and `Leaderboard` swap the card body in place (tabs), they do not open new modals.
- Show "Come back tomorrow for a new city" with a live countdown to the next 00:00 UTC.
- Share text format (plain text, spoiler-free):
```
Skyline #12 · r/sub
🏙️ 7 moves (par 6) · ⭐ 1150 pts
🟦🟦🟪🟦🟧🟦🟩   <- one square per move: cyan walk, violet glide, amber grapple, green final landing
```

### 8.6 Ghosts
- Unlocked only after the user has a won run today (server enforces).
- Toggle button "Ghosts". Shows the top 3 popular routes as translucent dashed lines with small ghost-courier markers that replay
  the route in a loop (staggered, 6 s cycle). Line thickness scales with `count`. Hovering a ghost line shows "Used by N players".
- Legend chip: "Most popular route" (thickest), "Alternate", "Rare".

### 8.7 Toasts and errors
- Toast component (top center, 2.5 s) for: invalid move reason, network error with Retry, "Run saved".
- Full-screen friendly error state with Retry for init failure. Never show raw error text or stack traces.
- Offline/failed run submission: keep the run in memory and retry with exponential backoff 3 times; offer manual Retry.

### 8.8 Onboarding: contextual hints only (NO tutorial screen, NO wall of text)
Play must start immediately. Show at most ONE small hint bubble at a time, anchored to the relevant 3D object or control,
dismissed by performing the action (never by a "Next" button). Hints only appear until the player has made 3 moves.
1. On load, a pulsing ring on the courier plus a bubble: "Tap a rooftop to preview your jump."
2. After the first selection (arc visible): bubble on the JUMP button: "Tap again to jump."
3. After the first move, if the summit is off-screen: the camera briefly pans to the glowing beam and a bubble says "Reach the glow."
Taller buildings carry more Buzz: show this as a tiny caption in the inspector the first time a building is selected ("Taller = more Buzz"). No other explanatory text.
A `?` button in the top bar reopens a single compact rules sheet (4 short lines: jump types and goal) for anyone who wants it.
Hints respect reduced motion (no pulsing, static highlight instead).

### 8.9 Microcopy
Short, friendly, no jargon. Examples: "Too far to walk. Try Glide." / "That roof already collapsed." / "Nice route!" / "Out of moves. Try again?".

---------------------------------------------------------------------------------------------------

## 9. PHASED BUILD PROMPTS (paste ONE at a time into Claude Code)

Each prompt below starts with the same header. Replace nothing; paste as is.

COMMON HEADER (prefix every phase prompt):
```
You are working in the repo `skyline`. Read CLAUDE.md and docs/SKYLINE_PLAN.md fully first.
Do ONLY the phase below. Do not start any later phase. Follow every rule in CLAUDE.md.
When done: run typecheck, lint, test, build; then print the acceptance checklist with PASS/FAIL
for each line and fix every FAIL before stopping. Do not claim PASS without running the check.
```

### PHASE 0: Bootstrap
```
PHASE 0: Bootstrap
1. Scaffold the project from the official Devvit three.js template (developers.reddit.com/new)
   into this repo. Keep devvit.json, src/client, src/server. Add src/shared.
2. Configure TypeScript strict, ESLint, Prettier, Vitest. Add scripts: dev, build, typecheck, lint, test.
3. Set devvit.json per plan Section 5.7 (name `skyline-daily`, two entrypoints splash/game, redis,
   reddit asUser SUBMIT_COMMENT, triggers/scheduler/menu placeholders pointing at routes that return 501 for now).
4. Create the folder layout in plan Section 2.1 with empty, compiling modules (real signatures, no TODO stubs that break typecheck).
5. Add `src/shared/types.ts` exactly as in plan Section 4.
6. Add `?mock=1` mode skeleton in client/mock.ts (empty fixture ok for now).
7. Write README.md: what the game is, how to run locally, how to playtest on Reddit (`npx devvit playtest`). State clearly: do NOT run `devvit publish` during the contest.
8. Add `permissions.journeys: true` and the `sourceCommunities` subreddit setting (plan 5.7). Install the telemetry package(s) required by plan 5.8 and verify the import paths.
9. Playtest the empty shell on a real test community NOW (`npx devvit playtest <community>`) to confirm the toolchain works inside Reddit before any feature work.
ACCEPTANCE:
- `npm run build` succeeds and produces dist/client and dist/server (CJS).
- `npm run dev` serves the client; page shows a placeholder canvas.
- devvit.json validates against the schema (run `npx devvit` validation or playtest dry run).
- No external URLs anywhere in client code.
```

### PHASE 1: Shared game engine (pure, tested)
```
PHASE 1: Shared engine in src/shared (pure TS, zero DOM/three/devvit imports)
Implement exactly per plan Sections 3 and 4:
- rng.ts: FNV-1a string hash, mulberry32 RNG with seed.
- sanitize.ts: title cleaning, 60-char truncation, control-char strip, small profanity mask.
- date.ts: UTC dayKey helpers, dayNumber helper.
- city.ts: buildCity(posts, subreddit, dayKey) implementing 3.2 and 3.5 (placement, tags, retries).
- rules.ts: canJump, applyMove, simulateRun (3.3, 3.7), including collapse and charge handling.
- solver.ts: BFS par solver (3.4).
- scoring.ts: computeScore (3.6).
Write Vitest tests covering:
 a) determinism: same input twice => deep-equal City.
 b) 200 random fixture post-sets: every produced city has exactly one summit and one start, start != summit,
    no footprint overlaps, min gap >= 1.5, par in range, solver path actually wins in simulateRun.
 c) rule edge cases: exact boundary gaps 4 / 7 / 9, rise 2 vs 3, glide cannot go up, grapple can,
    charges run out, cracked building collapses and cannot be re-entered, undo-equivalent replays match.
 d) scoring formula including the floor of 100 and gold bonus.
 e) invalid input: out-of-range index, repeated current building, too many moves.
 f) sanitize: html chars, long titles, unicode, empty strings.
ACCEPTANCE:
- All tests pass. Statement and branch coverage for src/shared >= 90%.
- Zero imports from outside shared/ except the standard library.
- Generation of a 24-post city takes < 150 ms on average (add a quick benchmark test with a generous threshold).
```

### PHASE 2: Server
```
PHASE 2: Server (src/server) per plan Section 5
- reddit.ts: interface PostSource + real implementation using the Devvit Reddit API (verify method and field names in installed types).
  Implement the filtering and fallbacks of 5.2 and 5.3.
- cityStore.ts: getOrCreateCity(dayKey) with Redis lock, immutable once stored, TTL 14 days.
- runs.ts: POST /api/run (validate with simulateRun, store best per user, leaderboard score encoding per 5.4, edges + routes counters,
  one counted route per user), GET /api/leaderboard, GET /api/ghosts (403 until the user has a win).
- streaks.ts per 5.6. share-comment endpoint (rate-limited, asUser SUBMIT_COMMENT, plain text only).
- GET /api/init per InitResponse. Strict input validation on every route. Proper HTTP status codes.
- `sourceCommunities` setting: read via `settings.get`, validation endpoint `/internal/settings/validate-sources`, multi-community fetch + merge + dedupe (5.2, 5.3 step 0). Test with fake sources.
- Weekday difficulty bands and the "at least 2 good routes" rule (5.9), with the 365-day sweep test.
- Mount the Journeys telemetry router (5.8).
- Unit tests with an in-memory fake Redis and a fake PostSource: validation rejects forged runs, ties resolve by earlier submission,
  streak transitions, ghost gating, leaderboard score encoding stays < 2^53.
ACCEPTANCE:
- Tests pass. A forged run (wrong moves, extra moves, out-of-range index, huge array) is rejected with 400.
- `npm run build` produces a CJS server bundle that starts without errors.
- No Redis key is written without a TTL except streak and prefs keys.
```

### PHASE 3: 3D city scene (visuals only, no gameplay)
```
PHASE 3: 3D scene (src/client/scene) per plan Section 7. Use ?mock=1 with a built-in 24-building fixture City
generated by shared/city.ts so it runs without Reddit.
Build: renderer + quality tiers (7.6), sky/stars/moon/fog/silhouette ring (7.2), ground grid, instanced buildings and
windows (single InstancedMesh for windows), roof details, sign atlas, tag visuals (summit beam, start pad, gold coins, cracked decals),
lighting, post-processing for high/medium tiers, camera controller with intro fly-in (7.4), resize + DPR handling, dispose() everywhere.
Add a dev-only stats overlay (draw calls, triangles, fps) behind `?stats=1`.
ACCEPTANCE:
- With ?mock=1 the page shows the complete neon dusk city, matching the palette in 7.1.
- Stats on desktop: <= 120 draw calls, <= 250k triangles, 60 fps. Report the measured numbers.
- Mobile emulation (Chrome devtools, 4x CPU throttle): >= 30 fps on the `low` tier; report numbers.
- No console errors/warnings. Memory does not grow after calling dispose() and recreating the scene 10 times (report heap before/after).
- Titles render via canvas only; a title like `<img src=x onerror=alert(1)>` appears as literal text.
```

### PHASE 4: Gameplay + HUD
```
PHASE 4: Gameplay interaction and HUD per plan Sections 6 and 8.
- state.ts: single game state (run, moves, charges, collapsed, gold, selection) driven only by shared/rules functions. Event emitter for UI/scene.
- Selection, jump previews and arcs (6.2, 7.3), courier + jump/glide/grapple animations, collapse effect, gold collect, landing juice (7.5).
- HUD: top bar, inspector, tool dock, JUMP, Undo, Reset, Recenter, toasts. Desktop and mobile layouts (8.2, 8.3). Keyboard and touch controls (6.2).
- Win and lose flows with the single Result card (8.5) and share text. Contextual hints (8.8). There must be NO tutorial overlay and NO second end modal.
- telemetry.ts and all Journeys events per plan 5.8 (Start only on Play, Progress per committed jump, End on win/lose/leave). Telemetry failures must never affect gameplay.
- Wire to the API with api.ts: init, run submit with retry (8.7), leaderboard. In ?mock=1 use local fake responses.
ACCEPTANCE:
- A full game can be played end to end in mock mode on desktop and in a 390x844 mobile viewport.
- Invalid moves show the exact reason toast. Undo/Reset restore charges, collapse and gold correctly (add tests for state.ts).
- The client never computes rules itself; grep proves it only calls shared/rules.
- Every control works with mouse, touch and keyboard. All buttons >= 44 px on mobile. Report a manual test script with results.
```

### PHASE 5: Social layer
```
PHASE 5: Social layer
- Leaderboard panel/sheet (8.2/8.3) with rank, auto refresh, "You" row.
- Ghost routes (8.6): fetch /api/ghosts after a win, render dashed lines with looping ghost couriers and the "Used by N players" tooltip.
- Open post button via the Devvit client navigation API (verify the exact function name in @devvit/web/client).
- Share result: copy to clipboard (with fallback) and the optional "Post as comment" button calling /api/share-comment with a confirmation dialog.
- Streak display and a small celebratory animation on streak increase.
ACCEPTANCE:
- Ghosts are unreachable before a win (UI hidden AND server 403 verified by test).
- Share text contains no spoilers (no building titles) and matches the format in 8.5.
- Comment posting requires an explicit click and a confirmation; double-click cannot post twice.
```

### PHASE 6: Polish and audio
```
PHASE 6: Polish
- audio.ts: WebAudio synthesized sounds (select tick, jump whoosh, land thud, glide shimmer, grapple zip, gold chime, collapse rumble, win arpeggio,
  lose sigh) plus a soft ambient pad loop. Muted until first interaction, mute toggle persisted, master gain <= 0.4.
- Reduced motion support (7.7), color-blind patterns for arcs (7.7), focus rings, aria labels.
- Auto quality downgrade (7.6) + Graphics toggle in settings. Pause on hidden tab.
- Visual QA pass against Section 7 and 8: spacing, typography, glass panels, transitions (150-250 ms), consistent easing.
ACCEPTANCE:
- Lighthouse (desktop) performance >= 85 and accessibility >= 95 on the game page in mock mode; report scores.
- prefers-reduced-motion verified. Sound never plays before a user gesture.
- Screenshots captured (desktop + mobile) of: first-load hint, mid-game with arc preview, gold collect, win card, ghost view. Save under docs/screens/.
- At 360x640, 390x844, 768x1024, 1366x768 and 1920x1080 there is NO page scroll and no clipped controls (report a screenshot per size).
- Grep proves the strings karma, upvote, subreddit and Snoo do not appear in any user-facing copy.
```

### PHASE 7: Splash, daily post creation, scheduler
```
PHASE 7: Splash + daily automation
- splash.html/ts per 8.4 using the low-tier renderer, with finished-state variant. `requestExpandedMode` to the game entrypoint (verify API name).
- Post creation (posts.ts): menu item for moderators, onAppInstall trigger, and the daily scheduler task creating the custom post per 5.5.
- Lazy city creation in /api/init as a safety net.
- Playtest on a real test community with `npx devvit playtest <community>`; fix anything that breaks inside the Reddit iframe (CSP, sizes, touch). Use `upload` only, NEVER `publish`.
- Create the public demo post in your own community and confirm it is visible to a logged-out or second account. Set `sourceCommunities` if the community is small (5.3 step 0).
ACCEPTANCE:
- Installing on a fresh subreddit creates a post automatically. The daily task creates exactly one post per day (idempotent: running twice creates one).
- Splash shows within 1.5 s, expands to the game on tap, and the state is consistent.
- Report the playtest URL and a checklist of verified behaviors on desktop web and the Reddit mobile app/emulation.
```

### PHASE 8: Hardening, assets, submission
```
PHASE 8: Hardening and submission assets
- Security review: all routes validate input; no secrets in logs; titles never reach innerHTML; rate limit run submissions (max 30 per user per day).
- Error and edge cases: empty subreddit, subreddit with < 12 posts, all posts NSFW, a post deleted after city creation (city is a snapshot; "Open post" may 404, handle gracefully).
- tools/gen-icon.ts generates assets/icon.png (1024x1024) in the game's style (skyline silhouette, neon, pink summit beam).
- Final README: concept, features, architecture diagram (text), how rules are verified server-side, limits, credits.
- docs/DEMO_SCRIPT.md: a 90-second demo video script. First 5 seconds must show the glowing city and a chain of jumps. Include the shot list and on-screen captions.
- docs/DEVPOST.md: write-up sections Inspiration, What it does, How we built it, Challenges, Accomplishments, What we learned, What's next.
- Final run of typecheck, lint, test, build, and `npx devvit upload`. Do NOT run `devvit publish`.
- Contest submission checklist (write it to docs/SUBMISSION.md and tick each item):
  1. App listing URL on developers.reddit.com.
  2. Public demo post URL in a community you own. The community must either have 12+ real posts today OR have `sourceCommunities` set so the city is full of real buildings. Verify the demo city has zero "Empty lot" buildings.
  3. The demo post opens, shows the focused splash, and the first jump is possible within 10 seconds without reading anything.
  4. Create 3 extra demo posts (one for each of the previous days if possible, otherwise use the mod menu) so judges who play later still see fresh content and a populated leaderboard. Seed leaderboard with real playtest runs from test accounts only. No fake users.
  5. Optional developer feedback survey completed (https://forms.gle/dW45UgK6SctevE756).
  6. Devpost write-up and demo video link added before Dec 8, 2026 6:00pm PST.
ACCEPTANCE:
- All checks green. Bundle sizes within budget (report). Icon file exists and is 1024x1024.
- Manual QA matrix (desktop Chrome, mobile viewport, reduced motion, no-sound) all PASS and listed.
```

---------------------------------------------------------------------------------------------------

## 10. DEFINITION OF DONE (whole project)

- [ ] Meets every item in Section 0.5 (onboarding, visual craft, calibrated content, focused play, one end card, Journeys).
- [ ] UI copy never uses karma/upvote/subreddit/Snoo. Looks like its own game, not a Reddit skin and not a generic template.
- [ ] Demo post city has no empty lots and the game is understandable without reading instructions.
- [ ] City is generated from real subreddit posts, deterministic per day, and always solvable.
- [ ] Server re-simulates every run; forged runs are rejected.
- [ ] Looks like Section 7 in screenshots at desktop and mobile sizes.
- [ ] 60 fps desktop / 30+ fps mobile at the budget in 7.6.
- [ ] Ghosts, leaderboard, streak, share, open-post all work.
- [ ] Daily post is created automatically once per day.
- [ ] No external network calls from the client. No unsafe HTML.
- [ ] README, demo script and write-up are ready.

## 11. KNOWN RISKS AND MITIGATIONS

| Risk | Mitigation |
|---|---|
| Small subreddits have few posts | Fallbacks in 5.3 (widen timeframe, empty lots) |
| NSFW or offensive titles | Filter flags, mask words, truncate; never render raw HTML |
| Unsolvable generated cities | Solver gate + 300 retries + relaxed range + fallback |
| Mobile performance | Instancing, atlas, quality tiers, auto downgrade, budgets |
| Cheating | Server-side re-simulation, rate limit, input caps |
| Devvit API names differ from this plan | CLAUDE.md rule 5: verify in installed types, never guess |
| Cross-community leaderboard is impossible | Not promised. Per-subreddit only |
