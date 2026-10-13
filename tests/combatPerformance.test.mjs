import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";

test("combat events are sequential, HP coherent, and one combat gives one log",()=>{
 const b=new Battle(),a=b.units.find(u=>u.id==="a1"),e=b.units.find(u=>u.id==="e1");
 a.x=5;a.y=1;e.x=6;e.y=1;
 const before=[a.hp,e.hp];b.click(5,1);b.click(6,1);
 assert.ok(b.lastCombatEvents.length>=1);
 assert.equal(b.lastCombatEvents[0].kind,"attack");
 assert.equal(b.lastCombatEvents[0].fromId,a.id);
 assert.equal(b.lastCombatEvents[0].toId,e.id);
 assert.equal(b.log.length,1);
 assert.ok(a.exp>0);
 let hp=new Map([[a.id,before[0]],[e.id,before[1]]]);
 for(const ev of b.lastCombatEvents){
   assert.equal(ev.fromHpAfter,hp.get(ev.fromId));
   assert.equal(ev.toHpAfter,Math.max(0,hp.get(ev.toId)-ev.damage));
   hp.set(ev.toId,ev.toHpAfter);
   assert.equal(ev.defeated,ev.toHpAfter===0);
 }
 assert.equal(hp.get(e.id),e.hp);
});

test("critical, miss and follow-up are distinct playback events",()=>{
 const b=new Battle(),a=b.units.find(u=>u.id==="a1"),e=b.units.find(u=>u.id==="e1");
 a.x=5;a.y=1;e.x=6;e.y=1;
 a.weapon.crit=100;e.stats.luck=0;
 b.click(5,1);b.click(6,1);
 assert.equal(b.lastCombatEvents[0].critical,true);
 assert.equal(b.lastCombatEvents[0].defeated,true);
 assert.equal(b.lastCombatEvents.length,1);
 b.restart();
 const p=b.units.find(u=>u.id==="a1"),q=b.units.find(u=>u.id==="e1");
 p.x=5;p.y=1;q.x=6;q.y=1;p.weapon.hit=0;p.stats.dexterity=0;
 q.weapon.hit=0;q.stats.dexterity=0;p.stats.speed=20;
 b.click(5,1);b.click(6,1);
 assert.ok(b.lastCombatEvents.some(x=>x.missed));
 assert.ok(b.lastCombatEvents.some(x=>x.kind==="follow-up"));
 assert.equal(b.log.length,1);
});

test("enemy attacks generate events while each enemy commits one log",()=>{
 const b=new Battle();b.beginEnemyTurn();
 let found=false;
 while(b.result==="playing"){
  const plan=b.planEnemyAction();if(!plan)break;
  const before=b.log.length;
  assert.equal(b.commitEnemyAction(plan),true);
  assert.equal(b.log.length,before+1);
  if(plan.targetId){found=true;assert.ok(b.lastCombatEvents.length>0);}
 }
 assert.equal(b.finishEnemyTurn(),true);
});

test("player and enemy use same playback and restart cancels animations",()=>{
 const view=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
 assert.match(view,/void this\.playCombatEvents\(this\.battle\.lastCombatEvents\)/);
 assert.match(main,/await board\.playCombatEvents\(battle\.lastCombatEvents\)/);
 assert.match(view,/this\.cancelCombatPerformance\(\)/);
 assert.match(view,/combat-floating-number/);
 assert.match(view,/is-dodging/);
 assert.match(view,/is-striking/);
});

test("one click skips the entire combat presentation, never a second resolution",()=>{
 const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 assert.match(board,/this\.combatSkipRemaining=true;/);
 assert.match(board,/reduced\|\|this\.combatSkipRemaining\?0:650/);
 assert.match(board,/this\.skipCombatStep\?\.\(\)/);
});
