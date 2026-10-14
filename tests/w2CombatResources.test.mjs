import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {WEAPON_LIBRARY,weaponFor} from "../src/engine/weapons.ts";
import {
  BROKEN_MIGHT_PENALTY,BROKEN_HIT_PENALTY,
  initialWeaponInstances,initialSpellCharges,weaponResourceText,
  remainingSpellCharges,resourceWeapon,canUseArt,consumeArtDurability,
  repairWeapon,refillSpells
} from "../src/engine/combatResources.ts";

function duel(attackerId="a1",defenderId="e1",separation=1){
 const game=new Battle();
 const a=game.units.find(u=>u.id===attackerId);
 const d=game.units.find(u=>u.id===defenderId);
 a.x=5;a.y=1;d.x=5+separation;d.y=1;
 a.hp=a.maxHp=150;d.hp=d.maxHp=150;
 a.stats.luck=0;d.stats.luck=0;
 a.stats.dexterity=0;d.stats.dexterity=0;
 a.weapon.hit=1000;d.weapon.hit=1000;
 a.weapon.crit=0;d.weapon.crit=0;
 a.stats.speed=10;d.stats.speed=10;
 a.build=99;d.build=99;
 return {game,a,d};
}
function committed(game,a,d){
 game.click(a.x,a.y);game.click(d.x,d.y);
 return game.lastCombatEvents;
}

test("W2: each of 18 definitions has the correct exclusive resource kind",()=>{
 assert.equal(Object.keys(WEAPON_LIBRARY).length,18);
 for(const [id,w] of Object.entries(WEAPON_LIBRARY)){
   if(w.kind==="magical"){
     assert.ok(Number.isInteger(w.maxCharges)&&w.maxCharges>0,id);
     assert.equal(w.maxDurability,undefined,id);
   }else{
     assert.ok(Number.isInteger(w.maxDurability)&&w.maxDurability>0,id);
     assert.equal(w.maxCharges,undefined,id);
   }
 }
});

test("W2: inventory slots have independent instances, even for duplicated weapon IDs",()=>{
 const game=new Battle();
 const a=game.units.find(u=>u.id==="a1");
 const b=game.units.find(u=>u.id==="e6");
 assert.equal(a.weaponInstances.length,a.inventory.length);
 assert.equal(a.weaponInstances[0].durability,WEAPON_LIBRARY["iron-sword"].maxDurability);
 assert.notEqual(a.weaponInstances[0].instanceId,b.weaponInstances[0].instanceId);
 a.inventory.push("iron-sword");
 a.weaponInstances.push(initialWeaponInstances(a.id,["iron-sword"])[0]);
 a.weaponInstances[3].instanceId=a.id+":3:iron-sword";
 assert.notEqual(a.weaponInstances[3].instanceId,a.weaponInstances[0].instanceId);
 assert.equal(consumeArtDurability(a,3),true);
 assert.equal(a.weaponInstances[0].durability,21);
 assert.equal(a.weaponInstances[3].durability,24);
 assert.equal(b.weaponInstances[0].durability,24);
 game.restart();
 assert.equal(game.units.find(u=>u.id==="a1").weaponInstances[0].durability,24);
});

test("W2: regular melee, counter and follow-up spend zero physical durability",()=>{
 const {game,a,d}=duel();
 a.stats.speed=12;d.stats.speed=8;
 const initial=[a.weaponInstances[0].durability,d.weaponInstances[0].durability];
 const f=game.forecastAttack(a,d);
 assert.equal(f.followUp,"attacker");
 const events=committed(game,a,d);
 assert.deepEqual(events.map(e=>e.kind),["attack","counter","follow-up"]);
 assert.deepEqual([a.weaponInstances[0].durability,d.weaponInstances[0].durability],initial);
});

test("W2: art preview and cancelled movement never cost durability or actions",()=>{
 const {game,a,d}=duel();
 const instance=a.weaponInstances[0];
 const before=instance.durability;
 const preview=game.forecastAttack(a,d,game.basicArt.id);
 assert.equal(preview.damage,game.damage(a,d)+2);
 assert.equal(instance.durability,before);
 assert.equal(game.log.length,0);
 game.click(a.x,a.y);
 // No action is committed by selecting the actor or previewing an art.
 assert.equal(game.forecastAttack(a,d,game.basicArt.id).damage,preview.damage);
 assert.equal(instance.durability,before);
 assert.equal(game.cancelMove(),false);
 assert.equal(a.spent,false);
});

