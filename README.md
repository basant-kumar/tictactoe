# Tic-Tac-Toe

[Play online](https://basant-kumar.github.io/tictactoe/) — a static GitHub Pages site.

A responsive two-player game with alternating turns, win and draw detection,
winning-cell highlights, persistent player names, and a local session scoreboard.
The scoreboard records wins, draws, current streaks, and best streaks. A draw
preserves both current streaks; a win advances the winner and resets the
opponent. Players share one browser; remote multiplayer is not included.

## Run locally

Requires Node.js 22.13 or later.

```sh
npm ci
npm run dev
```

Vite serves the site beneath `/tictactoe/`, so open the local URL printed by the
server with that path, such as `http://localhost:5173/tictactoe/`. Click an
empty cell, or use Tab and Enter/Space. X starts each new round.

Names are bounded to 24 characters and persist with the session scoreboard.
Restart round clears only the board and celebration. Reset session clears wins,
draws, and streaks while keeping names. Session persistence is guarded: storage
errors fall back to in-memory play, and a reload restores names and statistics
with a fresh empty board.

Winning streaks of 3, 4, 5, and 6 or more show the On fire, Unstoppable,
Dominating, and Legendary celebration tiers. Legendary particles increase by
four for each win after six and cap at 40. Celebrations remain labeled after
their finite effects finish, and reduced-motion preferences keep a static,
color-coded treatment without blocking the board or controls.

## Build and preview

```sh
npm run build
npm run preview
```

The build publishes only `dist/`. It includes the existing `public/favicon.svg`,
an `index.html` entry point, and a copied `404.html` fallback plus an empty
`.nojekyll` marker. The fallback can render the same game UI while still
returning HTTP 404 on GitHub Pages.

The app uses system sans and monospace font stacks, so it does not download
Google Fonts at runtime.

## Verify GitHub Pages fallback locally

Build first, then use the Pages helper instead of Vite preview when proving
fallback behavior:

```sh
node scripts/serve-pages.mjs --dir dist --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/tictactoe/` and a missing nested URL such as
`http://127.0.0.1:4173/tictactoe/does-not-exist`. The latter must show the
copied fallback with a real HTTP 404 status. Stop the helper with Ctrl-C (or
SIGTERM) afterward.

## Local acceptance lifecycle

The reproducible Pages-like acceptance flow is:

```sh
npm run build
node scripts/serve-pages.mjs --dir dist --host 127.0.0.1 --port 4173
python3 tests/browser/session_checks.py \
  --url http://127.0.0.1:4173/tictactoe/ \
  --output outputs/acceptance/session
python3 tests/browser/responsive_checks.py \
  --url http://127.0.0.1:4173/tictactoe/ \
  --output outputs/acceptance/responsive
```

Wait for the static helper to be ready before running either browser command.
Stop the owned helper with Ctrl-C or SIGTERM. `npm run preview` is an ordinary
Vite preview and is useful for a visual check, but it is not proof of the
Pages-style nested-404 behavior. The viewport matrix and deployment rollout
remain human/host acceptance actions; this README does not claim they have run.

## GitHub Pages rollout

The workflow builds and tests `dist/` and deploys it with GitHub Pages. A human
must set the repository Pages source to **GitHub Actions**, then commit and push
the workflow and site changes to `main`. The published URL is
`https://basant-kumar.github.io/tictactoe/`.

## License

Licensed under the [MIT License](LICENSE). Third-party dependencies retain their respective licenses.
