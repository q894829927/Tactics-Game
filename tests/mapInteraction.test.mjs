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
  assert.equal(leftClickIntent(battle, 1, 5, false), "confirm-stay");
  assert.equal(leftClickIntent(battle, 1, 5, true), "select-ally");
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

test("right-click cancels selection or undoes a staged move from any cell", () => {
  const battle=new Battle();
  assert.equal(rightClickIntent(battle,1,5),"cancel");
  battle.click(1,5);
  assert.equal(rightClickIntent(battle,1,5),"cancel");
  battle.click(2,5);
  assert.equal(rightClickIntent(battle,2,5),"undo-move");
  assert.equal(rightClickIntent(battle,-1,-1),"undo-move");
  assert.equal(rightClickIntent(battle,7,1),"undo-move");
  assert.equal(battle.cancelMove(),true);
  assert.equal(rightClickIntent(battle,1,5),"cancel");
  battle.waitSelected();
  assert.equal(rightClickIntent(battle,1,5),"cancel");
});

test("board routes right drag and right release separately from left inspection", () => {
  const board = readFileSync(new URL("../src/scene/BoardView.ts", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(board, /e\.button !== 2/);
  assert.match(board, /drag\.button === 2 && !drag\.moved/);
  assert.match(board, /this\.onRightCellClick\(tile\?\.x \?\? -1, tile\?\.y \?\? -1\)/);
  assert.match(board, /viewport\.addEventListener\("contextmenu", event => event\.preventDefault\(\)\)/);
  assert.doesNotMatch(board, /this\.menuVisible = !actor\.spent/);
  assert.match(board, /this\.menuVisible = false;/);
  assert.match(board, /this\.inspectCell\(x, y\)/);
  assert.match(board, /this\.showConfirmedCommands\(touched!\.id\)/);
  assert.match(board, /this\.animateMovement\(mover\.id, path\)\.then/);
  assert.match(board, /this\.undoTentativeMove\(\)/);
  assert.match(main, /◎ 原地行动/);
  assert.match(main, /const inspected = board\.inspectionCell/);
  assert.match(main, /selected\.team === "enemy"/);
  assert.match(html, /id="selection-title"/);
});
