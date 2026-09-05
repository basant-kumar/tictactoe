# Tic-Tac-Toe

[Play online](https://tictactoe-basant-play.basantkmeena.chatgpt.site) — public, no sign-in required.

A responsive two-player game with alternating turns, win and draw detection,
winning-cell highlights, and a restart button. Players share one browser. This is a same-device game; remote multiplayer is not included.

## Run locally

Requires Node.js 22.13 or later.

```sh
npm install
npm run dev
```

Open the local URL printed by the server. Click an empty cell, or use Tab and
Enter/Space. X starts each new game.

## Validate

```sh
npm test
npm run build
```

Game source passes `npx oxlint app lib` and TypeScript checking. The full
`npm run lint` command reports existing errors in unused scaffold UI components.
