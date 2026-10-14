import test from "node:test";
import assert from "node:assert/strict";
import {Battle} from "../src/engine/battle.ts";
import {BASIC_KEYS,GROWTH_KEYS,deriveCombat,awardExperience} from "../src/engine/attributes.ts";
import {WEAPON_CATEGORIES,WEAPON_RANKS} from "../src/engine/equipmentTypes.ts";
import {CLASS_LIBRARY,classAllowsWeapon} from "../src/engine/classes.ts";
import {CHARACTER_LIBRARY,PERSONAL_PROFILES,createCharacter} from "../src/engine/characters.ts";
import {WEAPON_LIBRARY,weaponFor,initialLoadout,canWield,MAX_INVENTORY} from "../src/engine/weapons.ts";

const legacyClasses={
 a1:"sword",a2:"lancer",a3:"archer",a4:"mage",
 e1:"raider",e2:"lancer",e3:"archer",e4:"raider",e5:"raider",e6:"commander",
};
const expectedHP={a1:30,a2:36,a3:24,a4:23,e1:21,e2:26,e3:20,e4:21,e5:21,e6:38};
const expectedMove={a1:3,a2:2,a3:3,a4:3,e1:3,e2:2,e3:2,e4:3,e5:3,e6:2};
const expectedCombat={
  a1:[11,3,9],a2:[10,5,7],a3:[9,2,9],a4:[1,1,8],
  e1:[8,2,7],e2:[9,4,7],e3:[8,2,9],e4:[8,2,7],e5:[8,2,7],e6:[11,5,8],
};

test("F0: catalog retains all 16 weapons and defines the seven-category vocabulary",()=>{
 assert.deepEqual(WEAPON_CATEGORIES,["sword","lance","axe","bow","gauntlet","dark","white"]);
 assert.deepEqual(WEAPON_RANKS,["E","D","C","B","A","S","S+"]);
 assert.equal(Object.keys(WEAPON_LIBRARY).length,16);
 const actual=new Set(Object.values(WEAPON_LIBRARY).map(w=>w.category));
 assert.deepEqual([...actual].sort(),["sword","lance","axe","bow","dark"].sort(),
   "do not pretend gauntlets and white magic exist yet");
 for(const [id,definition] of Object.entries(WEAPON_LIBRARY)){
   assert.ok(WEAPON_CATEGORIES.includes(definition.category),id);
   assert.ok(WEAPON_RANKS.includes(definition.requiredRank),id);
   assert.equal(definition.kind,definition.category==="dark"?"magical":"physical",id);
   assert.ok(definition.minRange>0&&definition.maxRange>=definition.minRange,id);
   assert.deepEqual(weaponFor(id),definition);
 }
 assert.equal(WEAPON_LIBRARY["steel-sword"].requiredRank,"C");
});

test("F0: character and current class IDs are separate from the legacy role mirror",()=>{
 const game=new Battle();
 assert.equal(game.units.length,10);
 assert.equal(Object.keys(CHARACTER_LIBRARY).length,10);
 for(const unit of game.units){
   const definition=CHARACTER_LIBRARY[unit.id];
   assert.ok(definition);
   assert.equal(unit.characterId,unit.id);
   assert.equal(unit.name,definition.name);
   assert.equal(unit.classId,definition.startingClassId);
   assert.equal(unit.role,unit.classId);
   assert.equal(unit.classId,legacyClasses[unit.id]);
   assert.equal(unit.hp,expectedHP[unit.id]);
   assert.equal(unit.maxHp,expectedHP[unit.id]);
   assert.equal(unit.move,expectedMove[unit.id]);
   assert.equal(unit.level,unit.id==="e6"?4:1);
   assert.equal(unit.exp,0);
   assert.deepEqual(unit.inventory,initialLoadout(unit.characterId));
   assert.equal(unit.inventory.length,3);
   assert.ok(unit.inventory.length<=MAX_INVENTORY);
   assert.equal(unit.weapon.name,WEAPON_LIBRARY[unit.inventory[0]].name);
 }
});

test("F0: original attack, defense, attack speed, growths and loadout are unchanged",()=>{
 const game=new Battle();
 for(const unit of game.units){
   const [attack,defense,as]=expectedCombat[unit.id];
   const combat=game.combatStats(unit);
   // A1 starts on forest (defense +1), a2/a3/a4 terrain varies;
   // compare native character defense, not the terrain-adjusted result.
   assert.equal(unit.stats.defense,defense,unit.id);
   assert.equal(combat.attackSpeed,as,unit.id);
   if(unit.weapon.kind==="physical")assert.equal(combat.physicalAttack,attack,unit.id);
   else assert.equal(combat.magicalAttack,12,unit.id);
   for(const key of BASIC_KEYS)assert.ok(Number.isInteger(unit.stats[key]),unit.id+key);
   for(const key of GROWTH_KEYS)assert.ok(unit.growths[key]>=0&&unit.growths[key]<=100,unit.id+key);
 }
});

