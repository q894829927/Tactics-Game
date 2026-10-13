import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Battle } from "../src/engine/battle.ts";
import { tileWorld, worldScreen, WORLD_WIDTH, WORLD_HEIGHT, minimapFrame } from "../src/scene/worldGeometry.ts";

const board = readFileSync(new URL("../src/scene/BoardView.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

test("screen space unit HUD is a sibling of transformed world, not a scaled child", () => {
  assert.match(board, /viewport\.replaceChildren\(backdrop, world, this\.labelLayer, this\.menu\)/);
  assert.match(board, /this\.labelLayer\.appendChild\(label\)/);
  assert.match(board, /const screen = worldScreen\(point\.x, point\.y, camera\)/);
  assert.match(css, /\.screen-unit-labels\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.screen-unit-label\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(board, /this\.unitLayer\.appendChild\(mark\)/);
  assert.match(board, /mark\.className = "unit-ground-mark"/);
});

test("unit labels and minimap positions remain synchronized across zoom and battle state", () => {
  const battle = new Battle();
  for (const actor of battle.units) {
    const p = tileWorld(actor.x, actor.y);
    assert.ok(p.x / WORLD_WIDTH > 0 && p.x / WORLD_WIDTH < 1);
    assert.ok(p.y / WORLD_HEIGHT > 0 && p.y / WORLD_HEIGHT < 1);
    for (const zoom of [0.6, 1, 1.85]) {
      const pos = worldScreen(p.x, p.y, {x: -120, y: -220, zoom});
      assert.equal(pos.x, -120 + p.x * zoom);
      assert.equal(pos.y, -220 + p.y * zoom);
    }
  }
  const cam = minimapFrame({x:-260,y:-220,zoom:1.4},1000,600);
  assert.ok(cam.left >= 0 && cam.top >= 0);
  assert.ok(cam.width <= 1 && cam.height <= 1);
});

test("minimap shares ground resource decisions and ornamental sprite placement", () => {
  assert.match(board, /new GroundPainter\(groundCanvas, miniGround, battle\.terrain\)/);
  assert.match(board, /for \(const prop of sceneSprites\)/);
  assert.match(board, /img\.style\.left = \(prop\.x \/ WORLD_WIDTH \* 100\)/);
  assert.match(board, /this\.minimapUnits\.appendChild\(pin\)/);
  assert.match(board, /this\.viewportMarker\.style\.left = frame\.left \* 100/);
  assert.match(board, /mini\.addEventListener\("pointermove"/);
  assert.match(board, /mini\.addEventListener\("pointercancel"/);
});

test("camera and mini unit markers update from live positions; dead units are filtered", () => {
  assert.match(board, /this\.battle\.units\.filter\(u => u\.hp > 0\)/);
  assert.match(board, /this\.minimapUnits\.replaceChildren\(\)/);
  assert.match(board, /this\.labelLayer\.replaceChildren\(\)/);
  assert.match(board, /this\.labelNodes\.clear\(\)/);
  assert.match(board, /this\.labelNodes\.get\(unit\.id\)/);
});
