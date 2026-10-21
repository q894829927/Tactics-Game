import test from "node:test";
import assert from "node:assert/strict";
import {Battle} from "../src/engine/battle.ts";
import {makeAttackAction,canPayActionCosts,payActionCosts}
  from "../src/engine/actionSpec.ts";
import {weaponFor} from "../src/engine/weapons.ts";
import {readFileSync} from "node:fs";

function duel(actorId="a1"){
  const game=new Battle();
  const actor=game.units.find(u=>u.id===actorId);
  const target=game.units.find(u=>u.id==="e1");
  actor.x=4;actor.y=4;target.x=5;target.y=4;
  actor.hp=actor.maxHp=120;target.hp=target.maxHp=120;
  actor.build=99;target.build=99;
  actor.stats.speed=10;target.stats.speed=10;
  actor.stats.luck=0;target.stats.luck=0;
  actor.stats.dexterity=0;target.stats.dexterity=0;
  actor.weapon.hit=1000;target.weapon.hit=1000;
  actor.weapon.crit=0;target.weapon.crit=0;
  return {game,actor,target};
}
test("S1-0 preview yields a typed action spec without consuming state or RNG",()=>{
  const {game,actor,target}=duel();
  const before=JSON.stringify({units:game.units,log:game.log,random:game.randomState});
  const a=game.previewAction(actor,target);
  assert.equal(a.spec.kind,"attack");
  assert.equal(a.spec.actionId,"basic-attack");
  assert.equal(a.spec.targetId,target.id);
  assert.deepEqual(a.spec.costs,[]);
  assert.equal(a.forecast.damage,game.forecastAttack(actor,target).damage);
  assert.equal(JSON.stringify({units:game.units,log:game.log,random:game.randomState}),before);
  assert.deepEqual(game.lastActionEvents,[]);
});
test("S1-0 art is still sample-only; atomic resources reject duplicates and partial payment",()=>{
  const {game,actor,target}=duel();
  const item=actor.weaponInstances[0];
  const spec=makeAttackAction(actor,actor.id,target.id,game.basicArt);
  assert.equal(spec.actionId,game.basicArt.id);
  assert.equal(spec.costs[0].instanceId,item.instanceId);
  const costs=[spec.costs[0],spec.costs[0]];
  item.durability=5;
  assert.equal(canPayActionCosts(actor,costs),false);
  assert.equal(payActionCosts(actor,costs),false);
  assert.equal(item.durability,5);
  assert.ok(game.previewAction(actor,target,game.basicArt.id));
});
test("S1-0 committed art pays before RNG and records ordered receipt, miss costs once",()=>{
  const {game,actor,target}=duel();
  actor.weapon.hit=0;
  game.click(actor.x,actor.y);
  const initial=actor.weaponInstances[0].durability;
  assert.equal(game.useCombatArt(actor,target,game.basicArt.id),true);
  assert.equal(actor.weaponInstances[0].durability,initial-3);
  assert.equal(game.lastActionEvents[0].kind,"confirmed");
  assert.equal(game.lastActionEvents[1].kind,"resource");
  assert.equal(game.lastActionEvents[1].cost.amount,3);
  assert.equal(game.lastActionEvents[2].kind,"strike");
  assert.equal(game.lastActionEvents[2].combat.missed,true);
  assert.equal(game.useCombatArt(actor,target,game.basicArt.id),false);
});
test("S1-0 spell attack pays exactly one charge and rejects an unfunded cast",()=>{
  const {game,actor,target}=duel("a4");
  target.x=6;
  const before=actor.spellCharges["fire-tome"];
  assert.equal(game.previewAction(actor,target).spec.costs[0].kind,"spell");
  assert.equal(actor.spellCharges["fire-tome"],before);
  game.click(actor.x,actor.y);
  assert.equal(game.useCombatArt(actor,target,"invented-art"),false);
  assert.equal(actor.spellCharges["fire-tome"],before);
  game.click(target.x,target.y);
  assert.equal(actor.spellCharges["fire-tome"],before-1);
  assert.equal(game.lastActionEvents[1].kind,"resource");
  assert.equal(game.lastActionEvents[1].cost.spellId,"fire-tome");
});
test("S1-0 rejected art action does not consume durability, hp, log or an action",()=>{
  const {game,actor,target}=duel();
  game.click(actor.x,actor.y);
  const item=actor.weaponInstances[0];
  item.durability=2;
  const original=JSON.stringify({hp:actor.hp,targetHp:target.hp,wear:item.durability,log:game.log});
  assert.equal(game.previewAction(actor,target,game.basicArt.id),null);
  assert.equal(game.useCombatArt(actor,target,game.basicArt.id),false);
  assert.equal(JSON.stringify({hp:actor.hp,targetHp:target.hp,wear:item.durability,log:game.log}),original);
  assert.equal(actor.acted,false);
  assert.deepEqual(game.lastActionEvents,[]);
});
test("S1-0 UI exposes only a clearly labelled W2 sample art and action cost",()=>{
 const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const flat=readFileSync(new URL("../src/scene/flatBattleCommands.ts",import.meta.url),"utf8");
 assert.match(flat,/"强击"/);
 assert.match(flat,/availableArtWeapons\(actor\)/);
 assert.match(board,/useCombatArt\(attacker,target,this\.attackArtId\)/);
 assert.match(index,/id="forecast-action-cost"/);
});
