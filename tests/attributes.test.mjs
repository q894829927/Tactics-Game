import test from "node:test";
import assert from "node:assert/strict";
import { Battle } from "../src/engine/battle.ts";
import { BASIC_KEYS, GROWTH_KEYS, awardExperience } from "../src/engine/attributes.ts";
import {readFileSync} from "node:fs";
test("all units have eight basic stats, nine growths, body, level and EXP",()=>{
  const g=new Battle();
  for(const u of g.units){
    for(const k of BASIC_KEYS)assert.ok(Number.isInteger(u.stats[k]));
    for(const k of GROWTH_KEYS)assert.ok(u.growths[k]>=0&&u.growths[k]<=100);
    assert.ok(u.move>0&&u.build>0&&u.maxHp>0&&u.level>0);
    assert.equal(u.exp,0);
  }
});
test("combat formulas use strength, magic, weight, build, skill and luck",()=>{
  const g=new Battle(),a=g.units.find(u=>u.id==="a1"),b=g.units.find(u=>u.id==="e1");
  assert.equal(g.combatStats(a).physicalAttack,11);
  assert.equal(g.combatStats(a).physicalProtection,3);
  assert.equal(g.combatStats(a).attackSpeed,9);
  assert.equal(g.combatStats(a).hit,110+20+4);
  assert.equal(g.combatStats(a).crit,5);
  assert.equal(g.combatStats(a).critAvoid,8);
  a.weapon.weight=12;
  assert.equal(g.combatStats(a).attackSpeed,5);
  a.build=12;
  assert.equal(g.combatStats(a).attackSpeed,9);
  const mage=g.units.find(u=>u.id==="a4");
  mage.x=5;mage.y=1;b.x=6;b.y=1;
  assert.equal(g.damage(mage,b),12-b.stats.resistance);
});
test("forecasts carry percent chances; follow-up and crit affect actual outcome",()=>{
  const g=new Battle(),a=g.units.find(u=>u.id==="a1"),b=g.units.find(u=>u.id==="e1");
  a.x=5;a.y=1;b.x=6;b.y=1;
  const f=g.forecastAttack(a,b);
  assert.equal(f.damage,9);assert.equal(f.counterDamage,5);
  assert.equal(f.attackerHit,100);assert.equal(f.attackerCrit,0);
  a.stats.speed=20;
  assert.equal(g.forecastAttack(a,b).followUp,"attacker");
  a.stats.speed=9;a.weapon.crit=100;b.stats.luck=0;
  assert.equal(g.criticalChance(a,b),100);
  g.click(5,1);g.click(6,1);
  assert.equal(b.hp,0);
  assert.match(g.log[0],/必杀/);
});
test("EXP and growth rates advance levels, HP growth heals",()=>{
 const g=new Battle(),u=g.units.find(x=>x.id==="a1");
 for(const k of GROWTH_KEYS)u.growths[k]=0;
 u.growths.hp=100;u.growths.strength=100;
 u.exp=90;
 const hp=u.hp, str=u.stats.strength;
 assert.equal(awardExperience(u,25,()=>.5),1);
 assert.equal(u.level,2);assert.equal(u.exp,15);
 assert.equal(u.hp,hp+1);assert.equal(u.maxHp,hp+1);
 assert.equal(u.stats.strength,str+1);
});
test("forecast does not grant EXP, confirmed attack does; UI exposes all groups",()=>{
 const g=new Battle(),a=g.units.find(x=>x.id==="a1"),b=g.units.find(x=>x.id==="e1");
 a.x=5;a.y=1;b.x=6;b.y=1;
 g.forecastAttack(a,b);assert.equal(a.exp,0);
 g.click(5,1);g.click(6,1);assert.ok(a.exp>=10);
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 for(const id of ["basic-attributes","combat-attributes","growth-attributes","unit-level","unit-exp","unit-build"])
  assert.ok(html.includes('id="'+id+'"'));
});
