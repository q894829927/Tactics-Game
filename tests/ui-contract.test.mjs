import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const board = readFileSync(new URL("../src/scene/BoardView.ts", import.meta.url), "utf8");

test("UI uses fullscreen viewport and no obsolete header", () => {
  assert.match(html, /class="battle-layout"/);
  assert.match(css, /100dvh/);
  assert.doesNotMatch(html, /class="site-header"/);
  assert.doesNotMatch(html, /id="round-display"/);
});

test("mockup primary controls and footer have functional elements", () => {
  for (const id of [
    "settings-button", "zoom-in", "zoom-out", "zoom-value",
    "minimap-grid", "phase-banner", "settings-overlay",
    "settings-end-turn", "restart-button", "log-list",
  ]) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  assert.match(html, /id="game-version"/);
  assert.doesNotMatch(html, /v\d+\.\d+\.\d+(?:\.\d+)?/);
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(main, /import \{ GAME_VERSION \} from "\.\/version\.ts"/);
  assert.match(main, /get\("game-version"\)\.textContent = GAME_VERSION/);
  assert.doesNotMatch(html, /单机原型/);
});

test("interactive board exposes zoom, map movement and contextual commands", () => {
  assert.match(board, /addEventListener\("wheel"/);
  assert.match(board, /passive: false/);
  assert.match(board, /setPointerCapture/);
  assert.match(board, /centerOn\(x, y\)/);
  assert.match(board, /renderMenu\(\)/);
  assert.match(board, /this\.battle\.click\(x, y\)/);
  assert.match(board, /this\.battle\.waitSelected\(\)/);
});
