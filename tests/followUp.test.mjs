import test from "node:test";
import assert from "node:assert/strict";
import {Battle} from "../src/engine/battle.ts";
import {weaponFor} from "../src/engine/weapons.ts";
import {FOLLOW_UP_AS_THRESHOLD,determineFollowUp} from "../src/engine/followUp.ts";

function duel(weaponId="iron-sword",distance=1) {
  const game=new Battle();
  const attacker=game.units.find(unit=>unit.id==="a1");
  const defender=game.units.find(unit=>unit.id==="e1");
  attacker.x=5;attacker.y=1;
  defender.x=5+distance;defender.y=1;
  attacker.weapon=weaponFor(weaponId);
  attacker.weapon.weight=0;
  defender.weapon.weight=0;
  attacker.build=99;defender.build=99;
  attacker.stats.speed=12;defender.stats.speed=8;
  for(const unit of [attacker,defender]){
    unit.hp=100;unit.maxHp=100;
    unit.stats.strength=1;unit.stats.magic=1;
    unit.stats.defense=0;unit.stats.resistance=0;
    unit.stats.dexterity=0;unit.stats.luck=20;
    unit.weapon.might=1;unit.weapon.hit=1000;unit.weapon.crit=0;
  }
  return {game,attacker,defender};
}

function attack(game,attacker,defender){
  game.click(attacker.x,attacker.y);
  game.click(defender.x,defender.y);
  return game.lastCombatEvents;
}

test("single shared follow-up threshold accepts ±4 but excludes ±3",()=>{
  assert.equal(FOLLOW_UP_AS_THRESHOLD,4);
  for(const [diff,result] of [
    [-5,"defender"],[-4,"defender"],[-3,null],[0,null],
    [3,null],[4,"attacker"],[5,"attacker"]
  ]){
    assert.equal(determineFollowUp(10+diff,10,true),result,"AS difference "+diff);
  }
  assert.equal(determineFollowUp(6,10,false),null,
    "a fast defender with no legal counter cannot follow up");
  assert.equal(determineFollowUp(14,10,false),"attacker",
    "an attacker can follow up even when defender cannot counter");
});

test("all currently available offensive categories follow up at exactly four AS",()=>{
  for(const [id,distance] of [
    ["iron-sword",1],["iron-lance",1],["iron-axe",1],
    ["iron-bow",2],["training-gauntlet",1],["fire-tome",1],
    ["thunder-tome",2],["light-bolt",1]
  ]){
    const {game,attacker,defender}=duel(id,distance);
    const before=JSON.stringify(game.units);
    const forecast=game.forecastAttack(attacker,defender);
    assert.ok(forecast,id+" legal forecast");
    assert.equal(forecast.followUp,"attacker",id+" attacker follow-up");
    assert.equal(JSON.stringify(game.units),before,id+" forecast must be pure");
    assert.equal(game.log.length,0,id+" forecast writes no log");
    const events=attack(game,attacker,defender);
    const followUps=events.filter(event=>event.kind==="follow-up");
    assert.equal(followUps.length,1,id+" should add exactly one attack");
    assert.equal(followUps[0].fromId,attacker.id,id+" follow-up belongs to attacker");
    assert.equal(forecast.attackerHpAfter,attacker.hp,id+" predicted attacker HP");
    assert.equal(forecast.defenderHpAfter,defender.hp,id+" predicted defender HP");
  }
});

test("actual gauntlet and offensive white magic follow the same weapon-agnostic rule",()=>{
  for(const weaponId of ["training-gauntlet","light-bolt"]){
    const {game,attacker,defender}=duel(weaponId);
    assert.equal(game.forecastAttack(attacker,defender).followUp,"attacker");
    assert.equal(attack(game,attacker,defender).filter(e=>e.kind==="follow-up").length,1);
  }
});

test("three AS difference never follows up even when both parties survive",()=>{
  const {game,attacker,defender}=duel();
  attacker.stats.speed=11;
  assert.equal(game.forecastAttack(attacker,defender).followUp,null);
  assert.deepEqual(attack(game,attacker,defender).map(e=>e.kind),["attack","counter"]);
});