test("W2: a committed art costs durability only once even on a miss",()=>{
 const {game,a,d}=duel();
 a.weapon.hit=0;
 game.click(a.x,a.y);
 const before=a.weaponInstances[0].durability;
 assert.equal(game.useCombatArt(a,d,game.basicArt.id),true);
 assert.equal(a.weaponInstances[0].durability,before-3);
 assert.equal(game.lastCombatEvents[0].missed,true);
 assert.equal(a.spent,true);
 assert.equal(game.useCombatArt(a,d,game.basicArt.id),false);
 assert.equal(a.weaponInstances[0].durability,before-3);
 assert.equal(game.log.length,1);
});

test("W2: insufficient art durability refuses action; ordinary attack remains available",()=>{
 const {game,a,d}=duel();
 a.weaponInstances[0].durability=2;
 game.click(a.x,a.y);
 assert.equal(game.forecastAttack(a,d,game.basicArt.id),null);
 assert.equal(game.useCombatArt(a,d,game.basicArt.id),false);
 assert.equal(a.weaponInstances[0].durability,2);
 assert.equal(a.spent,false);
 assert.equal(game.forecastAttack(a,d)!==null,true);
 game.click(d.x,d.y);
 assert.equal(a.spent,true);
 assert.equal(a.weaponInstances[0].durability,2);
});

test("W2: breaking weapon on art uses intact damage for that combat, penalty starts next",()=>{
 const {game,a,d}=duel();
 a.weaponInstances[0].durability=3;
 const before=game.damage(a,d);
 game.click(a.x,a.y);
 const forecast=game.forecastAttack(a,d,game.basicArt.id);
 assert.equal(forecast.damage,before+2);
 assert.equal(game.useCombatArt(a,d,game.basicArt.id),true);
 assert.equal(game.lastCombatEvents[0].damage,forecast.damage);
 assert.equal(a.weaponInstances[0].durability,0);
 assert.equal(game.damage(a,d),before-BROKEN_MIGHT_PENALTY);
 const normal=game.combatStats(a).hit;
 assert.equal(normal,Math.max(0,a.weapon.hit-BROKEN_HIT_PENALTY));
 assert.match(weaponResourceText(a,0),/已损坏/);
 assert.equal(canUseArt(a,3),false);
});

test("W2: a broken weapon can still attack, counter and follow up",()=>{
 const {game,a,d}=duel();
 a.weaponInstances[0].durability=0;
 a.stats.speed=12;d.stats.speed=8;
 assert.equal(game.combatStats(a).physicalAttack,a.stats.strength+
   Math.max(0,a.weapon.might-BROKEN_MIGHT_PENALTY));
 assert.equal(game.forecastAttack(a,d).followUp,"attacker");
 const events=committed(game,a,d);
 assert.equal(events.length,3);
 assert.equal(events[2].kind,"follow-up");
 assert.equal(a.weaponInstances[0].durability,0);
});

test("W2: magical attacks consume one spell charge for the full encounter including follow-up",()=>{
 const {game,a,d}=duel("a4","e1");
 a.stats.speed=12;d.stats.speed=8;
 const start=a.spellCharges["fire-tome"];
 const forecast=game.forecastAttack(a,d);
 assert.equal(forecast.followUp,"attacker");
 assert.equal(a.spellCharges["fire-tome"],start);
 const events=committed(game,a,d);
 assert.deepEqual(events.map(e=>e.kind),["attack","counter","follow-up"]);
 assert.equal(a.spellCharges["fire-tome"],start-1);
 assert.equal(remainingSpellCharges(a),start-1);
 assert.equal(a.weaponInstances[0],null);
});

test("W2: one remaining magic charge still permits a follow-up but zero blocks attacking",()=>{
 const {game,a,d}=duel("a4","e1");
 a.stats.speed=12;d.stats.speed=8;
 a.spellCharges["fire-tome"]=1;
 const before=game.forecastAttack(a,d);
 assert.equal(before.followUp,"attacker");
 const events=committed(game,a,d);
 assert.equal(events.filter(e=>e.kind==="follow-up").length,1);
 assert.equal(a.spellCharges["fire-tome"],0);
 assert.equal(game.forecastAttack(a,d),null);
 assert.equal(game.inAttackRange(a,d),false);
});

test("W2: magic with zero charges cannot counter or defender follow-up",()=>{
 const {game,a,d}=duel();
 d.weapon=weaponFor("fire-tome");
 d.spellCharges["fire-tome"]=0;
 d.stats.speed=14;a.stats.speed=10;
 const preview=game.forecastAttack(a,d);
 assert.equal(preview.canCounter,false);
 assert.equal(preview.followUp,null);
 const events=committed(game,a,d);
 assert.deepEqual(events.map(e=>e.kind),["attack"]);
 assert.equal(d.spellCharges["fire-tome"],0);
});

