# Tic-Tac-Toe

[Play online](https://tictactoe.basantkmeena.chatgpt.site) — public, no sign-in required.

A responsive two-player game with alternating turns, win and draw detection,
winning-cell highlights, and a restart button. Players share one browser. This is a same-device game; remote multiplayer is not included.

## One-shot implementation

The game was built from a single user request using Codex and [RoleMux](https://github.com/basant-kumar/rolemux):

> Can you create a web based tictactoe game with basic functions? use rolemux for this project.

RoleMux handled planning, implementation, and code review, with automated tests
and review-driven refinements in the same build session. “One-shot” refers to
that single initial game-building request, rather than a build without review
or fixes. Later follow-ups made the game and repository public and refined
this documentation and the URL.

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