test("F0: personal stats/growths are independent mutable copies",()=>{
 const game=new Battle();
 const a=game.units.find(u=>u.id==="e1"),b=game.units.find(u=>u.id==="e4");
 const original=PERSONAL_PROFILES.marauder.stats.speed;
 a.stats.speed+=10;a.growths.speed=0;
 assert.equal(b.stats.speed,original);
 assert.equal(b.growths.speed,PERSONAL_PROFILES.marauder.growths.speed);
 assert.equal(PERSONAL_PROFILES.marauder.stats.speed,original);
 assert.deepEqual(createCharacter("a1").stats,game.units.find(u=>u.id==="a1").stats);
 a.weapon.might+=10;
 assert.equal(b.weapon.might,WEAPON_LIBRARY["iron-axe"].might);
 assert.equal(WEAPON_LIBRARY["iron-axe"].might,3);
 game.restart();
 assert.equal(game.units.find(u=>u.id==="e1").stats.speed,original);
});

test("F0: category permissions cover current classes and dormant seven-family templates",()=>{
 for(const [id,definition] of Object.entries(CLASS_LIBRARY)){
   assert.ok(definition.name&&definition.emblem&&definition.portrait,id);
   assert.ok(definition.weaponCategories.length>0,id);
   for(const category of WEAPON_CATEGORIES){
     assert.equal(classAllowsWeapon(id,category),definition.weaponCategories.includes(category),id+category);
   }
 }
 assert.equal(classAllowsWeapon("brawler","gauntlet"),true);
 assert.equal(classAllowsWeapon("acolyte","white"),true);
 assert.equal(classAllowsWeapon("mage","white"),false);
 assert.equal(canWield("sword","iron-sword"),true);
 assert.equal(canWield("sword","steel-sword"),true,
   "F0 rank metadata is informational, not enforced until P1");
 assert.equal(canWield("sword","long-bow"),false);
 assert.equal(canWield("commander","steel-sword"),true);
});

test("F0: battle equipment authority follows classId, never the legacy role",()=>{
 const game=new Battle(),actor=game.units.find(u=>u.id==="a1");
 game.click(actor.x,actor.y);
 actor.inventory.push("iron-bow");
 assert.equal(game.equipWeapon(actor,3),false);
 actor.classId="archer";
 assert.equal(actor.role,"sword","role is a legacy mirror, not authority");
 assert.equal(game.equipWeapon(actor,3),true);
 assert.equal(actor.weapon.category,"bow");
 assert.equal(game.equipWeapon(actor,0),false,"sword now forbidden to archer");
 actor.classId="sword";
 assert.equal(game.equipWeapon(actor,0),true);
 assert.equal(actor.weapon.category,"sword");
 assert.equal(actor.spent,false);
 assert.equal(game.log.length,0);
});

test("F0: switching class metadata does not swap character personal progression",()=>{
 const game=new Battle(),unit=game.units.find(u=>u.id==="a1");
 const before={stats:{...unit.stats},growths:{...unit.growths},level:unit.level};
 unit.classId="lancer";
 assert.deepEqual(unit.stats,before.stats);
 assert.deepEqual(unit.growths,before.growths);
 assert.equal(unit.level,before.level);
 assert.equal(unit.characterId,"a1");
 assert.equal(CLASS_LIBRARY.lancer.name,"枪卫");
 assert.ok(Object.keys(CLASS_LIBRARY.lancer.statModifiers).length===0,
  "F0 classes have no live stat modifiers; C1 implements their application");
});

test("F0: combat/growth helpers operate on personal data, and combat adds current weapon",()=>{
 const personal=createCharacter("a1");
 assert.equal("weapon" in personal,false);
 assert.equal(personal.stats.strength,7);
 const iron=weaponFor("iron-sword"),steel=weaponFor("steel-sword");
 assert.equal(deriveCombat({...personal,weapon:iron}).physicalAttack,11);
 assert.equal(deriveCombat({...personal,weapon:steel}).physicalAttack,15);
 const base=PERSONAL_PROFILES.blade.stats.strength;
 personal.growths.strength=100;personal.exp=90;
 assert.equal(awardExperience(personal,10,()=>0.5),1);
 assert.equal(personal.stats.strength,base+1);
 assert.equal(PERSONAL_PROFILES.blade.stats.strength,base);
});

test("F0: forecasts, attacks, equipment choices and enemy turns retain the same behavior",()=>{
 const game=new Battle(),actor=game.units.find(u=>u.id==="a1"),enemy=game.units.find(u=>u.id==="e1");
 actor.x=5;actor.y=1;enemy.x=6;enemy.y=1;
 const before=game.forecastAttack(actor,enemy);
 assert.equal(before.damage,9);
 game.click(5,1);
 assert.equal(game.equipWeapon(actor,1),true);
 assert.ok(game.forecastAttack(actor,enemy).damage>before.damage);
 assert.equal(game.equipWeapon(actor,0),true);
 assert.equal(game.forecastAttack(actor,enemy).damage,before.damage);
 game.click(6,1);
 assert.equal(actor.spent,true);
 assert.equal(game.lastCombatEvents[0].kind,"attack");
 game.endTurn();
 assert.equal(game.round,2);
});
