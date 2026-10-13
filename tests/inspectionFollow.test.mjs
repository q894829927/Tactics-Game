import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Battle } from "../src/engine/battle.ts";
import { InspectionState } from "../src/scene/InspectionState.ts";

test("enemy inspection follows unit identity after a committed enemy move", () => {
  const battle = new Battle();
  const enemy = battle.units.find(u=>u.id==="e1");
  const inspected = new InspectionState(battle);
  const original = {x:enemy.x,y:enemy.y};
  inspected.inspect(original.x,original.y);
  assert.equal(inspected.selectedUnitId,enemy.id);
  battle.beginEnemyTurn();
  const plan = battle.planEnemyAction();
  assert.ok(plan);
  assert.equal(plan.unitId, enemy.id);
  assert.equal(battle.commitEnemyAction(plan), true);
  const now = inspected.cell;
  assert.deepEqual(now, {x:enemy.x,y:enemy.y});
  assert.deepEqual(battle.enemyThreat(enemy).move, new Set(battle.reachable(enemy).keys()));
  if (plan.destination.x !== original.x || plan.destination.y !== original.y) {
    assert.notDeepEqual(now, original);
  }
});

test("inspection never switches to a different unit taking the previous tile", () => {
  const battle = new Battle();
  const a = battle.units.find(u=>u.id==="e1");
  const b = battle.units.find(u=>u.id==="e2");
  const state = new InspectionState(battle);
  const old = {x:a.x,y:a.y};
  state.inspect(a.x,a.y);
  a.x=4; a.y=4;
  b.x=old.x; b.y=old.y;
  assert.equal(state.selectedUnitId,a.id);
  assert.deepEqual(state.cell, {x:4,y:4});
  a.hp=0;
  assert.equal(state.cell,null);
});

test("empty tile inspection does not follow other units, reset clears inspection", () => {
  const battle = new Battle();
  const state = new InspectionState(battle);
  state.inspect(5,5);
  assert.equal(state.selectedUnitId,null);
  const enemy = battle.units.find(u=>u.id==="e1");
  enemy.x=5; enemy.y=5;
  assert.deepEqual(state.cell, {x:5,y:5});
  state.clear();
  assert.equal(state.cell,null);
  assert.equal(state.selectedUnitId,null);
});

test("UI uses dynamic tracked inspection for enemy threats, labels, sidebar", () => {
  const board=readFileSync(new URL("../src/scene/BoardView.ts", import.meta.url),"utf8");
  const main=readFileSync(new URL("../src/main.ts", import.meta.url),"utf8");
  assert.match(board,/this\.inspection = new InspectionState\(battle\)/);
  assert.match(board,/get inspectionCell\(\): Point \| null \{ return this\.inspection\.cell; \}/);
  assert.match(board,/const inspectedCell=this\.inspectionCell/);
  assert.match(board,/this\.battle\.enemyThreat\(focus\)/);
  assert.doesNotMatch(board,/this\.inspectedCell/);
  assert.match(main,/const inspected = board\.inspectionCell/);
  assert.match(main,/board\.clearInspection\(\)/);
});

test("enemy phase banner is red, player phase remains blue", () => {
  const main=readFileSync(new URL("../src/main.ts", import.meta.url),"utf8");
  const css=readFileSync(new URL("../src/style.css", import.meta.url),"utf8");
  assert.match(main,/banner\.classList\.toggle\("phase-enemy", english === "ENEMY PHASE"\)/);
  assert.match(css,/\.phase-banner \{[\s\S]*?#4dacf4/);
  assert.match(css,/\.phase-banner\.phase-enemy \{[\s\S]*?#f06d6c/);
  assert.match(main,/showPhase\("第 " \+ battle\.round \+ " 回合 · 敌方行动", "ENEMY PHASE"/);
  assert.match(main,/showPhase\("第 " \+ battle\.round \+ " 回合 · 我方行动", "PLAYER PHASE"/);
});
