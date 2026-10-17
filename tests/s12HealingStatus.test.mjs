import test from "node:test";
import assert from "node:assert/strict";
import {Battle} from "../src/engine/battle.ts";
import {weaponFor} from "../src/engine/weapons.ts";
import {applyStatus,statusPower,startStatusPhase,finishStatusPhase,absorbDamage}
  from "../src/engine/statusEffects.ts";

function fixtures(){
 const game=new Battle();
 const actor=game.units.find(u=>u.id==="a1");
 const ally=game.units.find(u=>u.id==="a2");
 const enemy=game.units.find(u=>u.id==="e1");
 actor.x=4;actor.y=4;ally.x=4;ally.y=5;enemy.x=5;enemy.y=4;
 return {game,actor,ally,enemy};
}
function healer(actor){
 actor.classId="acolyte";
 actor.inventory[0]="healing-prayer";
 actor.weapon=weaponFor("healing-prayer");
 actor.weaponInstances[0]=null;
 actor.spellCharges["healing-prayer"]=6;
}
test("S1-2 healing requires a damaged friendly target; preview is pure and commit costs one charge",()=>{
 const {game,actor,ally,enemy}=fixtures();healer(actor);
 assert.equal(game.previewSupport(actor,ally,"heal"),null);
 ally.hp-=8;
 const before=JSON.stringify({units:game.units,log:game.log});
 const preview=game.previewSupport(actor,ally,"heal");
 assert.equal(preview.effect,"heal");assert.ok(preview.value>0);
 assert.equal(JSON.stringify({units:game.units,log:game.log}),before);
 game.click(actor.x,actor.y);
 assert.equal(game.commitSupport(actor,enemy,"heal"),false);
 assert.equal(game.commitSupport(actor,ally,"heal"),true);
 assert.equal(ally.hp,ally.maxHp-8+preview.value);
 assert.equal(actor.spellCharges["healing-prayer"],5);
 assert.equal(actor.spent,true);
 assert.deepEqual(game.lastActionEvents.map(x=>x.kind),["confirmed","resource"]);
});
test("S1-2 healing cannot be farmed on full HP or without charges",()=>{
 const {game,actor,ally}=fixtures();healer(actor);
 ally.hp=ally.maxHp-4;actor.spellCharges["healing-prayer"]=0;
 game.click(actor.x,actor.y);
 assert.equal(game.commitSupport(actor,ally,"heal"),false);
 assert.equal(ally.hp,ally.maxHp-4);
 assert.equal(actor.acted,false);assert.equal(game.log.length,0);
});
test("S1-2 shield absorbs before HP and forecasts agree",()=>{
 const {game,actor,enemy}=fixtures();
 applyStatus(enemy,"shield",1,actor.id,3);
 const base=game.damage(actor,enemy);
 const f=game.forecastAttack(actor,enemy);
 assert.equal(f.defenderHpAfter,Math.max(0,enemy.hp-Math.max(0,base-3)));
 game.setRandomSeed(1);
 game.click(actor.x,actor.y);game.click(enemy.x,enemy.y);
 assert.ok(game.lastCombatEvents[0].absorbed>=0);
 assert.ok(statusPower(enemy,"shield")<=3);
});
test("S1-2 status refresh never stacks, burn ticks once per next team phase and cannot kill",()=>{
 const {actor,enemy}=fixtures();
 assert.equal(applyStatus(enemy,"burn",1,actor.id,2),true);
 assert.equal(applyStatus(enemy,"burn",1,actor.id,2),true);
 assert.equal(enemy.statuses.length,1);
 enemy.hp=2;
 assert.equal(startStatusPhase(enemy,1),1);
 assert.equal(enemy.hp,1);
 finishStatusPhase(enemy,1);
 assert.equal(enemy.statuses.length,0);
 assert.equal(startStatusPhase(enemy,1),0);
});
test("S1-2 slow respects existing zero movement and reduces real path budget",()=>{
 const {game,actor}=fixtures();
 actor.x=1;actor.y=5;
 const base=game.reachable(actor);
 applyStatus(actor,"slow",2,actor.id);
 assert.equal(game.effectiveMove(actor),Math.max(1,actor.move-1));
 assert.ok(game.reachable(actor).size<=base.size);
 actor.move=0;
 assert.equal(game.effectiveMove(actor),0);
 assert.deepEqual([...game.reachable(actor).keys()],["1,5"]);
});
test("S1-2 weak armor/magic and marked chance use derived stats; shields refresh not stack",()=>{
 const {game,actor,enemy}=fixtures();
 const before=game.combatStats(enemy);
 const hit=game.hitChance(actor,enemy);
 applyStatus(enemy,"weakArmor",1,actor.id,2);
 applyStatus(enemy,"weakMagic",1,actor.id,2);
 applyStatus(enemy,"mark",1,actor.id,5);
 assert.equal(game.combatStats(enemy).physicalProtection,Math.max(0,before.physicalProtection-2));
 assert.equal(game.combatStats(enemy).magicalProtection,Math.max(0,before.magicalProtection-2));
 assert.equal(game.hitChance(actor,enemy),Math.min(100,hit+5));
 applyStatus(enemy,"shield",1,actor.id,3);
 applyStatus(enemy,"shield",1,actor.id,3);
 assert.equal(statusPower(enemy,"shield"),3);
 const impact=absorbDamage(enemy,2);
 assert.equal(impact.absorbed,2);
 assert.equal(statusPower(enemy,"shield"),1);
});
test("S1-2 dark magic status cast consumes charge once and respects target team",()=>{
 const {game,actor,ally,enemy}=fixtures();
 actor.classId="mage";actor.inventory[0]="fire-tome";actor.weapon=weaponFor("fire-tome");
 actor.weaponInstances[0]=null;actor.spellCharges["fire-tome"]=8;
 assert.equal(game.previewSupport(actor,ally,"burn"),null);
 assert.equal(game.previewSupport(actor,enemy,"burn").cost,1);
 game.click(actor.x,actor.y);
 assert.equal(game.commitSupport(actor,enemy,"burn"),true);
 assert.equal(actor.spellCharges["fire-tome"],7);
 assert.equal(statusPower(enemy,"burn"),2);
});

