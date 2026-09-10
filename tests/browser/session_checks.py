"""Browser coverage for names, session scores, accessibility, and touch input."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import Browser, Page, sync_playwright


STORAGE_KEY = "tictactoe.session.v1"
CELL_COUNT = 9
TOUCH_DRIFTS = (6, 16, 40, 80)
X_WIN = (0, 3, 1, 4, 2)
O_WIN = (0, 3, 1, 4, 8, 5)
DRAW = (0, 1, 2, 4, 3, 5, 7, 6, 8)


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def cells(page: Page) -> list[str]:
    return [text.strip() or "." for text in page.locator(".cell").all_text_contents()]


def status(page: Page) -> str:
    return (page.locator("#game-status").text_content() or "").strip()


def wait_for_game(page: Page) -> None:
    page.wait_for_selector(".cell")
    check(page.locator(".cell").count() == CELL_COUNT, "expected nine cells")


def restart_round(page: Page) -> None:
    page.locator(".restart-button").click()
    page.wait_for_timeout(25)
    check(cells(page) == ["."] * CELL_COUNT, "round did not restart")


def play_sequence(page: Page, sequence: tuple[int, ...]) -> None:
    for index in sequence:
        page.locator(".cell").nth(index).click()
        page.wait_for_timeout(10)


def stat(page: Page, player: str, name: str) -> int:
    selector = f".session-player[data-player='{player}'] [data-stat='{name}']"
    return int(page.locator(selector).inner_text().strip())


def shared_stat(page: Page, name: str) -> int:
    return int(page.locator(f"[data-stat='{name}']").inner_text().strip())


def set_name(page: Page, player: str, value: str) -> None:
    field = page.locator(f"#player-{player.lower()}-name")
    field.fill(value)
    field.blur()


def install_page_watchers(
    page: Page,
    asset_failures: list[str],
    page_errors: list[str],
) -> None:
    def on_request_failed(request) -> None:
        if request.resource_type != "document":
            asset_failures.append(f"{request.resource_type}: {request.url}")

    def on_response(response) -> None:
        if response.status >= 400 and response.request.resource_type != "document":
            asset_failures.append(
                f"HTTP {response.status} {response.request.resource_type}: {response.url}"
            )

    def on_page_error(error) -> None:
        page_errors.append(str(error))

    page.on("requestfailed", on_request_failed)
    page.on("response", on_response)
    page.on("pageerror", on_page_error)


def install_gesture_trace(page: Page) -> None:
    page.evaluate(
        """() => {
          window.__sessionGestureTrace = [];
          for (const type of [
            'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
            'touchstart', 'touchmove', 'touchend', 'touchcancel', 'click'
          ]) {
            document.addEventListener(type, event => {
              window.__sessionGestureTrace.push({
                type,
                target: event.target instanceof Element
                  ? event.target.className
                  : null
              });
            }, true);
          }
        }"""
    )


def cell_box(page: Page, index: int) -> dict[str, float]:
    box = page.locator(".cell").nth(index).bounding_box()
    check(box is not None, f"missing bounding box for cell {index}")
    return box


def dispatch_touch(cdp, event_type: str, x: float | None = None, y: float | None = None) -> None:
    points = [] if event_type == "touchEnd" else [
        {"x": x, "y": y, "radiusX": 12, "radiusY": 12, "force": 1}
    ]
    cdp.send("Input.dispatchTouchEvent", {"type": event_type, "touchPoints": points})


def tap(cdp, page: Page, x: float, y: float, drift: int) -> None:
    dispatch_touch(cdp, "touchStart", x, y)
    page.wait_for_timeout(40)
    for step in range(1, 5):
        dispatch_touch(cdp, "touchMove", x, y + drift * step / 4)
        page.wait_for_timeout(8)
    dispatch_touch(cdp, "touchEnd")


def run_touch_matrix(browser: Browser, url: str) -> list[dict[str, object]]:
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=3,
        is_mobile=True,
        has_touch=True,
    )
    page = context.new_page()
    page.goto(url, wait_until="networkidle")
    wait_for_game(page)
    install_gesture_trace(page)
    cdp = context.new_cdp_session(page)
    traces: list[dict[str, object]] = []

    for drift in TOUCH_DRIFTS:
        for index in range(CELL_COUNT):
            restart_round(page)
            box = cell_box(page, index)
            x = box["x"] + box["width"] / 2
            y = box["y"] + box["height"] / 2
            page.evaluate("window.__sessionGestureTrace = []")
            tap(cdp, page, x, y, drift)
            page.wait_for_timeout(100)
            board = cells(page)
            check(board.count("X") == 1, f"drift {drift}, cell {index}: expected one X")
            check(board[index] == "X", f"drift {drift}, cell {index}: move missed")
            check("turn" in status(page) and "O" in status(page), "touch did not advance turn")
            if index in (0, 4) and drift in (6, 40, 80):
                traces.append(
                    {
                        "drift": drift,
                        "index": index,
                        "events": page.evaluate("window.__sessionGestureTrace"),
                    }
                )

    restart_round(page)
    box = cell_box(page, 0)
    page.evaluate("window.__sessionGestureTrace = []")
    tap(cdp, page, box["x"] + 3, box["y"] + 3, 16)
    page.wait_for_timeout(100)
    check(cells(page)[0] == "X", "near-edge touch missed")
    traces.append(
        {
            "drift": 16,
            "index": 0,
            "position": "near-edge",
            "events": page.evaluate("window.__sessionGestureTrace"),
        }
    )

    restart_round(page)
    page.evaluate(
        """() => {
          const cell = document.querySelectorAll('.cell')[0];
          cell.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, pointerType: 'touch', isPrimary: false, button: 0
          }));
          cell.dispatchEvent(new MouseEvent('click', {
            bubbles: true, button: 2, detail: 1
          }));
        }"""
    )
    page.wait_for_timeout(50)
    check(cells(page) == ["."] * CELL_COUNT, "secondary/non-primary input activated a cell")
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    check(cells(page)[0] == "X", "primary mouse input did not activate a cell")
    context.close()
    return traces


def run_keyboard_and_mouse(browser: Browser, url: str) -> None:
    context = browser.new_context()
    page = context.new_page()
    page.goto(url, wait_until="networkidle")
    wait_for_game(page)

    page.mouse.click(*(
        lambda box: (box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    )(cell_box(page, 4)))
    check(cells(page)[4] == "X", "mouse activation failed")

    restart_round(page)
    page.locator(".cell").nth(0).focus()
    page.keyboard.press("Enter")
    check(cells(page)[0] == "X", "Enter activation failed")

    restart_round(page)
    page.locator(".cell").nth(8).focus()
    page.keyboard.press("Space")
    check(cells(page)[8] == "X", "Space activation failed")

    restart_round(page)
    box = cell_box(page, 0)
    cdp = context.new_cdp_session(page)
    tap(cdp, page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, 16)
    page.wait_for_timeout(100)
    check(cells(page).count("X") == 1, "touch activation did not commit once")
    page.locator(".cell").nth(1).click()
    check(cells(page)[0] == "X" and cells(page)[1] == "O", "compatibility click broke next move")
    context.close()


def run_names_and_scores(browser: Browser, url: str) -> None:
    context = browser.new_context()
    page = context.new_page()
    page.goto(url, wait_until="networkidle")
    wait_for_game(page)

    x_field = page.locator("#player-x-name")
    o_field = page.locator("#player-o-name")
    check(x_field.get_attribute("maxlength") == "24", "X name is not bounded")
    check(o_field.get_attribute("maxlength") == "24", "O name is not bounded")

    x_field.fill("  Ada  <b>Lovelace</b>  ")
    check("Ada  <b>Lovelace</b>" in status(page), "name edit did not update live status")
    page.locator(".cell").nth(0).click()
    check(cells(page)[0] == "X", "name edit lost the current cell")
    x_field.blur()
    set_name(page, "O", "Grace Hopper")
    check(cells(page)[0] == "X", "second name edit lost the current cell")
    check("Grace Hopper" in status(page), "O name did not update the live status")

    page.reload(wait_until="networkidle")
    wait_for_game(page)
    check(page.locator("#player-x-name").input_value() == "Ada  <b>Lovelace</b>", "X name did not persist")
    check(page.locator("#player-o-name").input_value() == "Grace Hopper", "O name did not persist")
    check(cells(page) == ["."] * CELL_COUNT, "reload restored a board instead of a fresh round")

    restart_round(page)
    play_sequence(page, X_WIN)
    check(stat(page, "X", "wins") == 1, "first X win was not recorded")
    check(stat(page, "X", "current-streak") == 1, "first X streak was not recorded")

    restart_round(page)
    play_sequence(page, O_WIN)
    check(stat(page, "O", "wins") == 1, "O win was not recorded")
    check(stat(page, "O", "current-streak") == 1, "O streak was not recorded")
    check(stat(page, "X", "current-streak") == 0, "opponent streak was not reset")
    check(stat(page, "X", "best-streak") == 1, "X best streak was not retained")

    restart_round(page)
    play_sequence(page, X_WIN)
    restart_round(page)
    play_sequence(page, X_WIN)
    check(stat(page, "X", "wins") == 3, "three X wins were not recorded")
    check(stat(page, "X", "current-streak") == 2, "X consecutive streak is wrong")
    check(stat(page, "X", "best-streak") == 2, "X best streak is wrong")
    check(stat(page, "O", "current-streak") == 0, "O streak was not reset after X win")

    restart_round(page)
    play_sequence(page, DRAW)
    check(shared_stat(page, "draws") == 1, "draw was not recorded")
    check(stat(page, "X", "current-streak") == 2, "draw broke X streak")
    check(stat(page, "X", "best-streak") == 2, "draw changed X best streak")

    page.reload(wait_until="networkidle")
    wait_for_game(page)
    check(cells(page) == ["."] * CELL_COUNT, "stats reload restored a board")
    check(
        page.locator("#player-x-name").input_value() == "Ada  <b>Lovelace</b>",
        "stats reload discarded X name",
    )
    check(
        page.locator("#player-o-name").input_value() == "Grace Hopper",
        "stats reload discarded O name",
    )
    check(stat(page, "X", "wins") == 3, "stats reload discarded X wins")
    check(stat(page, "X", "current-streak") == 2, "stats reload discarded X streak")
    check(stat(page, "X", "best-streak") == 2, "stats reload discarded X best streak")
    check(stat(page, "O", "wins") == 1, "stats reload discarded O wins")
    check(stat(page, "O", "current-streak") == 0, "stats reload changed O streak")
    check(stat(page, "O", "best-streak") == 1, "stats reload discarded O best streak")
    check(shared_stat(page, "draws") == 1, "stats reload discarded draws")

    tier_checks = (
        ("on-fire", "On fire", 3),
        ("unstoppable", "Unstoppable", 4),
        ("dominating", "Dominating", 5),
        ("legendary", "Legendary", 6),
    )
    previous_round_id = None
    for tier_id, label, streak in tier_checks:
        restart_round(page)
        play_sequence(page, X_WIN)
        celebration = page.locator(".celebration [data-tier]")
        check(celebration.get_attribute("data-tier") == tier_id, f"missing {tier_id} tier")
        celebration_text = celebration.text_content() or ""
        check(label in celebration_text, f"missing {label} tier label")
        check(f"{streak}-win streak" in celebration_text, "wrong exact streak")
        round_id = celebration.get_attribute("data-round-id")
        check(round_id is not None and round_id != previous_round_id, "round identity did not advance")
        previous_round_id = round_id

        if tier_id == "on-fire":
            set_name(page, "X", "Ada Renamed")
            renamed = page.locator(".celebration [data-tier]")
            check(renamed.get_attribute("data-round-id") == round_id, "rename changed round identity")
            check("Ada Renamed" in (renamed.text_content() or ""), "celebration did not use renamed player")

    restart_round(page)
    check(stat(page, "X", "wins") == 7, "restart discarded scores")
    check(shared_stat(page, "draws") == 1, "restart discarded draws")
    check(page.locator("#player-x-name").input_value() == "Ada Renamed", "restart discarded X name")
    check(cells(page) == ["."] * CELL_COUNT, "restart did not clear the board")

    page.locator(".reset-session-button").click()
    check(stat(page, "X", "wins") == 0 and stat(page, "O", "wins") == 0, "reset kept wins")
    check(shared_stat(page, "draws") == 0, "reset kept draws")
    check(page.locator("#player-x-name").input_value() == "Ada Renamed", "reset discarded names")
    check(page.locator("#player-o-name").input_value() == "Grace Hopper", "reset discarded O name")
    check(cells(page) == ["."] * CELL_COUNT, "reset did not clear the board")
    context.close()


def run_storage_cases(browser: Browser, url: str) -> None:
    cases = (
        ("corrupt", "not-json", None),
        (
            "valid-names",
            json.dumps(
                {
                    "version": 1,
                    "names": {"X": "", "O": "LongName" * 8},
                    "stats": {
                        "X": {"wins": 2, "currentStreak": 1, "bestStreak": 2},
                        "O": {"wins": 0, "currentStreak": 0, "bestStreak": 0},
                    },
                    "draws": 3,
                }
            ),
            None,
        ),
    )

    for label, stored, _ in cases:
        context = browser.new_context()
        context.add_init_script(
            f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(stored)});"
        )
        page = context.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url, wait_until="networkidle")
        wait_for_game(page)
        if label == "corrupt":
            check(page.locator("#player-x-name").input_value() == "Player X", "corrupt names were not recovered")
            check(page.locator("#player-o-name").input_value() == "Player O", "corrupt storage broke defaults")
        else:
            check(page.locator("#player-x-name").input_value() == "Player X", "blank stored name was not defaulted")
            check(len(page.locator("#player-o-name").input_value()) == 24, "stored name was not capped")
            check(stat(page, "X", "wins") == 2, "valid stats were not restored")
            check(shared_stat(page, "draws") == 3, "valid draws were not restored")
        page.locator(".cell").nth(0).click()
        check(cells(page)[0] == "X", f"{label} storage case is not playable")
        check(not errors, f"{label} storage case raised page errors: {errors}")
        context.close()

    context = browser.new_context()
    context.add_init_script(
        """Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() { throw new Error('storage getter failure'); }
        });"""
    )
    page = context.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url, wait_until="networkidle")
    wait_for_game(page)
    page.locator(".cell").nth(0).click()
    check(cells(page)[0] == "X", "throwing storage getter broke in-memory play")
    check(not errors, f"throwing storage getter raised page errors: {errors}")
    context.close()


def run_deep_link(
    browser: Browser,
    url: str,
) -> tuple[list[str], list[str], int]:
    context = browser.new_context()
    page = context.new_page()
    asset_failures: list[str] = []
    page_errors: list[str] = []
    install_page_watchers(page, asset_failures, page_errors)
    response = page.goto(url.rstrip("/") + "/example/deep-link", wait_until="networkidle")
    check(response is not None and response.status == 404, "deep link did not return document404")
    wait_for_game(page)
    page.locator(".cell").nth(0).click()
    check(cells(page)[0] == "X", "deep-link page did not accept a move")
    page.reload(wait_until="networkidle")
    wait_for_game(page)
    check(cells(page) == ["."] * CELL_COUNT, "deep-link reload did not start a fresh round")
    context.close()
    return asset_failures, page_errors, response.status


def run(url: str, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            asset_failures, page_errors, document_status = run_deep_link(browser, url)
            run_names_and_scores(browser, url)
            run_storage_cases(browser, url)
            run_keyboard_and_mouse(browser, url)
            traces = run_touch_matrix(browser, url)
            check(not asset_failures, f"required asset failures: {asset_failures}")
            check(not page_errors, f"deep-link page errors: {page_errors}")
            results = {
                "url": url,
                "document404": document_status,
                "assetFailures": asset_failures,
                "pageErrors": page_errors,
                "touchDrifts": list(TOUCH_DRIFTS),
                "traceCount": len(traces),
            }
            (output / "session_checks.json").write_text(
                json.dumps(results, indent=2), encoding="utf-8"
            )
            (output / "gesture_traces.json").write_text(
                json.dumps(traces, indent=2), encoding="utf-8"
            )
        finally:
            browser.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:4173/tictactoe/",
        help="Pages-like server URL",
    )
    parser.add_argument(
        "--output",
        default="tests/browser/artifacts/session",
        help="JSON and gesture trace output directory",
    )
    args = parser.parse_args()

    try:
        run(args.url, Path(args.output))
    except Exception as error:  # pragma: no cover - CLI failure boundary
        print(f"session_checks failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
