"""Responsive and celebration acceptance checks for the Pages-like host."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import Browser, Page, sync_playwright


STORAGE_KEY = "tictactoe.session.v1"
CELL_COUNT = 9
WIN = (0, 3, 1, 4, 2)
VIEWPORTS = (
    ("phone-320x568", 320, 568),
    ("phone-375x667", 375, 667),
    ("phone-390x844", 390, 844),
    ("phone-414x896", 414, 896),
    ("tablet-768x1024", 768, 1024),
    ("desktop-1024x768", 1024, 768),
    ("desktop-1440x900", 1440, 900),
    ("desktop-1920x1080", 1920, 1080),
    ("desktop-2560x1440", 2560, 1440),
    ("landscape-568x320", 568, 320),
    ("landscape-667x375", 667, 375),
    ("landscape-844x390", 844, 390),
)
DESKTOP_MINIMUMS = {"desktop-1440x900": 520, "desktop-1920x1080": 640, "desktop-2560x1440": 720}
TIERS = {
    3: ("on-fire", "On fire", 6, 0, 0, 0),
    4: ("unstoppable", "Unstoppable", 12, 1, 0, 0),
    5: ("dominating", "Dominating", 18, 2, 0, 0),
    6: ("legendary", "Legendary", 24, 0, 1, 1),
    7: ("legendary", "Legendary", 28, 0, 1, 1),
}


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def cells(page: Page) -> list[str]:
    return [text.strip() or "." for text in page.locator(".cell").all_text_contents()]


def wait_for_game(page: Page) -> None:
    page.wait_for_selector(".cell")
    check(page.locator(".cell").count() == CELL_COUNT, "expected nine cells")


def rect(page: Page, selector: str) -> dict[str, float]:
    value = page.locator(selector).first.bounding_box()
    check(value is not None, f"missing rectangle: {selector}")
    return value


def measure(page: Page) -> dict[str, object]:
    return page.evaluate(
        """() => {
          const box = selector => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const r = element.getBoundingClientRect();
            return {
              x: r.x, y: r.y, width: r.width, height: r.height,
              right: r.right, bottom: r.bottom
            };
          };
          const scroll = document.scrollingElement || document.documentElement;
          return {
            viewport: {
              innerWidth: window.innerWidth, innerHeight: window.innerHeight,
              clientWidth: document.documentElement.clientWidth,
              clientHeight: document.documentElement.clientHeight
            },
            document: {
              scrollWidth: scroll.scrollWidth, scrollHeight: scroll.scrollHeight,
              clientWidth: scroll.clientWidth, clientHeight: scroll.clientHeight
            },
            frame: box('.game-frame'),
            game: box('.game-area'),
            board: box('.board'),
            cell: box('.cell'),
            status: box('#game-status'),
            celebration: box('.celebration'),
            restart: box('.restart-button'),
            reset: box('.reset-session-button'),
            xInput: box('#player-x-name'),
            oInput: box('#player-o-name')
          };
        }"""
    )


def assert_geometry(
    record: dict[str, object],
    name: str,
    width: int,
    height: int,
) -> None:
    document = record["document"]
    board = record["board"]
    cell = record["cell"]
    check(isinstance(document, dict), f"{name}: missing document dimensions")
    check(isinstance(board, dict) and isinstance(cell, dict), f"{name}: missing board geometry")
    check(document["scrollWidth"] <= document["clientWidth"] + 1, f"{name}: horizontal overflow")
    check(document["scrollHeight"] <= document["clientHeight"] + 1, f"{name}: vertical overflow")
    check(abs(board["width"] - board["height"]) <= 1, f"{name}: board is not square")
    check(board["width"] <= 800 + 1, f"{name}: board exceeds 800px")
    check(cell["width"] >= 44 and cell["height"] >= 44, f"{name}: cell target is too small")
    for control in ("restart", "reset", "xInput", "oInput"):
        control_box = record[control]
        check(
            isinstance(control_box, dict)
            and control_box["width"] >= 44
            and control_box["height"] >= 44,
            f"{name}: {control} target is too small",
        )
    if name in DESKTOP_MINIMUMS:
        check(
            board["width"] >= DESKTOP_MINIMUMS[name] - 1,
            f"{name}: board is below desktop minimum",
        )
    check(width >= 320 and height >= 320, f"{name}: invalid viewport")


def assert_stable(before: dict[str, object], after: dict[str, object], label: str) -> None:
    first = before["board"]
    second = after["board"]
    check(isinstance(first, dict) and isinstance(second, dict), f"{label}: missing board")
    check(abs(first["x"] - second["x"]) <= 1, f"{label}: board moved horizontally")
    check(abs(first["y"] - second["y"]) <= 1, f"{label}: board moved vertically")
    check(abs(first["width"] - second["width"]) <= 1, f"{label}: board resized")


def screenshot(page: Page, output: Path, name: str, phase: str) -> str:
    path = output / f"{name}-{phase}.png"
    page.screenshot(path=str(path), full_page=True)
    return str(path)


def win_round(page: Page) -> None:
    for index in WIN:
        page.locator(".cell").nth(index).click()
        page.wait_for_timeout(12)


def restart(page: Page) -> None:
    page.locator(".restart-button").click()
    page.wait_for_timeout(20)


def seed_context(context, streak: int = 0) -> None:
    payload = {
        "version": 1,
        "names": {"X": "X" * 24, "O": "O" * 24},
        "stats": {
            "X": {"wins": streak, "currentStreak": streak, "bestStreak": streak},
            "O": {"wins": 0, "currentStreak": 0, "bestStreak": 0},
        },
        "draws": 0,
    }
    context.add_init_script(
        f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(json.dumps(payload))});"
    )


def run_viewport(browser: Browser, url: str, output: Path, name: str, width: int, height: int) -> dict[str, object]:
    context = browser.new_context(viewport={"width": width, "height": height})
    seed_context(context, streak=2)
    page = context.new_page()
    page.goto(url, wait_until="networkidle")
    wait_for_game(page)
    before = measure(page)
    assert_geometry(before, name, width, height)
    screenshots = {"before": screenshot(page, output, name, "before")}

    page.locator(".cell").nth(0).click()
    page.wait_for_timeout(20)
    after_move = measure(page)
    assert_stable(before, after_move, f"{name} move")
    screenshots["afterMove"] = screenshot(page, output, name, "move")

    long_name = "A" * 24
    page.locator("#player-x-name").fill(long_name)
    page.locator("#player-x-name").blur()
    after_name = measure(page)
    assert_stable(before, after_name, f"{name} name change")
    check(page.locator("#player-x-name").input_value() == long_name, f"{name}: name was clipped")
    screenshots["afterName"] = screenshot(page, output, name, "name")

    restart(page)
    win_round(page)
    after_celebration = measure(page)
    assert_stable(before, after_celebration, f"{name} celebration")
    screenshots["celebration"] = screenshot(page, output, name, "celebration")

    celebration = page.locator(".celebration [data-tier]")
    check(celebration.count() == 1, f"{name}: real eligible win did not create a tier")
    check(celebration.get_attribute("data-tier") == "on-fire", f"{name}: wrong celebration tier")
    check("On fire" in (celebration.text_content() or ""), f"{name}: missing celebration label")
    check(celebration.get_attribute("data-particles") == "6", f"{name}: wrong celebration particle count")
    restart(page)
    check(cells(page) == ["."] * CELL_COUNT, f"{name}: restart was blocked")
    context.close()
    return {
        "viewport": {"name": name, "width": width, "height": height},
        "before": before,
        "afterMove": after_move,
        "afterName": after_name,
        "afterCelebration": after_celebration,
        "screenshots": screenshots,
    }


def effect_state(page: Page) -> dict[str, object]:
    return page.locator(".celebration [data-tier]").evaluate(
        """element => {
          const effects = element.querySelector('.celebration-effects');
          const style = getComputedStyle(element);
          return {
            tier: element.dataset.tier,
            particles: Number(element.dataset.particles),
            text: element.innerText,
            border: style.borderTopColor,
            background: style.backgroundColor,
            primary: style.getPropertyValue('--celebration-primary').trim(),
            secondary: style.getPropertyValue('--celebration-secondary').trim(),
            rings: element.querySelectorAll('.celebration-ring').length,
            rays: element.querySelectorAll('.celebration-rays').length,
            crowns: element.querySelectorAll('.celebration-crown').length,
            sparks: element.querySelectorAll('.celebration-spark').length,
            pointerEvents: [element, effects].every(item =>
              item && getComputedStyle(item).pointerEvents === 'none'
            ),
            animations: [...element.querySelectorAll('*')].map(item => ({
              name: getComputedStyle(item).animationName,
              duration: getComputedStyle(item).animationDuration
            }))
          };
        }"""
    )


def max_animation_seconds(value: object) -> float:
    durations = str(value).split(",")
    values: list[float] = []
    for duration in durations:
        duration = duration.strip()
        if duration.endswith("ms"):
            values.append(float(duration[:-2]) / 1000)
        elif duration.endswith("s"):
            values.append(float(duration[:-1]))
        else:
            values.append(0)
    return max(values, default=0)


def run_celebrations(
    browser: Browser,
    url: str,
    output: Path,
    width: int,
    height: int,
    reduced_motion: bool = False,
) -> dict[str, object]:
    context = browser.new_context(viewport={"width": width, "height": height})
    seed_context(context, streak=2)
    page = context.new_page()
    if reduced_motion:
        page.emulate_media(reduced_motion="reduce")
    page.goto(url, wait_until="networkidle")
    wait_for_game(page)
    states: list[dict[str, object]] = []
    screenshots: list[str] = []

    for streak in range(3, 12):
        if streak > 3:
            restart(page)
        win_round(page)
        state = effect_state(page)
        check(
            all(max_animation_seconds(item["duration"]) <= 1.8 for item in state["animations"]),
            f"streak {streak}: animation exceeds 1.8 seconds",
        )
        expected = TIERS.get(streak)
        if expected is not None:
            tier_id, label, particle_count, rings, rays, crowns = expected
            check(state["tier"] == tier_id, f"streak {streak}: wrong tier")
            check(label in state["text"], f"streak {streak}: missing tier label")
            check(state["particles"] == particle_count, f"streak {streak}: wrong particle data")
            check(state["sparks"] == particle_count, f"streak {streak}: wrong particle DOM count")
            check(state["rings"] == rings, f"streak {streak}: wrong ring geometry")
            check(state["rays"] == rays, f"streak {streak}: wrong ray geometry")
            check(state["crowns"] == crowns, f"streak {streak}: wrong crown geometry")
            check(state["pointerEvents"], f"streak {streak}: effect intercepts input")
            screenshots.append(
                screenshot(
                    page,
                    output,
                    f"celebration-{width}x{height}-{streak}",
                    "reduced" if reduced_motion else "motion",
                )
            )
        states.append({"streak": streak, **state})

        if streak == 3 and not reduced_motion:
            round_id = page.locator(".celebration [data-tier]").get_attribute("data-round-id")
            page.locator("#player-x-name").fill("Renamed X")
            page.locator("#player-x-name").blur()
            check(
                page.locator(".celebration [data-tier]").get_attribute("data-round-id") == round_id,
                "rename restarted celebration identity",
            )

    check(states[-1]["particles"] == 40, "legendary particles exceeded cap")
    palettes: dict[str, tuple[object, ...]] = {}
    for state in states:
        tier_id = state["tier"]
        if tier_id not in ("on-fire", "unstoppable", "dominating", "legendary"):
            continue
        palette = (
            state["primary"],
            state["secondary"],
            state["border"],
            state["background"],
        )
        if tier_id not in palettes:
            check(palette not in palettes.values(), f"{tier_id}: palette duplicates another tier")
            palettes[tier_id] = palette

    if reduced_motion:
        for state in states:
            check(
                all(
                    item["name"] == "none"
                    or max_animation_seconds(item["duration"]) <= 0.05
                    for item in state["animations"]
                ),
                f"streak {state['streak']}: reduced motion left an animated effect",
            )

    # Exercise restart and reset independently while a real celebration is present.
    restart(page)
    check(cells(page) == ["."] * CELL_COUNT, "restart was blocked during celebration")
    win_round(page)
    check(page.locator(".celebration [data-tier]").count() == 1, "second celebration did not render")
    page.locator(".reset-session-button").click()
    check(page.locator("[data-stat='draws']").inner_text().strip() == "0", "reset was blocked during celebration")
    check(page.locator(".celebration [data-tier]").count() == 0, "reset left celebration content")
    context.close()
    return {"reducedMotion": reduced_motion, "states": states, "screenshots": screenshots}


def run_enlarged_text(browser: Browser, url: str, output: Path) -> dict[str, object]:
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    page.goto(url, wait_until="networkidle")
    wait_for_game(page)
    page.evaluate("document.documentElement.style.fontSize = '200%'")
    page.locator("#player-x-name").focus()
    page.locator(".reset-session-button").scroll_into_view_if_needed()
    record = measure(page)
    reset = record["reset"]
    check(isinstance(reset, dict) and reset["height"] >= 44, "200% text shrank reset target")
    check(record["document"]["scrollHeight"] >= record["document"]["clientHeight"], "200% text was clipped")
    path = screenshot(page, output, "enlarged-text-390x844", "reachable")
    context.close()
    return {"measurement": record, "screenshot": path}


def run(url: str, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            viewport_records = [
                run_viewport(browser, url, output, name, width, height)
                for name, width, height in VIEWPORTS
            ]
            celebration = {
                "phone": run_celebrations(browser, url, output, 390, 844),
                "desktop": run_celebrations(browser, url, output, 1440, 900),
            }
            reduced = {
                "phone": run_celebrations(browser, url, output, 390, 844, reduced_motion=True),
                "desktop": run_celebrations(browser, url, output, 1440, 900, reduced_motion=True),
            }
            enlarged = run_enlarged_text(browser, url, output)
            result = {
                "url": url,
                "viewports": viewport_records,
                "celebrations": celebration,
                "reducedMotion": reduced,
                "enlargedText": enlarged,
                "safeArea": {"mode": "normal environment defaults", "simulation": False},
            }
            (output / "responsive_checks.json").write_text(
                json.dumps(result, indent=2), encoding="utf-8"
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
        default="outputs/acceptance/responsive",
        help="JSON and screenshot output directory",
    )
    args = parser.parse_args()
    try:
        run(args.url, Path(args.output))
    except Exception as error:  # pragma: no cover - CLI failure boundary
        print(f"responsive_checks failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