test("S1-2 illegal classes and forged action effects never spend charges or turn",()=>{
 const {game,actor,enemy}=fixtures();
 actor.weapon=weaponFor("fire-tome"); // forged weapon without equipped inventory
 actor.spellCharges["fire-tome"]=5;
 game.click(actor.x,actor.y);
 assert.equal(game.previewSupport(actor,enemy,"burn"),null);
 assert.equal(game.commitSupport(actor,enemy,"burn"),false);
 actor.inventory[0]="fire-tome";actor.weaponInstances[0]=null;
 assert.equal(game.previewSupport(actor,enemy,"burn"),null,"wrong class cannot cast dark");
 actor.classId="mage";
 assert.equal(game.previewSupport(actor,enemy,"invented-effect"),null);
 assert.equal(game.commitSupport(actor,enemy,"invented-effect"),false);
 assert.equal(actor.spellCharges["fire-tome"],5);
 assert.equal(actor.spent,false);
 assert.deepEqual(game.lastActionEvents,[]);
});
test("S1-2 burn ticks at enemy phase start once and does not alter other team's status",()=>{
 const {game,enemy,actor}=fixtures();
 enemy.hp=10;
 applyStatus(enemy,"burn",1,actor.id,2);
 applyStatus(actor,"slow",2,enemy.id,1);
 const before=actor.hp;
 assert.equal(game.beginEnemyTurn(),true);
 assert.equal(enemy.hp,8);
 assert.equal(actor.hp,before);
 assert.equal(statusPower(actor,"slow"),1);
 assert.equal(game.phase,"enemy");
});
