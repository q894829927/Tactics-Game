import test from "node:test";
import assert from "node:assert/strict";
import { Battle, MAP_WIDTH, MAP_HEIGHT, distance, key } from "../src/engine/battle.ts";

test("10x8 battlefield with four allies and six enemies", () => {
  const game = new Battle();
  assert.equal(game.terrain.length, MAP_HEIGHT);
  for (const row of game.terrain) assert.equal(row.length, MAP_WIDTH);
  assert.equal(game.alive("ally").length, 4);
  assert.equal(game.alive("enemy").length, 6);
  assert.equal(game.result, "playing");
  assert.equal(game.round, 1);
});

test("movement uses weighted path costs, blocks walls and occupied units", () => {
  const game = new Battle();
  const ally = game.units.find(u => u.id === "a1");
  assert.ok(ally);
  assert.equal(game.tile(1, 3), ".");
  assert.equal(game.tile(1, 1), "F");
  assert.equal(game.tile(3, 2), "#");
  assert.equal(game.reachable(ally).has(key({ x: 3, y: 2 })), false);
  assert.equal(game.reachable(ally).has(key({ x: 1, y: 6 })), false);
  assert.equal(game.reachable(ally).get(key({ x: 2, y: 5 })), 1);
  assert.equal(game.reachable(ally).get(key({ x: 3, y: 5 })), 3);
  assert.equal(distance({ x: 1, y: 1 }, { x: 2, y: 3 }), 3);
});

test("move then attack and counterattack spend turn, with deterministic damage", () => {
  const game = new Battle();
  const actor = game.units.find(u => u.id === "a1");
  const enemy = game.units.find(u => u.id === "e1");
  assert.ok(actor && enemy);
  actor.x = 5; actor.y = 1;
  enemy.x = 6; enemy.y = 1;
  game.click(5, 1);
  game.click(6, 1);
  assert.equal(enemy.hp, enemy.maxHp - 9);
  assert.equal(actor.hp, actor.maxHp - 5);
  assert.equal(actor.spent, true);
  assert.equal(game.selected, undefined);
});

test("archer cannot retaliate at range one and can fire at range two", () => {
  const game = new Battle();
  const archer = game.units.find(u => u.id === "a3");
  const enemy = game.units.find(u => u.id === "e1");
  assert.ok(archer && enemy);
  archer.x = 4; archer.y = 4;
  enemy.x = 6; enemy.y = 4;
  assert.equal(game.inAttackRange(archer, enemy), true);
  assert.equal(game.inAttackRange(enemy, archer), false);
  game.click(4, 4);
  game.click(6, 4);
  assert.equal(archer.hp, archer.maxHp);
  assert.ok(enemy.hp < enemy.maxHp);
});

test("wait and end turn reset allied action flags after enemies act", () => {
  const game = new Battle();
  game.click(1, 5);
  game.waitSelected();
  assert.equal(game.units.find(u => u.id === "a1")?.spent, true);
  game.endTurn();
  assert.equal(game.round, 2);
  assert.equal(game.units.find(u => u.id === "a1")?.spent, false);
  assert.equal(game.selected, undefined);
});

test("commander kill ends mission; restart reconstructs original state", () => {
  const game = new Battle();
  const actor = game.units.find(u => u.id === "a1");
  const boss = game.units.find(u => u.id === "e6");
  assert.ok(actor && boss);
  actor.x = 8; actor.y = 7;
  boss.hp = 1;
  game.click(8, 7);
  game.click(9, 7);
  assert.equal(game.result, "victory");
  game.restart();
  assert.equal(game.result, "playing");
  assert.equal(game.units.find(u => u.id === "e6")?.hp, 38);
  assert.equal(game.round, 1);
});

test("defeat when all allies are gone", () => {
  const game = new Battle();
  game.alive("ally").forEach(u => { u.hp = 0; });
  game.endTurn();
  assert.equal(game.result, "defeat");
});
