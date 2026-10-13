import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Battle } from "../src/engine/battle.ts";
import { leftClickIntent, rightClickIntent } from "../src/scene/interactionPolicy.ts";

test("left mouse selects allies without opening actions and inspects enemies", () => {
  const battle = new Battle();
  assert.equal(leftClickIntent(battle, 1, 5, false), "select-ally");
  assert.equal(leftClickIntent(battle, 7, 1, false), "inspect");
  battle.click(1, 5);
  assert.equal(leftClickIntent(battle, 7, 1, false), "inspect");
  assert.equal(leftClickIntent(battle, 7, 1, true), "attack");
});

test("empty tiles show terrain, except an actual valid move", () => {
  const battle = new Battle();
  assert.equal(leftClickIntent(battle, 5, 5, false), "inspect");
  assert.equal(leftClickIntent(battle, 3, 2, false), "inspect"); // cliff
  battle.click(1, 5);
  assert.equal(leftClickIntent(battle, 2, 5, false), "move");
  assert.equal(leftClickIntent(battle, 2, 5, true), "inspect");
  assert.equal(leftClickIntent(battle, 9, 0, false), "inspect");
  battle.units.find(u => u.id === "a1").moved = true;
  assert.equal(leftClickIntent(battle, 2, 5, false), "inspect");
});

test("right click only shows action menu on actionable allied units", () => {
  const battle = new Battle();
  assert.equal(rightClickIntent(battle, 1, 5), "open-menu");
  assert.equal(rightClickIntent(battle, 7, 1), "inspect");
  assert.equal(rightClickIntent(battle, 6, 5), "inspect");
  assert.equal(rightClickIntent(battle, 3, 2), "inspect");
  battle.click(1, 5);
  battle.waitSelected();
  assert.equal(rightClickIntent(battle, 1, 5), "inspect");
});

test("board routes right drag and right release separately from left inspection", () => {
  const board = readFileSync(new URL("../src/scene/BoardView.ts", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(board, /e\.button !== 2/);
  assert.match(board, /drag\.button === 2 && !drag\.moved/);
  assert.match(board, /if \(tile\) this\.onRightCellClick\(tile\.x, tile\.y\)/);
  assert.match(board, /viewport\.addEventListener\("contextmenu", event => event\.preventDefault\(\)\)/);
  assert.doesNotMatch(board, /this\.menuVisible = !actor\.spent/);
  assert.match(board, /this\.menuVisible = false;/);
  assert.match(board, /this\.inspectCell\(x, y\)/);
  assert.match(main, /const inspected = board\.inspectionCell/);
  assert.match(main, /selected\.team === "enemy"/);
  assert.match(html, /id="selection-title"/);
});
