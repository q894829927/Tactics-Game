import test from "node:test";
import assert from "node:assert/strict";
import {Battle} from "../src/engine/battle.ts";
import {combatPreviewView} from "../src/scene/combatPreviewView.ts";

function scenario(){
 const battle=new Battle();
 const ally=battle.units.find(u=>u.id==="a1");
 const enemy=battle.units.find(u=>u.id==="e1");
 ally.x=5;ally.y=1;enemy.x=6;enemy.y=1;
 const forecast=battle.forecastAttack(ally,enemy);
 assert.ok(forecast);
 return {ally,enemy,forecast};
}

test("Forecast hit row contains ONLY hit and critical, never weapon or skill traits",()=>{
 const {ally,enemy,forecast}=scenario();
 const withTraits={...forecast,
   attackerTrait:"命中伤害保底 5 · 造成魔法伤害 · 追击加伤害",
   defenderTrait:"魔法攻击 · 追击增伤",
   canCounter:true
 };
 const display=combatPreviewView(ally,enemy,withTraits);
 assert.equal(display.ally.hitText,
   "命中 "+forecast.attackerHit+"% · 必杀 "+forecast.attackerCrit+"%");
 assert.equal(display.enemy.hitText,
   "命中 "+forecast.defenderHit+"% · 必杀 "+forecast.defenderCrit+"%");
 for(const side of [display.ally,display.enemy]){
   assert.doesNotMatch(side.hitText,/保底|魔法|伤害|追击|增伤/);
 }
 assert.equal(display.ally.hpAfter,forecast.attackerHpAfter);
 assert.equal(display.enemy.hpAfter,forecast.defenderHpAfter);
 assert.equal(display.ally.firstDamage,forecast.damage);
});
test("Enemy-first hit row is clean, and absent counters stay absent",()=>{
 const {ally,enemy,forecast}=scenario();
 const enemyFirst={...forecast,canCounter:false,
   attackerTrait:"造成魔法伤害",
   defenderTrait:"命中伤害保底",
 };
 const v=combatPreviewView(enemy,ally,enemyFirst);
 assert.equal(v.enemy.hitText,
   "命中 "+forecast.attackerHit+"% · 必杀 "+forecast.attackerCrit+"%");
 assert.equal(v.ally.hitText,"无法反击");
 assert.doesNotMatch(v.enemy.hitText,/魔法|保底|追击/);
 const retaliates=combatPreviewView(enemy,ally,{...enemyFirst,canCounter:true});
 assert.equal(retaliates.ally.hitText,
   "命中 "+forecast.defenderHit+"% · 必杀 "+forecast.defenderCrit+"%");
});