test("fast defender can counter and follow up once at exactly four AS",()=>{
  const {game,attacker,defender}=duel();
  attacker.stats.speed=8;defender.stats.speed=12;
  const preview=game.forecastAttack(attacker,defender);
  assert.equal(preview.followUp,"defender");
  const events=attack(game,attacker,defender);
  assert.deepEqual(events.map(e=>e.kind),["attack","counter","follow-up"]);
  assert.equal(events[2].fromId,defender.id);
  assert.equal(preview.attackerHpAfter,attacker.hp);
  assert.equal(preview.defenderHpAfter,defender.hp);
});

test("defender with bow cannot counter at range one even if four AS faster",()=>{
  const {game,attacker,defender}=duel();
  attacker.stats.speed=8;defender.stats.speed=12;
  defender.weapon=weaponFor("iron-bow");
  defender.weapon.weight=0;defender.weapon.might=1;
  assert.equal(game.forecastAttack(attacker,defender).canCounter,false);
  assert.equal(game.forecastAttack(attacker,defender).followUp,null);
  assert.deepEqual(attack(game,attacker,defender).map(e=>e.kind),["attack"]);
});

test("opening strike kill and lethal counter suppress subsequent attacks",()=>{
  {
    const {game,attacker,defender}=duel();
    defender.hp=1;
    assert.equal(game.forecastAttack(attacker,defender).followUp,null);
    assert.deepEqual(attack(game,attacker,defender).map(e=>e.kind),["attack"]);
  }
  {
    const {game,attacker,defender}=duel();
    attacker.hp=1;defender.weapon.might=40;
    assert.equal(game.forecastAttack(attacker,defender).followUp,null);
    assert.deepEqual(attack(game,attacker,defender).map(e=>e.kind),["attack","counter"]);
    assert.equal(attacker.hp,0);
  }
});

test("actual miss can restore a follow-up excluded by assumed-hit forecast",()=>{
  const {game,attacker,defender}=duel();
  defender.hp=5;
  attacker.weapon.might=30;
  attacker.weapon.hit=0;
  defender.weapon.hit=0;
  const forecast=game.forecastAttack(attacker,defender);
  assert.equal(forecast.followUp,null,"expected kill in normal-hit forecast");
  const events=attack(game,attacker,defender);
  assert.deepEqual(events.map(e=>e.kind),["attack","counter","follow-up"]);
  assert.ok(events.every(e=>e.missed));
  assert.equal(defender.hp,5,"actual misses leave defender alive");
});

test("equipped weapon weight can move AS difference across threshold",()=>{
  const {game,attacker,defender}=duel();
  attacker.stats.speed=12;defender.stats.speed=8;
  assert.equal(game.forecastAttack(attacker,defender).followUp,"attacker");
  attacker.build=5;attacker.weapon.weight=6;
  assert.equal(game.combatStats(attacker).attackSpeed,11);
  assert.equal(game.forecastAttack(attacker,defender).followUp,null);
});

test("enemy AI commits the same four-AS follow-up used by its forecast",()=>{
  const {game,attacker,defender}=duel();
  attacker.stats.speed=8;defender.stats.speed=12;
  assert.equal(game.beginEnemyTurn(),true);
  const preview=game.forecastAttack(defender,attacker);
  assert.equal(preview.followUp,"attacker");
  const plan=game.planEnemyAction();
  assert.equal(plan?.unitId,defender.id);
  assert.equal(plan.targetId,attacker.id);
  assert.equal(game.commitEnemyAction(plan),true);
  assert.deepEqual(game.lastCombatEvents.map(e=>e.kind),["attack","counter","follow-up"]);
  assert.equal(game.lastCombatEvents[2].fromId,defender.id);
});

test("repeated read-only forecasts do not perturb seeded combat results",()=>{
  const first=duel(),second=duel();
  first.game.forecastAttack(first.attacker,first.defender);
  first.game.forecastAttack(first.attacker,first.defender);
  const a=attack(first.game,first.attacker,first.defender);
  const b=attack(second.game,second.attacker,second.defender);
  assert.deepEqual(a,b);
});