test("W2: defender magic can counter and follow up for a total cost of one cast",()=>{
 const {game,a,d}=duel();
 d.weapon=weaponFor("fire-tome");
 d.spellCharges["fire-tome"]=1;
 d.stats.speed=14;a.stats.speed=10;
 d.weapon.hit=1000;
 const preview=game.forecastAttack(a,d);
 assert.equal(preview.followUp,"defender");
 const events=committed(game,a,d);
 assert.deepEqual(events.map(e=>e.kind),["attack","counter","follow-up"]);
 assert.equal(d.spellCharges["fire-tome"],0);
});

test("W2: a missed magical cast still spends one charge",()=>{
 const {game,a,d}=duel("a4","e1");
 a.weapon.hit=0;
 const before=a.spellCharges["fire-tome"];
 const events=committed(game,a,d);
 assert.equal(events[0].missed,true);
 assert.equal(a.spellCharges["fire-tome"],before-1);
});

test("W2: distinct spells maintain distinct charges across equipment switches",()=>{
 const {game,a,d}=duel("a4","e1",2);
 game.click(a.x,a.y);
 const startFire=a.spellCharges["fire-tome"];
 const startThunder=a.spellCharges["thunder-tome"];
 assert.equal(game.equipWeapon(a,1),true);
 assert.equal(a.weapon.name,"雷电术");
 assert.equal(game.forecastAttack(a,d)!==null,true);
 game.click(d.x,d.y);
 assert.equal(a.spellCharges["fire-tome"],startFire);
 assert.equal(a.spellCharges["thunder-tome"],startThunder-1);
 assert.equal(a.spellCharges["wind-tome"],8);
 const restored=initialSpellCharges(a.inventory);
 assert.equal(restored["fire-tome"],startFire);
 assert.equal(restored["thunder-tome"],startThunder);
 refillSpells(a.spellCharges,a.inventory);
 assert.equal(a.spellCharges["thunder-tome"],startThunder);
});

test("W2: white offensive magic shares the same charge rules and magical damage",()=>{
 const {game,a,d}=duel();
 a.classId="acolyte";
 a.weapon=weaponFor("light-bolt");
 a.weapon.hit=1000;
 a.stats.magic=10;a.stats.strength=1;
 d.stats.defense=20;d.stats.resistance=2;
 a.stats.speed=12;d.stats.speed=8;
 a.spellCharges["light-bolt"]=1;
 assert.equal(game.damage(a,d),12,"C1 acolyte adds 1 magic while the base stat remains 10");
 assert.equal(game.forecastAttack(a,d).followUp,"attacker");
 const events=committed(game,a,d);
 assert.equal(events.length,3);
 assert.equal(events[0].damage,12);
 assert.equal(a.spellCharges["light-bolt"],0);
 assert.equal(game.forecastAttack(a,d),null);
});

test("W2: forecast, equipping and reversible movement preserve charges and durability",()=>{
 const {game,a,d}=duel("a4","e1");
 const before=JSON.stringify({weaponInstances:a.weaponInstances,spellCharges:a.spellCharges});
 const state=JSON.stringify(game.units);
 game.forecastAttack(a,d);
 assert.equal(JSON.stringify(game.units),state);
 game.click(a.x,a.y);
 assert.equal(game.equipWeapon(a,1),true);
 assert.equal(game.equipWeapon(a,0),true);
 assert.equal(JSON.stringify({weaponInstances:a.weaponInstances,spellCharges:a.spellCharges}),before);
 assert.equal(a.spent,false);
 assert.equal(game.log.length,0);
});

test("W2: per-instance repairs do not heal other identical weapons",()=>{
 const {game,a}=duel();
 const item=a.weaponInstances[0];
 item.durability=5;
 assert.equal(repairWeapon(item,10),10);
 assert.equal(item.durability,15);
 assert.equal(repairWeapon(item,100),item.maxDurability-15);
 assert.equal(item.durability,item.maxDurability);
 assert.equal(repairWeapon(item,0),0);
 assert.equal(game.units.find(u=>u.id==="e6").weaponInstances[0].durability,24);
});

test("W2: inspector and weapon picker expose remaining resources",()=>{
 const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
 const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 assert.match(main,/weaponResourceText\(selected,index\)/);
 assert.match(main,/weaponResourceText\(selected,selected\.equippedIndex\)/);
 assert.match(board,/weaponResourceText\(actor,index\)/);
 const {a}=duel("a4","e1");
 assert.equal(weaponResourceText(a,0),"次数 8/8");
});
