import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Battle, MAP_HEIGHT, MAP_WIDTH, distance, key } from "../src/engine/battle.ts";
import { TERRAIN_INFO } from "../src/engine/terrain.ts";

const at = (x, y) => key({x,y});

test("enemy movement preview shares weighted Dijkstra and blocking", () => {
  const game = new Battle();
  const enemy = game.units.find(u => u.id === "e1");
  const range = game.enemyThreat(enemy);
  assert.deepEqual(range.move, new Set(game.reachable(enemy).keys()));
  assert.ok(range.move.has(at(enemy.x, enemy.y)));
  assert.equal(range.move.has(at(3,2)), false);
  assert.equal(range.move.has(at(8,2)), false); // e2 occupies this location
  assert.equal(range.move.has(at(7,3)), false); // e3 occupies this location
  for (const loc of range.move) {
    const [x,y] = loc.split(",").map(Number);
    assert.ok(x>=0&&y>=0&&x<MAP_WIDTH&&y<MAP_HEIGHT);
    assert.notEqual(game.tile(x,y), "#");
  }
});

test("enemy attack threat is union of attackable tiles from every legal endpoint", () => {
  const game = new Battle();
  for (const id of ["e1", "e3", "e6"]) {
    const enemy = game.units.find(u => u.id === id);
    const range = game.enemyThreat(enemy);
    const expected = new Set();
    for (const pos of game.reachable(enemy).keys()) {
      const [x,y] = pos.split(",").map(Number);
      for (let py=0; py<MAP_HEIGHT; py++) for (let px=0; px<MAP_WIDTH; px++) {
        const d = distance({x,y},{x:px,y:py});
        if (d>=enemy.minRange && d<=enemy.maxRange &&
            Number.isFinite(TERRAIN_INFO[game.tile(px,py)].moveCost) &&
            game.occupant(px,py)?.team !== "enemy") expected.add(at(px,py));
      }
    }
    assert.deepEqual(range.attack,expected);
  }
});

test("zero movement archer can only attack at range 2 or 3", () => {
  const game = new Battle();
  const archer = game.units.find(u=>u.id==="e3");
  archer.x=4; archer.y=3; archer.move=0;
  const range = game.enemyThreat(archer);
  assert.deepEqual(range.move,new Set([at(4,3)]));
  assert.equal(range.attack.has(at(4,4)),false);
  assert.equal(range.attack.has(at(4,5)),true);
  assert.equal(range.attack.has(at(6,3)),true);
  assert.equal(range.attack.has(at(3,2)),false);
});

test("threat cannot cause movement, HP, selected state or combat log changes", () => {
  const game = new Battle();
  const ally=game.units.find(u=>u.id==="a1");
  const enemy=game.units.find(u=>u.id==="e1");
  assert.deepEqual(game.enemyThreat(ally),{move:new Set(),attack:new Set()});
  const units=game.units.map(u=>({...u}));
  const before={round:game.round,selected:game.selectedId,log:[...game.log]};
  game.enemyThreat(enemy);
  assert.deepEqual(game.units,units);
  assert.deepEqual({round:game.round,selected:game.selectedId,log:[...game.log]},before);
  enemy.hp=0;
  assert.deepEqual(game.enemyThreat(enemy),{move:new Set(),attack:new Set()});
});

test("board renders only inspected enemy threat, keeping attack targeting priority", () => {
  const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
  const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
  assert.match(board,/inspected\?\.team === "enemy" && !this\.attackMode && !this\.forecastTargetId/);
  assert.match(board,/this\.battle\.enemyThreat\(inspected\)/);
  assert.match(board,/enemyMove \? "enemy-threat-move"/);
  assert.match(board,/enemyAttack \? \(enemyMove \? "enemy-threat-overlap" : "enemy-threat-attack"\)/);
  assert.match(css,/\.range-cell\.enemy-threat-move/);
  assert.match(css,/\.range-cell\.enemy-threat-attack/);
  assert.match(css,/\.range-cell\.enemy-threat-overlap/);
});
