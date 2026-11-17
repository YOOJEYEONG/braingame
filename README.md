# braingame

**하루 5분 두뇌 워밍업**: three short brain-warmup games in Korean, built with
[Expo Exact](https://github.com/expo/exact). Exact is Rust-powered: a Contract compiler, a web
DOM runtime, and a native Rust runner. Scores stay in this browser's `localStorage`. There is
no login, server or database.

| Game | Rule | Score | Ends |
|---|---|---|---|
| 순서 기억 (sequence memory) | 3×3 board flashes a path; repeat it. Each success adds a tile | longest path repeated in full | 2 misses, or a 16-tile path |
| 색 집중 (Stroop-style colour attention) | pick the ink colour, not the word | correct − wrong (floor 0), so random mashing does not pay | 45 / 40 / 30 s by level |
| 빠른 셈 (timed arithmetic) | type the answer, Enter | correct answers | 60 s |

Each game has the same flow: 쉬움, 보통 or 어려움, then instructions, start, play, result,
and from there 다시 하기, 난이도 바꾸기 or 처음으로. Keys: 1–9 for the sequence board (top-left
first), 1–4 for the colours, Enter for arithmetic, and Tab or Shift+Tab with a visible 2px focus
ring. The home page shows real records only: the number of games today, the 8 most recent
games, and the best score per game and level. The app makes no medical or cognitive-benefit
claims.

## Layout

```
README.md            this file
vercel.json          Vercel build, output dir, deep-link rewrites, caching
scripts/build.sh     reproducible build: pins Exact, provisions Bun 1.4.2 + Rust, runs the web export
brain-warmup/        the Exact app
  app.contract       view, state, game logic and scoring (Contract)
  app.forma          design tokens: warm paper, deep ink, lime/leaf accent, Stroop inks, light/dark
  app.test.contract  5 seeded gameplay tests
  app.json           manifest (name, lang=ko)
  tools/storage-check.mjs  real-browser check that corrupted localStorage cannot break the app
exact/               Expo Exact checkout (git-ignored; build.sh clones it at the pinned commit)
```

## Run it

Requirements are Git, curl and a C toolchain (Xcode CLT on macOS). `scripts/build.sh` installs
Bun 1.4.2 (at `~/.bun-1.4.2`) and Rust (through rustup) when they are missing, and clones Exact at
commit `de212e671a69f4fea18bed67d5b73b259ddf3061`.

```sh
bash scripts/build.sh                          # static site in brain-warmup/dist (first run compiles the Contract compiler: a few minutes)
export PATH=~/.bun-1.4.2/bin:$PATH
cd brain-warmup
bun exact.mjs serve dist                        # http://127.0.0.1:8765/
bun exact.mjs web                               # dev loop with live reload, instead
```

Tests and checks need the web setup once, which installs the toolchains and a headless Chromium:
`bun ../exact/scripts/exact.mjs setup --platform web`.

```sh
bun exact.mjs contract build app.contract --json   # [] = no errors or warnings
bun exact.mjs test web                             # the 5 gameplay tests in Chrome
bun exact.mjs verify                               # tests, then light/dark at 390 and 1280 px, accessibility tree, largest text size, relaunch
bun tools/storage-check.mjs http://127.0.0.1:8765/ # with `serve dist` running
```

## How it works

- **Contract only, no data module.** Rounds come from Exact's integer `roll(seed, k, n)`
  recipe, seeded by `exactTime().seed`, because Contract has no `random()`. A session's state
  machine lives in the root component. The intro, play and result stages are routes
  (`/g/:game`, `/g/:game/play`, `/g/:game/result`), so Back, reload and deep links behave.
- **Timer cleanup.** A session is live only while `top(nav).id == entry`. Leaving the play
  route by any path (그만하기, browser Back, a link) stops the countdown and sequence tasks, and
  nothing is recorded. Timers compute from `endsAt`, not tick counts.
- **Storage.** `level`, `history` and `bests` are `persist` states. `history` holds
  `game|level|score|epochMs` strings, filtered by `validRec` before use. `bests` is read through
  `bestAt`, which clamps and defaults. Exact discards stored values of the wrong type.
- **Rust's role** is Exact's own: the Contract compiler, a Rust crate, turns `app.contract` into
  a plan. On the web that plan becomes one ES module over Exact's small DOM runtime; on
  macOS/iOS/Linux, Exact's Rust runner runs the same plan. This app needed no Rust data crate
  of its own.

## Deploy (Vercel)

`vercel.json` runs `bash scripts/build.sh` and publishes `brain-warmup/dist`. It rewrites the
three game routes to Exact's `shell.html`, so deep links return 200 while real files are still
served first. Unknown paths get `404.html`, a copy of the shell. Hashed `.js` and `.css` files
are cached as immutable.

## Validation (2026-11-17)

- `contract build --json` returns `[]`.
- `test web`: 5/5 passed:
  - the home page starts empty;
  - math scoring and the 60 s end, with the record persisted after reload;
  - leaving mid-game records nothing;
  - the sequence grows and ends after two misses;
  - Stroop scores correct minus wrong, with keys.
- `verify`: clean at 390×844 and 1280×900, light and dark, in the accessibility tree, at the
  largest text size and on relaunch.
- Browser checks in Playwright Chromium:
  - corrupted, wrong-type and mixed `localStorage` all load with no page errors, and only the
    valid row shows;
  - keyboard-only math scored correctly;
  - Stroop scored 6/6 with keys 1–4 matched to the ink;
  - the focus ring is a solid 2px green line.

## Limits

- Results live only in one browser, with no sync or export. History keeps the last 30 games.
- Reloading a result page shows "보여 줄 결과가 없어요" because a finished session is not
  persisted, only its record.
- Exact is pre-1.0 and changes daily. The build pins one commit on purpose.
- Only the web target was built and checked. macOS, iOS and Linux are untested here.

## Skills used

- `ponytail` (local): minimal design. One Contract file, no data module, no extra dependencies.
- `find-skills` (local): checked the skills.sh leaderboard. Rust/Axum skills had low installs
  and unknown sources, so they were skipped. Installed `anthropics/skills@frontend-design`
  (official, about 1.1M installs) and applied it to the palette, type and layout.
- Already present: `vercel:deployments-cicd`, `vercel:vercel-cli` for the deployment.
