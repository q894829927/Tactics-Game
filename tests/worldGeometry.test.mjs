import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { Battle } from "../src/engine/battle.ts";
import {
  TILE, TACTICAL_X, TACTICAL_Y, WORLD_COLS, WORLD_ROWS, WORLD_WIDTH, WORLD_HEIGHT,
  tileWorld, worldTile, worldScreen, screenWorld, screenTile, minimapFrame,
} from "../src/scene/worldGeometry.ts";

test("A1 coordinate contract: 16x12 stage and 10x8 playable origin", () => {
  assert.equal(TILE, 92);
  assert.equal(WORLD_COLS, 16);
  assert.equal(WORLD_ROWS, 12);
  assert.equal(WORLD_WIDTH, 1472);
  assert.equal(WORLD_HEIGHT, 1104);
  assert.equal(TACTICAL_X, 276);
  assert.equal(TACTICAL_Y, 184);
  assert.deepEqual(tileWorld(0, 0, false), {x: 276, y: 184});
  assert.deepEqual(tileWorld(1, 5), {x: 414, y: 690});
  assert.deepEqual(tileWorld(9, 7), {x: 1150, y: 874});
});

test("no clickable tile is created outside the playable grid", () => {
  assert.equal(worldTile(275.999, 184), null);
  assert.equal(worldTile(276, 183.999), null);
  assert.deepEqual(worldTile(276, 184), {x: 0, y: 0});
  assert.deepEqual(worldTile(1195.999, 919.999), {x: 9, y: 7});
  assert.equal(worldTile(1196, 919), null);
  assert.equal(worldTile(1195, 920), null);
  assert.equal(worldTile(1300, 500), null); // Decorative river.
  assert.equal(worldTile(1020, 90), null); // Decorative camp.
  assert.equal(worldTile(-1, -1), null);
});

test("all units use unchanged battle coordinates and reversible camera projection", () => {
  const battle = new Battle();
  for (const u of battle.units) {
    const anchor = tileWorld(u.x, u.y);
    assert.deepEqual(worldTile(anchor.x, anchor.y), {x: u.x, y: u.y});
    for (const zoom of [.6, 1, 1.85]) {
      const camera = {x: -331, y: 57, zoom};
      const screen = worldScreen(anchor.x, anchor.y, camera);
      const roundtrip = screenWorld(screen.x, screen.y, camera);
      assert.ok(Math.abs(roundtrip.x - anchor.x) < 1e-9);
      assert.ok(Math.abs(roundtrip.y - anchor.y) < 1e-9);
      assert.deepEqual(screenTile(screen.x, screen.y, camera), {x: u.x, y: u.y});
    }
  }
});

test("minimap frame covers full world and clamps around camera", () => {
  const whole = minimapFrame({x: 300, y: 100, zoom: .6}, 1366, 800);
  assert.deepEqual(whole, {left: 0, top: 0, width: 1, height: 1});
  const part = minimapFrame({x: -300, y: -200, zoom: 1.85}, 1000, 700);
  assert.ok(part.left > 0 && part.top > 0);
  assert.ok(part.width < 1 && part.height < 1);
  assert.ok(part.left + part.width <= 1 && part.top + part.height <= 1);
});

test("world layers and tactical hit cells remain separated in the DOM construction", () => {
  const source = readFileSync(new URL("../src/scene/BoardView.ts", import.meta.url), "utf8");
  for (const layer of ["world-ground", "world-environment", "world-decal", "tactical-hit-grid", "tactical-route", "world-units", "world-foreground"]) {
    assert.ok(source.includes('layer("' + layer + '")'), layer);
  }
  assert.match(source,/const moveLayer=makeHighlight\("move"\)/);
  assert.match(source,/const attackLayer=makeHighlight\("attack"\)/);
  assert.match(source,/layer\("tactical-highlight tactical-highlight-"\+kind\)/);
  assert.match(source, /grid\.style\.left = TACTICAL_X/);
  assert.match(source, /grid\.style\.top = TACTICAL_Y/);
  assert.match(source, /grid\.appendChild\(cell\)/);
  assert.match(source, /this\.unitLayer\.appendChild\(mark\)/);
  assert.match(source, /this\.minimapUnits\.appendChild\(pin\)/);
  assert.match(source, /this\.labelLayer\.appendChild\(label\)/);
});
