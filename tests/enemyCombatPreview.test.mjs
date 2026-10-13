import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Battle } from "../src/engine/battle.ts";
import { combatPreviewView } from "../src/scene/combatPreviewView.ts";

test("enemy initiated forecast is pure and always renders ally left / enemy right", () => {
  const game = new Battle();
  const enemy = game.units.find(u => u.id === "e1");
  const ally = game.units.find(u => u.id === "a1");
  enemy.x = 2; enemy.y = 5;
  const before = game.units.map(u=>({id:u.id,hp:u.hp,x:u.x,y:u.y}));
  const forecast = game.forecastAttack(enemy, ally);
  assert.ok(forecast);
  const view = combatPreviewView(enemy, ally, forecast);
  assert.equal(view.ally.unit.id, ally.id);
  assert.equal(view.enemy.unit.id, enemy.id);
  assert.equal(view.ally.hpAfter, forecast.defenderHpAfter);
  assert.equal(view.enemy.hpAfter, forecast.attackerHpAfter);
  assert.equal(view.enemy.damageText, String(forecast.damage));
  assert.equal(view.ally.damageText, forecast.canCounter ? String(forecast.counterDamage) : "—");
  assert.match(view.enemy.hitText, /命中.*必杀/);
  assert.deepEqual(game.units.map(u=>({id:u.id,hp:u.hp,x:u.x,y:u.y})), before);
  assert.equal(game.log.length, 0);
});

test("player initiated forecast retains same sides and damage semantics", () => {
  const game = new Battle();
  const ally = game.units.find(u => u.id === "a1");
  const enemy = game.units.find(u => u.id === "e1");
  ally.x = 5; ally.y = 1; enemy.x = 6; enemy.y = 1;
  const forecast = game.forecastAttack(ally, enemy);
  assert.ok(forecast);
  const view = combatPreviewView(ally, enemy, forecast);
  assert.equal(view.ally.unit.id, ally.id);
  assert.equal(view.enemy.unit.id, enemy.id);
  assert.equal(view.ally.damageText, String(forecast.damage));
  assert.equal(view.enemy.damageText, forecast.canCounter ? String(forecast.counterDamage) : "—");
  assert.equal(view.ally.hpAfter, forecast.attackerHpAfter);
  assert.equal(view.enemy.hpAfter, forecast.defenderHpAfter);
});

test("enemy preview uses the planned destination without changing engine until commit", () => {
  const game = new Battle();
  game.beginEnemyTurn();
  const enemy = game.units.find(u => u.id === "e1");
  const ally = game.units.find(u => u.id === "a1");
  const start = {x:enemy.x,y:enemy.y,hp:enemy.hp};
  const target = {x:ally.x,y:ally.y,hp:ally.hp};
  const projected = {...enemy, x:2,y:5};
  const forecast = game.forecastAttack(projected, ally);
  assert.ok(forecast);
  assert.deepEqual({x:enemy.x,y:enemy.y,hp:enemy.hp}, start);
  assert.deepEqual({x:ally.x,y:ally.y,hp:ally.hp}, target);
  assert.equal(game.log.length, 0);
});

test("enemy turn waits 5000ms or a consumed click before exactly one commit", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const board = readFileSync(new URL("../src/scene/BoardView.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  assert.match(main, /await board\.showEnemyCombatPreview\(plan, 5000\)/);
  assert.match(main, /if \(plan\.targetId\) await board\.showEnemyCombatPreview/);
  assert.ok(main.indexOf("await board.showEnemyCombatPreview(plan, 5000)") <
    main.indexOf("battle.commitEnemyAction(plan)"));
  assert.match(main, /board\.holdUnitAt\(plan\.unitId, plan\.destination\)/);
  assert.match(main, /board\.releaseUnitHold\(\)/);
  assert.match(board, /showEnemyCombatPreview\(plan: EnemyActionPlan, durationMs = 5000\)/);
  assert.match(board, /window\.addEventListener\("click", skipClick, true\)/);
  assert.match(board, /event\.preventDefault\(\)/);
  assert.match(board, /event\.stopImmediatePropagation\(\)/);
  assert.match(board, /window\.removeEventListener\("click", skipClick, true\)/);
  assert.match(board, /window\.clearTimeout\(timeoutId\)/);
  assert.match(board, /this\.cancelEnemyCombatPreview\(\)/);
  assert.match(css, /\.attack-forecast\.enemy-auto-forecast \.forecast-actions \{ display: none !important; \}/);
});
