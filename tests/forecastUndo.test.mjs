import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";

test("selection and staged movement create no battle logs; cancel returns to origin", () => {
  const game = new Battle();
  assert.deepEqual(game.log, []);
  game.click(1, 5);
  const actor = game.selected;
  assert.ok(actor);
  assert.equal(game.log.length, 0);
  game.click(2, 5);
  assert.equal(actor.moved, true);
  assert.deepEqual({x:actor.x,y:actor.y}, {x:2,y:5});
  assert.equal(game.log.length, 0);
  assert.equal(game.canCancelMove, true);
  assert.equal(game.cancelMove(), true);
  assert.deepEqual({x:actor.x,y:actor.y}, {x:1,y:5});
  assert.equal(actor.moved, false);
  assert.equal(game.canCancelMove, false);
  assert.equal(game.log.length, 0);
  assert.ok(game.reachable(actor).has("2,5"));
});

test("moved actor can wait and the single log includes movement and wait", () => {
  const game = new Battle();
  game.click(1,5);
  game.click(2,5);
  game.waitSelected();
  assert.equal(game.log.length, 1);
  assert.match(game.log[0], /岚锋.*移动至 \(2, 5\).*待机/);
  assert.equal(game.cancelMove(), false);
  assert.equal(game.units.find(u=>u.id==="a1").spent, true);
});

test("forecasts match committed attacks including counter and lethal no-counter", () => {
  const game = new Battle();
  const actor = game.units.find(u=>u.id==="a1");
  const enemy = game.units.find(u=>u.id==="e1");
  actor.x=5;actor.y=1;enemy.x=6;enemy.y=1;
  game.click(5,1);
  const preview = game.forecastAttack(actor,enemy);
  assert.ok(preview);
  const beforeLog=game.log.length;
  assert.equal(beforeLog,0);
  assert.equal(enemy.hp,21);
  game.click(6,1);
  assert.equal(enemy.hp,preview.defenderHpAfter);
  assert.equal(actor.hp,preview.attackerHpAfter);
  assert.equal(game.log.length, 1);
  assert.match(game.log[0], /造成.*反击/);
  assert.equal(game.forecastAttack(actor,enemy),null);

  game.restart();
  const killer=game.units.find(u=>u.id==="a1");
  const weak=game.units.find(u=>u.id==="e1");
  killer.x=5;killer.y=1;weak.x=6;weak.y=1;weak.hp=1;
  const lethal=game.forecastAttack(killer,weak);
  assert.equal(lethal.defenderHpAfter,0);
  assert.equal(lethal.counterDamage,0);
  game.click(5,1);game.click(6,1);
  assert.equal(killer.hp,killer.maxHp);
});

test("enemy turns record one completed action per unit and never selection noise", () => {
  const game = new Battle();
  game.endTurn();
  assert.ok(game.log.length > 0);
  assert.ok(game.log.every(x=>/第 \d+ 回合 · /.test(x)));
  assert.ok(game.log.every(x=>!x.includes("选择了") && !x.startsWith("—")));
});

test("right-click undo and combat forecast retain explicit confirm/cancel", () => {
  const view=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(view,/rightClickIntent\(this\.battle,x,y\) === "undo-move"/);
  assert.match(view,/this\.showConfirmedCommands\(mover\.id\)/);
  assert.match(view,/this\.forecastTargetId = target\.id/);
  assert.match(view,/this\.battle\.forecastAttack\(selected, target,\s*this\.attackArtId\?\?undefined\)/);
  assert.match(view,/this\.battle\.click\(target\.x,\s*target\.y\)/);
  assert.match(view,/this\.battle\.cancelMove\(\)/);
  assert.match(html,/id="forecast-confirm"/);
  assert.match(html,/id="forecast-cancel"/);
  assert.match(html,/id="forecast-damage"/);
});
