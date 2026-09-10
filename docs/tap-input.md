# Tap input diagnosis and activation handoff

## Confirmed root cause

The unchanged game committed a move only from each cell button's `onClick`.
In the 390x844 Chromium touch harness, a touch that drifted more than about 15
CSS pixels crossed Blink's tap-slop threshold. Chromium then reclassified the
gesture as a scroll/drag and emitted `pointercancel` instead of `pointerup`;
it did not synthesize a compatibility `click`. Because no event reached the
existing click-only reducer path, the cell stayed empty.

The retained diagnostic measured these misses on a fresh game for each tap:

| Finger drift | Click-only misses |
| --- | ---: |
| 3px | 0/9 |
| 6px | 0/9 |
| 10px | 0/9 |
| 12px | 0/9 |
| 16px | 9/9 |
| 24px | 9/9 |
| 40px | 9/9 |

At 24px the event sequence ended in `pointercancel` and `touchend`, with no
`pointerup` or `click`. At 6px the gesture produced `pointerup` and `click`.

## Pre-implementation experiment

Before the reusable controller was implemented, `outputs/repro5.py` used a
document-level non-mouse `pointerdown` shim that prevented the default and
called the cell directly. This was a host-side experiment, not final browser
acceptance. Its measured misses were:

| Drift | Current click-only | Pointerdown shim |
| --- | ---: | ---: |
| 16px | 9/9 | 0/9 |
| 40px | 9/9 | 0/9 |
| 80px | 9/9 | 0/9 |

The experiment established that committing eligible touch/pen input on
`pointerdown` reaches the move before cancellation. The reusable controller
also suppresses the trailing typed or legacy compatibility click so a gesture
does not activate a retargeted cell twice.

## Disproved candidates

- The hover transform did not move the cell under the finger; measured bounds
  stayed fixed and the hover rule does not apply to touch.
- `touch-action: manipulation` on a cell and `touch-action: none` on the board
  both still missed 9/9 taps at 16px.
- The viewport metadata and 300ms double-tap delay were not involved; the
  framework supplied `width=device-width, initial-scale=1`, and rapid tap
  spacing did not reproduce the failure.
- Removing scrollable overflow did not change the 9/9 miss rate.
- The button remained enabled throughout the failing interaction.
- Activating on `pointerup` cannot repair this case because `pointerup` is the
  event Chromium cancels.

## Trade-off and handoff

Early activation commits a touch or pen contact even if the user subsequently
moves far enough for the browser to classify the interaction as a drag. That is
the deliberate trade-off for not losing a board move when a thumb rolls a few
millimetres across a large cell. The controller is framework-free; U4 wires its
stable callbacks into the real buttons and reducer dispatch, while U5 owns
geometry. No page or CSS change is part of this handoff.

Focused event and reducer-path checks are:

```text
node --test --experimental-strip-types lib/cell-activation.test.ts
npx oxlint lib/cell-activation.ts lib/cell-activation.test.ts
```

Final host acceptance remains pending. The forthcoming Pages-like static-server
check is:

```text
python3 tests/browser/session_checks.py --url http://127.0.0.1:4173/tictactoe/ --output outputs/acceptance/session
```

This document does not claim that final browser verification has run.
